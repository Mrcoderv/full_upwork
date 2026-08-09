// models/GradeCatalog.js
import mongoose from "mongoose";

/**
 * GradeCatalog – en betygskatalog (PDF) som laddas upp en i taget av
 * admin/systemadmin och skickas för digital signering via Scrive eSign.
 *
 * `status` speglar var i signeringsflödet katalogen befinner sig:
 *  - uploaded        – uppladdad, ännu inte skickad till Scrive
 *  - sending         – håller på att skapas/skickas i Scrive
 *  - pending         – skickad, väntar på att läraren signerar
 *  - closed          – signerad och förseglad (katalogen är låst)
 *  - canceled        – avbruten i Scrive
 *  - timedout        – signeringen har gått ut
 *  - rejected        – läraren har avvisat dokumentet
 *  - document_error  – Scrive rapporterade ett dokumentfel
 *  - failed          – vår integration misslyckades (t.ex. API-fel/ej konfigurerat)
 */
const gradeCatalogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    filename: { type: String, required: true },
    pdf: { type: Buffer },
    pdfContentType: { type: String, default: "application/pdf" },

    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    studentName: { type: String },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
    courseName: { type: String },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentEnrollment" },

    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },
    teacherName: { type: String },
    teacherEmail: { type: String },

    scriveDocumentId: { type: String },
    scriveStatus: { type: String },

    status: {
      type: String,
      enum: [
        "uploaded",
        "sending",
        "pending",
        "closed",
        "canceled",
        "timedout",
        "rejected",
        "document_error",
        "failed",
      ],
      default: "uploaded",
    },
    errorMessage: { type: String },

    uploadedById: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    uploadedByRole: { type: String },
    sentById: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    sentAt: { type: Date },
    signedAt: { type: Date },

    locked: { type: Boolean, default: false },
    lockedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("GradeCatalog", gradeCatalogSchema, "gradecatalogs");
