// router/gradeCatalogRoutes.js
//
// Betygskataloger via Scrive eSign (MILESTONE-3-CHECKLIST item #19).
// Admin/systemadmin laddar upp en PDF i taget och skickar den för digital
// signering till läraren. Status hämtas via Scrive-callback och/eller manuell
// refresh. När dokumentet är signerat (`closed`) låses katalogen.
import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import GradeCatalog from "../models/GradeCatalog.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Notification from "../models/Notification.js";
import NOTIFICATION_TYPES from "../controllers/notificationTypes.js";
import { authenticateUser } from "../controllers/authController.js";
import { hasRole } from "../middleware/auth.js";
import * as scriveClient from "../services/scriveClient.js";
import logger from "../utils/logger.js";

const router = express.Router();

const ADMIN_ROLES = ["admin", "systemadmin"];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const memupload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Filen är för stor. Max 10 MB." });
    }
    return res.status(400).json({ error: `Uppladdningsfel: ${err.message}` });
  }
  next(err);
}

const isValidObjectId = (value) => value && mongoose.Types.ObjectId.isValid(value);

const isSentForSigning = (catalog) =>
  catalog.scriveDocumentId && scriveClient.SCRIVE_TERMINAL_STATUSES.includes(catalog.status);

/**
 * Apply a Scrive Document JSON to a catalog (status mapping + lock on closed).
 * Does not save – the caller decides when to persist.
 */
function applyScriveDocument(catalog, doc) {
  const scriveStatus = doc?.status;
  if (!scriveStatus) return;

  catalog.scriveStatus = scriveStatus;
  catalog.status = scriveClient.mapScriveStatus(scriveStatus);
  catalog.errorMessage = undefined;

  if (scriveStatus === "closed") {
    catalog.locked = true;
    catalog.lockedAt = new Date();
    catalog.signedAt = catalog.signedAt || new Date();
  }
}

/**
 * Mark a catalog as failed and return a 502 with an admin-facing message.
 * The PDF is preserved so the catalog can be re-sent later.
 */
async function failCatalog(res, catalog, message, err) {
  if (err) logger.error({ err, catalogId: catalog._id }, message);
  else logger.error({ catalogId: catalog._id }, message);

  catalog.status = "failed";
  catalog.errorMessage = message;
  await catalog.save().catch((saveErr) => logger.error({ err: saveErr }, "Failed to persist catalog failure"));
  return res.status(502).json({ error: message });
}

const toResponseCatalog = (catalog) => {
  const obj = catalog.toObject();
  delete obj.pdf;
  return obj;
};

// ─── List cataloger (utan PDF-bytes) ────────────────────────────────────────
router.get("/grade-catalogs", authenticateUser, hasRole(ADMIN_ROLES), async (req, res) => {
  try {
    const catalogs = await GradeCatalog.find().select("-pdf").sort({ createdAt: -1 }).limit(200).lean();
    return res.status(200).json(catalogs);
  } catch (err) {
    logger.error({ err }, "Error listing grade catalogs");
    return res.status(500).json({ error: "Kunde inte hämta betygskatalogerna." });
  }
});

// ─── Lärarens egna kataloger (utan PDF-bytes) ──────────────────────────────
router.get("/grade-catalogs/my", authenticateUser, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ userId: req.user.userId }).lean();
    if (!teacher) {
      return res.status(404).json({ error: "Ingen lärarprofil hittades." });
    }
    const catalogs = await GradeCatalog.find({ teacherId: teacher._id })
      .select("-pdf")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    return res.status(200).json(catalogs);
  } catch (err) {
    logger.error({ err }, "Error listing teacher grade catalogs");
    return res.status(500).json({ error: "Kunde inte hämta betygskatalogerna." });
  }
});

// ─── Hämta en katalog (inkl. PDF som base64) ────────────────────────────────
router.get("/grade-catalogs/:id", authenticateUser, async (req, res) => {
  try {
    const catalog = await GradeCatalog.findById(req.params.id);
    if (!catalog) {
      return res.status(404).json({ error: "Betygskatalogen hittades inte." });
    }
    const userRoles = req.user.roles || (req.user.role ? [req.user.role] : []);
    const isAdminUser = userRoles.some((r) => ADMIN_ROLES.includes(r));
    let isOwner = false;
    if (!isAdminUser) {
      const teacher = await Teacher.findOne({ userId: req.user.userId }).lean();
      isOwner = Boolean(teacher && String(catalog.teacherId) === String(teacher._id));
      if (!isOwner) {
        return res.status(403).json({ error: "Åtkast nekad." });
      }
    }
    const obj = catalog.toObject();
    obj.pdfData = obj.pdf && obj.pdf.length ? obj.pdf.toString("base64") : null;
    delete obj.pdf;
    return res.status(200).json(obj);
  } catch (err) {
    logger.error({ err }, "Error fetching grade catalog");
    return res.status(500).json({ error: "Kunde inte hämta betygskatalogen." });
  }
});

// ─── Ladda upp en PDF (en i taget) ──────────────────────────────────────────
router.post(
  "/grade-catalogs",
  authenticateUser,
  hasRole(ADMIN_ROLES),
  memupload.single("file"),
  handleMulterError,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Ingen PDF har laddats upp." });
      }
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext !== ".pdf") {
        return res.status(400).json({ error: "Endast PDF-filer är tillåtna." });
      }
      if (!req.file.buffer || req.file.buffer.length === 0) {
        return res.status(400).json({ error: "Den uppladdade filen är tom." });
      }

      const { studentId, courseId, courseName, enrollmentId, teacherEmail, teacherName } = req.body;

      let studentName;
      if (isValidObjectId(studentId)) {
        const student = await Student.findById(studentId).select("name");
        if (student) studentName = student.name;
      }

      const catalog = await GradeCatalog.create({
        title: path.basename(req.file.originalname, path.extname(req.file.originalname)),
        filename: req.file.originalname,
        pdf: req.file.buffer,
        pdfContentType: "application/pdf",
        studentId: isValidObjectId(studentId) ? studentId : undefined,
        studentName,
        courseId: isValidObjectId(courseId) ? courseId : undefined,
        courseName: courseName || undefined,
        enrollmentId: isValidObjectId(enrollmentId) ? enrollmentId : undefined,
        teacherEmail: teacherEmail || undefined,
        teacherName: teacherName || undefined,
        status: "uploaded",
        uploadedById: req.user?.userId,
        uploadedByRole: req.user?.role,
      });

      return res.status(201).json(toResponseCatalog(catalog));
    } catch (err) {
      logger.error({ err }, "Error uploading grade catalog");
      return res.status(500).json({ error: "Kunde inte ladda upp betygskatalogen." });
    }
  }
);

// ─── Skicka för signering (Scrive) ──────────────────────────────────────────
router.post("/grade-catalogs/:id/send", authenticateUser, hasRole(ADMIN_ROLES), async (req, res) => {
  let catalog;
  try {
    catalog = await GradeCatalog.findById(req.params.id);
  } catch (err) {
    return res.status(400).json({ error: "Ogiltigt katalog-ID." });
  }
  if (!catalog) {
    return res.status(404).json({ error: "Betygskatalogen hittades inte." });
  }
  if (isSentForSigning(catalog)) {
    return res
      .status(409)
      .json({ error: "Katalogen har redan skickats för signering och kan inte skickas igen." });
  }
  if (!catalog.pdf || catalog.pdf.length === 0) {
    return res.status(400).json({ error: "Katalogen saknar PDF och kan inte skickas." });
  }

  // Mottagare (läraren som ska signera): angiven vid uppladdning/skick, annars
  // hämtas läraren från studenten.
  let teacherEmail = req.body?.teacherEmail || catalog.teacherEmail;
  let teacherName = req.body?.teacherName || catalog.teacherName;
  let teacherRecord = null;

  if (catalog.teacherId) {
    teacherRecord = await Teacher.findById(catalog.teacherId).catch(() => null);
  } else if (catalog.studentId) {
    const student = await Student.findById(catalog.studentId).select("teacherId name").catch(() => null);
    if (student?.teacherId) {
      teacherRecord = await Teacher.findById(student.teacherId).catch(() => null);
    }
  }

  if (teacherRecord) {
    teacherEmail = teacherEmail || teacherRecord.email;
    teacherName = teacherName || teacherRecord.name;
    if (!catalog.teacherId) catalog.teacherId = teacherRecord._id;
  }

  if (!teacherEmail) {
    return res
      .status(400)
      .json({ error: "Ingen lärare/e-post för signering angiven. Ange lärarens e-postadress." });
  }

  if (!scriveClient.isScriveConfigured()) {
    return res
      .status(503)
      .json({ error: "Scrive är inte konfigurerat. Kontrollera SCRIVE_* inställningarna." });
  }

  const firstName = (teacherName || "").trim().split(" ")[0] || "Lärare";
  const lastName = (teacherName || "").trim().split(" ").slice(1).join(" ") || "";

  const documentJson = {
    title: catalog.title || `Betygskatalog ${catalog.studentName || catalog.filename}`,
    parties: [
      {
        signatory_role: "signing_party",
        first_name: firstName,
        last_name: lastName,
        email: teacherEmail,
        delivery_method: "email",
      },
    ],
  };
  const callbackUrl = process.env.SCRIVE_CALLBACK_URL;
  if (callbackUrl) {
    documentJson.api_callback_url = callbackUrl;
  }

  let scriveDocument;
  try {
    scriveDocument = await scriveClient.createDocument({
      fileBuffer: catalog.pdf,
      filename: catalog.filename,
    });
  } catch (err) {
    return await failCatalog(res, catalog, "Kunde inte skapa dokumentet i Scrive.", err);
  }

  const documentId = scriveDocument?.id;
  if (!documentId) {
    return await failCatalog(res, catalog, "Scrive returnerade inget dokument-ID.", null);
  }

  catalog.scriveDocumentId = String(documentId);
  catalog.status = "sending";
  await catalog.save();

  try {
    await scriveClient.updateDocument({ documentId, documentJson });
  } catch (err) {
    return await failCatalog(res, catalog, "Kunde inte uppdatera dokumentet i Scrive.", err);
  }

  let started;
  try {
    started = await scriveClient.startSigning({ documentId });
  } catch (err) {
    return await failCatalog(res, catalog, "Kunde inte starta signeringen i Scrive.", err);
  }

  catalog.scriveStatus = started?.status || "pending";
  catalog.status = "pending";
  catalog.sentById = req.user?.userId;
  catalog.sentAt = new Date();
  catalog.teacherEmail = teacherEmail;
  catalog.teacherName = teacherName || catalog.teacherName;
  catalog.errorMessage = undefined;
  await catalog.save();

  // Notis till läraren (och admins) – samma mönster som grade lock/unlock.
  try {
    const teacherUserId = teacherRecord?.userId || undefined;
    await Notification.create({
      type: NOTIFICATION_TYPES.SIGNING_REQUIRED,
      message: `Betygskatalog för ${catalog.studentName || catalog.filename} har skickats för signering. Vänligen signera i Scrive.`,
      teacher: catalog.teacherId || undefined,
      createdByAdmin: req.user?.userId,
      meta: {
        studentId: catalog.studentId || undefined,
        courseId: catalog.courseId || undefined,
        teacherId: teacherUserId,
        url: "/signering",
      },
      resolved: false,
    });
  } catch (err) {
    logger.error({ err }, "Error creating SIGNING_REQUIRED notification");
  }

  return res.status(200).json(toResponseCatalog(catalog));
});

// ─── Uppdatera status manuellt (poll Scrive) ─────────────────────────────────
router.post("/grade-catalogs/:id/refresh", authenticateUser, hasRole(ADMIN_ROLES), async (req, res) => {
  let catalog;
  try {
    catalog = await GradeCatalog.findById(req.params.id);
  } catch (err) {
    return res.status(400).json({ error: "Ogiltigt katalog-ID." });
  }
  if (!catalog) {
    return res.status(404).json({ error: "Betygskatalogen hittades inte." });
  }
  if (!catalog.scriveDocumentId) {
    return res.status(400).json({ error: "Katalogen har inte skickats till Scrive ännu." });
  }
  if (!scriveClient.isScriveConfigured()) {
    return res
      .status(503)
      .json({ error: "Scrive är inte konfigurerat. Kontrollera SCRIVE_* inställningarna." });
  }

  let doc;
  try {
    doc = await scriveClient.getDocument({ documentId: catalog.scriveDocumentId });
  } catch (err) {
    logger.error({ err, catalogId: catalog._id }, "Failed to refresh Scrive status");
    return res.status(502).json({ error: "Kunde inte hämta status från Scrive." });
  }

  applyScriveDocument(catalog, doc);
  if (doc?.status === "closed" && catalog.scriveDocumentId) {
    try {
      const signedBuffer = await scriveClient.getSignedDocumentFile({
        documentId: catalog.scriveDocumentId,
      });
      if (signedBuffer && signedBuffer.length > 0) {
        catalog.pdf = signedBuffer;
      }
    } catch (fetchErr) {
      logger.warn({ err: fetchErr, catalogId: catalog._id }, "Failed to fetch signed PDF from Scrive");
    }
  }
  await catalog.save();
  return res.status(200).json(toResponseCatalog(catalog));
});

// ─── Scrive webhook-callback (ingen auth – Scrive skickar dokument-status) ───
// Ops-notis: skydda URL:en genom att endast exponera den publikt vid behov;
// Scrive kräver en 2xx för att inte försöka igen.
router.post("/grade-catalogs/scrive-callback", async (req, res) => {
  try {
    const documentId = req.body?.document_id;
    if (!documentId) {
      return res.status(400).json({ error: "Missing document_id" });
    }

    const catalog = await GradeCatalog.findOne({ scriveDocumentId: String(documentId) });
    if (!catalog) {
      logger.warn({ documentId }, "Scrive callback for unknown document");
      return res.status(200).json({ ok: true });
    }

    let doc = req.body?.document_json;
    if (typeof doc === "string") {
      try {
        doc = JSON.parse(doc);
      } catch (err) {
        logger.error({ err, documentId }, "Scrive callback carried invalid document_json");
        return res.status(400).json({ error: "Invalid document_json" });
      }
    }

    if (doc?.status) {
      applyScriveDocument(catalog, doc);
      if (doc.status === "closed" && catalog.scriveDocumentId && scriveClient.isScriveConfigured()) {
        try {
          const signedBuffer = await scriveClient.getSignedDocumentFile({
            documentId: catalog.scriveDocumentId,
          });
          if (signedBuffer && signedBuffer.length > 0) {
            catalog.pdf = signedBuffer;
          }
        } catch (fetchErr) {
          logger.warn({ err: fetchErr, catalogId: catalog._id }, "Failed to fetch signed PDF from Scrive callback");
        }
      }
      await catalog.save();
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error handling Scrive callback");
    return res.status(500).json({ error: "Callback processing failed" });
  }
});

export default router;
