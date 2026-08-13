import mongoose from "mongoose";

// One submission per (student, enrollment, module). A student may resubmit:
// upsert replaces the previous attempt and clears any existing feedback so the
// teacher knows the new version needs reviewing again.
const assignmentSubmissionSchema = new mongoose.Schema(
    {
        // Student reference
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },
        // Enrollment the submission belongs to (uniquely identifies the course card)
        enrollmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "StudentEnrollment",
            required: true,
        },
        // Course instance (denormalized for teacher/submission queries)
        courseInstanceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CourseInstance",
            required: true,
        },
        // Module number within the instance (must exist on the instance's modules)
        moduleNumber: { type: Number, required: true },

        // The submitted work: free text and/or a reference to an uploaded file
        // (GridFS via POST /uploads/:studentId — reuse of the existing upload infra).
        submittedText: { type: String, default: "" },
        fileId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "fs.files",
            default: null,
        },
        fileName: { type: String, default: "" },

        submittedAt: { type: Date, default: Date.now },

        // Teacher feedback. Resubmitting clears this block.
        feedback: {
            comment: { type: String, default: "" },
            // "godkänd" = accepted, "komplettera" = revise/resubmit.
            status: { type: String, enum: ["", "godkänd", "komplettera"], default: "" },
            by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
            at: { type: Date, default: null },
        },
    },
    {
        timestamps: true,
    }
);

// One submission per student + enrollment + module; resubmission upserts.
assignmentSubmissionSchema.index(
    { studentId: 1, enrollmentId: 1, moduleNumber: 1 },
    { unique: true }
);
assignmentSubmissionSchema.index({ courseInstanceId: 1, moduleNumber: 1 });
assignmentSubmissionSchema.index({ enrollmentId: 1 });

export default mongoose.model(
    "AssignmentSubmission",
    assignmentSubmissionSchema,
    "assignmentSubmissions"
);
