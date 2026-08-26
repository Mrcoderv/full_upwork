import express from "express";
import request from "supertest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/controllers/authController.js", () => ({
  authenticateUser: (req, res, next) => {
    const role = req.headers["x-user-role"] || "teacher";
    req.user = { role, userId: "user123", name: "TestUser" };
    next();
  },
}));

vi.mock("../../src/models/GradeCatalog.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../../src/models/Student.js", () => ({
  __esModule: true,
  default: {
    findById: vi.fn(),
  },
}));

vi.mock("../../src/models/Teacher.js", () => ({
  __esModule: true,
  default: {
    findById: vi.fn(),
  },
}));

vi.mock("../../src/models/Notification.js", () => ({
  __esModule: true,
  default: {
    create: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock("../../src/services/scriveClient.js", () => ({
  isScriveConfigured: vi.fn(),
  SCRIVE_TERMINAL_STATUSES: ["pending", "closed", "canceled", "timedout", "rejected", "document_error"],
  mapScriveStatus: vi.fn((status) => status),
  createDocument: vi.fn(),
  setDocumentFile: vi.fn(),
  updateDocument: vi.fn(),
  startSigning: vi.fn(),
  getDocument: vi.fn(),
  getPersonalToken: vi.fn(),
}));

import gradeCatalogRoutes from "../../src/router/gradeCatalogRoutes.js";
import GradeCatalog from "../../src/models/GradeCatalog.js";
import Student from "../../src/models/Student.js";
import Teacher from "../../src/models/Teacher.js";
import Notification from "../../src/models/Notification.js";
import * as scriveClient from "../../src/services/scriveClient.js";

const createQueryChain = (resultOrFactory) => {
  const chain = {
    select: vi.fn(() => chain),
    sort: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    lean: vi.fn(() => {
      const value = typeof resultOrFactory === "function" ? resultOrFactory() : resultOrFactory;
      return Promise.resolve(value);
    }),
  };
  return chain;
};

const createCatalogDoc = (overrides = {}) => {
  const doc = {
    _id: "catalog-1",
    title: "Betygskatalog HT25",
    filename: "katalog.pdf",
    pdf: Buffer.from("%PDF-1.4 test"),
    pdfContentType: "application/pdf",
    studentId: null,
    studentName: "Anna",
    courseId: null,
    courseName: "Matematik",
    enrollmentId: null,
    teacherId: null,
    teacherName: null,
    teacherEmail: null,
    scriveDocumentId: null,
    scriveStatus: null,
    status: "uploaded",
    errorMessage: undefined,
    uploadedById: "user123",
    uploadedByRole: "admin",
    sentById: null,
    sentAt: null,
    signedAt: null,
    locked: false,
    lockedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    save: vi.fn().mockResolvedValue(true),
    toObject: vi.fn(function toObject() {
      const { save, toObject, ...rest } = this;
      return { ...rest };
    }),
    ...overrides,
  };
  return doc;
};

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", gradeCatalogRoutes);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SCRIVE_CALLBACK_URL", "https://example.com/api/grade-catalogs/scrive-callback");
  scriveClient.isScriveConfigured.mockReturnValue(true);
  scriveClient.createDocument.mockResolvedValue({ id: "42" });
  scriveClient.updateDocument.mockResolvedValue({});
  scriveClient.startSigning.mockResolvedValue({ status: "pending" });
  scriveClient.getDocument.mockResolvedValue({ status: "closed" });
  Notification.create.mockResolvedValue({ _id: "note-1" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/grade-catalogs", () => {
  it("lists catalogs without the PDF buffer", async () => {
    GradeCatalog.find.mockReturnValue(createQueryChain([{ _id: "c1", title: "A" }]));

    const res = await request(app).get("/api/grade-catalogs").set("x-user-role", "admin");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ _id: "c1", title: "A" }]);
    expect(GradeCatalog.find().select).toHaveBeenCalledWith("-pdf");
    expect(GradeCatalog.find().sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it("rejects non-admin roles", async () => {
    const res = await request(app).get("/api/grade-catalogs").set("x-user-role", "teacher");
    expect(res.status).toBe(403);
  });

  it("returns 500 on database error", async () => {
    GradeCatalog.find.mockReturnValue(createQueryChain(() => Promise.reject(new Error("boom"))));
    const res = await request(app).get("/api/grade-catalogs").set("x-user-role", "admin");
    expect(res.status).toBe(500);
  });
});

describe("POST /api/grade-catalogs (upload)", () => {
  it("returns 400 when no file is uploaded", async () => {
    const res = await request(app).post("/api/grade-catalogs").set("x-user-role", "admin");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("PDF");
  });

  it("returns 400 for non-PDF files", async () => {
    const res = await request(app)
      .post("/api/grade-catalogs")
      .set("x-user-role", "admin")
      .attach("file", Buffer.from("xlsx-data"), { filename: "katalog.xlsx" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Endast PDF-filer är tillåtna.");
  });

  it("creates a catalog and resolves the student name", async () => {
    const studentId = "507f1f77bcf86cd799439011";
    Student.findById.mockReturnValue({ select: vi.fn().mockResolvedValue({ name: "Anna", _id: studentId }) });
    const saved = createCatalogDoc({ studentId, studentName: "Anna" });
    GradeCatalog.create.mockResolvedValue(saved);

    const res = await request(app)
      .post("/api/grade-catalogs")
      .set("x-user-role", "admin")
      .field("studentId", studentId)
      .field("courseName", "Matematik")
      .attach("file", Buffer.from("%PDF-1.4"), { filename: "katalog.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(201);
    expect(GradeCatalog.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "katalog", filename: "katalog.pdf", status: "uploaded" })
    );
    expect(res.body.studentName).toBe("Anna");
    expect(res.body.pdf).toBeUndefined();
  });

  it("returns 500 on upload error", async () => {
    GradeCatalog.create.mockRejectedValue(new Error("db down"));
    const res = await request(app)
      .post("/api/grade-catalogs")
      .set("x-user-role", "admin")
      .attach("file", Buffer.from("%PDF-1.4"), { filename: "katalog.pdf" });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/grade-catalogs/:id/send", () => {
  it("returns 400 for invalid id", async () => {
    GradeCatalog.findById.mockRejectedValue(new Error("invalid"));
    const res = await request(app).post("/api/grade-catalogs/not-an-id/send").set("x-user-role", "admin");
    expect(res.status).toBe(400);
  });

  it("returns 404 when the catalog is missing", async () => {
    GradeCatalog.findById.mockResolvedValue(null);
    const res = await request(app).post("/api/grade-catalogs/c1/send").set("x-user-role", "admin");
    expect(res.status).toBe(404);
  });

  it("returns 409 when already sent for signing", async () => {
    GradeCatalog.findById.mockResolvedValue(
      createCatalogDoc({ scriveDocumentId: "42", status: "pending" })
    );
    const res = await request(app).post("/api/grade-catalogs/c1/send").set("x-user-role", "admin");
    expect(res.status).toBe(409);
  });

  it("returns 400 when the catalog has no PDF", async () => {
    GradeCatalog.findById.mockResolvedValue(createCatalogDoc({ pdf: null }));
    const res = await request(app).post("/api/grade-catalogs/c1/send").set("x-user-role", "admin");
    expect(res.status).toBe(400);
  });

  it("returns 400 when no signatory email is available", async () => {
    GradeCatalog.findById.mockResolvedValue(createCatalogDoc({ studentId: "stu1", teacherEmail: null }));
    Student.findById.mockReturnValue({ select: vi.fn().mockResolvedValue({ teacherId: null }) });
    Teacher.findById.mockResolvedValue(null);
    const res = await request(app).post("/api/grade-catalogs/c1/send").set("x-user-role", "admin");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("e-post");
  });

  it("returns 503 when Scrive is not configured", async () => {
    scriveClient.isScriveConfigured.mockReturnValue(false);
    GradeCatalog.findById.mockResolvedValue(createCatalogDoc({ teacherEmail: "l@e.se" }));
    const res = await request(app).post("/api/grade-catalogs/c1/send").set("x-user-role", "admin");
    expect(res.status).toBe(503);
  });

  it("marks the catalog as failed and returns 502 when Scrive create fails", async () => {
    scriveClient.createDocument.mockRejectedValue(new Error("http 400"));
    const doc = createCatalogDoc({ teacherEmail: "l@e.se" });
    GradeCatalog.findById.mockResolvedValue(doc);

    const res = await request(app).post("/api/grade-catalogs/c1/send").set("x-user-role", "admin");

    expect(res.status).toBe(502);
    expect(doc.status).toBe("failed");
    expect(doc.errorMessage).toContain("Scrive");
    expect(doc.save).toHaveBeenCalled();
  });

  it("marks the catalog as failed when startSigning fails", async () => {
    scriveClient.startSigning.mockRejectedValue(new Error("invalid email"));
    const doc = createCatalogDoc({ teacherEmail: "l@e.se" });
    GradeCatalog.findById.mockResolvedValue(doc);

    const res = await request(app).post("/api/grade-catalogs/c1/send").set("x-user-role", "admin");

    expect(res.status).toBe(502);
    expect(doc.status).toBe("failed");
    expect(scriveClient.updateDocument).toHaveBeenCalled();
  });

  it("sends the catalog, wires the callback URL and creates a SIGNING_REQUIRED notification", async () => {
    const doc = createCatalogDoc({ teacherEmail: "l@e.se", teacherName: "Anna Lärare" });
    GradeCatalog.findById.mockResolvedValue(doc);

    const res = await request(app).post("/api/grade-catalogs/c1/send").set("x-user-role", "admin");

    expect(res.status).toBe(200);
    expect(scriveClient.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ fileBuffer: doc.pdf, filename: "katalog.pdf" })
    );
    expect(scriveClient.updateDocument).toHaveBeenCalledWith({
      documentId: "42",
      documentJson: expect.objectContaining({
        title: "Betygskatalog HT25",
        api_callback_url: "https://example.com/api/grade-catalogs/scrive-callback",
        parties: [
          expect.objectContaining({
            signatory_role: "signing_party",
            first_name: "Anna",
            last_name: "Lärare",
            email: "l@e.se",
            delivery_method: "email",
          }),
        ],
      }),
    });
    expect(scriveClient.startSigning).toHaveBeenCalledWith({ documentId: "42" });

    expect(Notification.create).toHaveBeenCalledTimes(1);
    const notif = Notification.create.mock.calls[0][0];
    expect(notif.type).toBe("signing_required");
    expect(notif.message).toContain("Anna");
    expect(notif.meta.url).toBe("/signering");
    expect(notif.resolved).toBe(false);

    expect(doc.status).toBe("pending");
    expect(doc.scriveStatus).toBe("pending");
    expect(doc.sentById).toBe("user123");
    expect(doc.sentAt).toBeInstanceOf(Date);
    expect(res.body.status).toBe("pending");
    expect(res.body.pdf).toBeUndefined();
  });

  it("omits the callback URL when SCRIVE_CALLBACK_URL is unset", async () => {
    vi.unstubAllEnvs();
    const doc = createCatalogDoc({ teacherEmail: "l@e.se" });
    GradeCatalog.findById.mockResolvedValue(doc);

    await request(app).post("/api/grade-catalogs/c1/send").set("x-user-role", "admin");

    const { documentJson } = scriveClient.updateDocument.mock.calls[0][0];
    expect(documentJson.api_callback_url).toBeUndefined();
  });

  it("resolves the teacher from the student when no email was given", async () => {
    const doc = createCatalogDoc({ studentId: "stu1", teacherEmail: null, teacherName: null });
    GradeCatalog.findById.mockResolvedValue(doc);
    Student.findById.mockReturnValue({ select: vi.fn().mockResolvedValue({ teacherId: "tea1" }) });
    Teacher.findById.mockResolvedValue({ _id: "tea1", email: "teacher@e.se", name: "Kalle Lärare" });

    const res = await request(app).post("/api/grade-catalogs/c1/send").set("x-user-role", "admin");

    expect(res.status).toBe(200);
    expect(Teacher.findById).toHaveBeenCalledWith("tea1");
    expect(res.body.teacherEmail).toBe("teacher@e.se");
    expect(res.body.teacherName).toBe("Kalle Lärare");
    expect(doc.teacherId).toBe("tea1");
  });
});

describe("POST /api/grade-catalogs/:id/refresh", () => {
  it("returns 400 for invalid id", async () => {
    GradeCatalog.findById.mockRejectedValue(new Error("invalid"));
    const res = await request(app).post("/api/grade-catalogs/bad-id/refresh").set("x-user-role", "admin");
    expect(res.status).toBe(400);
  });

  it("returns 404 when the catalog is missing", async () => {
    GradeCatalog.findById.mockResolvedValue(null);
    const res = await request(app).post("/api/grade-catalogs/c1/refresh").set("x-user-role", "admin");
    expect(res.status).toBe(404);
  });

  it("returns 400 when not sent to Scrive yet", async () => {
    GradeCatalog.findById.mockResolvedValue(createCatalogDoc());
    const res = await request(app).post("/api/grade-catalogs/c1/refresh").set("x-user-role", "admin");
    expect(res.status).toBe(400);
  });

  it("returns 503 when Scrive is not configured", async () => {
    scriveClient.isScriveConfigured.mockReturnValue(false);
    GradeCatalog.findById.mockResolvedValue(createCatalogDoc({ scriveDocumentId: "42" }));
    const res = await request(app).post("/api/grade-catalogs/c1/refresh").set("x-user-role", "admin");
    expect(res.status).toBe(503);
  });

  it("returns 502 when Scrive is unreachable", async () => {
    scriveClient.getDocument.mockRejectedValue(new Error("network"));
    GradeCatalog.findById.mockResolvedValue(createCatalogDoc({ scriveDocumentId: "42" }));
    const res = await request(app).post("/api/grade-catalogs/c1/refresh").set("x-user-role", "admin");
    expect(res.status).toBe(502);
  });

  it("locks the catalog when Scrive reports closed", async () => {
    scriveClient.getDocument.mockResolvedValue({ status: "closed" });
    const doc = createCatalogDoc({ scriveDocumentId: "42", status: "pending" });
    GradeCatalog.findById.mockResolvedValue(doc);

    const res = await request(app).post("/api/grade-catalogs/c1/refresh").set("x-user-role", "admin");

    expect(res.status).toBe(200);
    expect(doc.status).toBe("closed");
    expect(doc.locked).toBe(true);
    expect(doc.lockedAt).toBeInstanceOf(Date);
    expect(doc.signedAt).toBeInstanceOf(Date);
    expect(res.body.locked).toBe(true);
  });
});

describe("POST /api/grade-catalogs/scrive-callback", () => {
  it("returns 400 without document_id", async () => {
    const res = await request(app).post("/api/grade-catalogs/scrive-callback").send({});
    expect(res.status).toBe(400);
  });

  it("acknowledges callbacks for unknown documents", async () => {
    GradeCatalog.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/grade-catalogs/scrive-callback")
      .send({ document_id: "999" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("updates status and locks the catalog on closed", async () => {
    const doc = createCatalogDoc({ scriveDocumentId: "42", status: "pending" });
    GradeCatalog.findOne.mockResolvedValue(doc);

    const res = await request(app)
      .post("/api/grade-catalogs/scrive-callback")
      .send({
        document_id: "42",
        document_signed_and_sealed: "true",
        document_json: JSON.stringify({ id: "42", status: "closed" }),
      });

    expect(res.status).toBe(200);
    expect(doc.status).toBe("closed");
    expect(doc.locked).toBe(true);
    expect(doc.signedAt).toBeInstanceOf(Date);
    expect(doc.save).toHaveBeenCalled();
  });

  it("handles a parsed document_json object", async () => {
    const doc = createCatalogDoc({ scriveDocumentId: "42" });
    GradeCatalog.findOne.mockResolvedValue(doc);

    const res = await request(app)
      .post("/api/grade-catalogs/scrive-callback")
      .send({ document_id: "42", document_json: { id: "42", status: "canceled" } });

    expect(res.status).toBe(200);
    expect(doc.status).toBe("canceled");
  });

  it("returns 400 for invalid document_json", async () => {
    GradeCatalog.findOne.mockResolvedValue(createCatalogDoc({ scriveDocumentId: "42" }));
    const res = await request(app)
      .post("/api/grade-catalogs/scrive-callback")
      .send({ document_id: "42", document_json: "{not json" });
    expect(res.status).toBe(400);
  });

  it("acknowledges callbacks without status", async () => {
    const doc = createCatalogDoc({ scriveDocumentId: "42" });
    GradeCatalog.findOne.mockResolvedValue(doc);
    const res = await request(app)
      .post("/api/grade-catalogs/scrive-callback")
      .send({ document_id: "42" });
    expect(res.status).toBe(200);
    expect(doc.save).not.toHaveBeenCalled();
  });
});

describe("GET /api/grade-catalogs/:id", () => {
  it("returns 404 when missing", async () => {
    GradeCatalog.findById.mockResolvedValue(null);
    const res = await request(app).get("/api/grade-catalogs/c1").set("x-user-role", "admin");
    expect(res.status).toBe(404);
  });

  it("returns the catalog with base64 PDF data", async () => {
    GradeCatalog.findById.mockResolvedValue(createCatalogDoc());
    const res = await request(app).get("/api/grade-catalogs/c1").set("x-user-role", "admin");
    expect(res.status).toBe(200);
    expect(res.body.pdfData).toBe(Buffer.from("%PDF-1.4 test").toString("base64"));
    expect(res.body.pdf).toBeUndefined();
  });
});
