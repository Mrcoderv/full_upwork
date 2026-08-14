import mongoose from "mongoose";

// REMOVED: EducationEntrySchema - Using StudentEnrollment system instead

const StudentSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        personalNumber: { type: String, required: true },

        // education: [EducationEntrySchema], // REMOVED: Using StudentEnrollment system instead

        startDate: Date,
        endDate: Date,
        finalExamDate: Date,
        examMunicipality: String,
        examLocation: String,
        examTime: String,

        // Exam history tracking
        examHistory: [
            {
                examDate: { type: Date, required: true },
                courseName: { type: String, required: true },
                courseId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Course",
                },
                teacherId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Teacher",
                },
                attended: { type: Boolean, default: false },
                examTime: String,
                examMunicipality: String,
                examLocation: String,
                grade: String,
                notes: String,
                recordedAt: { type: Date, default: Date.now },
                recordedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
            },
        ],

        municipality: {
            type: {
                type: String,
                enum: [
                    "Botkyrka",
                    "Danderyd",
                    "Göteborg",
                    "Huddinge",
                    "Järfälla",
                    "KCNO",
                    "Lidingö",
                    "Norrtälje",
                    "Nykvarn",
                    "Privat kunder",
                    "Salem",
                    "Sigtuna",
                    "Sollentuna",
                    "Solna",
                    "Stockholm",
                    "Sundbyberg",
                    "Södertälje",
                    "Täby",
                    "Upplands Bro",
                    "Upplands Väsby",
                    "Vallentuna",
                    "Vaxholm",
                    "Växjö",
                    "Österåker",
                ],
                // No default value; must be set explicitly
            },
        },

        phone: String,
        email: { type: String, required: true, unique: true },
        exam: String,
        additionalInfo: String,
        // Free-text field describing any special needs or accommodations
        specialNeeds: String,
        teacher: String,
        teacherId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
        },
        dropout: { type: Boolean, default: false },
        attendedExam: { type: Boolean, default: false },
        paidExamFee: { type: Boolean, default: false },

        aplStatus: {
            type: String,
            enum: ["GRAY", "BLUE", "YELLOW", "PURPLE", "RED", "GREEN"],
            default: "GRAY",
        },

        // "Eleven har redan utfört praktik via annan skola" (tidigare praktik)
        priorAplCompleted: { type: Boolean, default: false },

        // Link to the uploaded intyg document (visible in Dokument-fliken)
        priorAplIntygDocId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Document",
            default: null,
        },

        aplStatusHistory: [
            {
                status: {
                    type: String,
                    enum: ["GRAY", "BLUE", "YELLOW", "PURPLE", "RED", "GREEN"],
                },
                changedAt: { type: Date, default: Date.now },
                changedBy: { type: String },
            },
        ],

        commentHistory: [
            {
                comment: String,
                author: String,
                authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                authorRole: String,
                date: Date,
                seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
                isDeleted: { type: Boolean, default: false },
                deletedAt: Date,
                deletedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                deletedByRole: String,
                deletedContent: String,
                editedAt: Date,
                editedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                editedByRole: String,
                previousVersion: String,
            },
        ],

        // Logbook/kits for APL-only students
        // Each kit is sent at internship start and contains placement information
        logbook: [
            {
                id: { type: mongoose.Schema.Types.ObjectId, required: true },
                title: { type: String, required: true }, // e.g. "Introduktionskit"
                description: String, // Internship description
                startDate: Date, // When the kit was sent
                endDate: Date, // When the kit expires/placement ends
                status: {
                    type: String,
                    enum: ["pending", "active", "completed", "archived"],
                    default: "pending",
                },
                placementId: { type: mongoose.Schema.Types.ObjectId, ref: "Placement" },
                // Optional: link to the student's APL CoursePackage enrollment
                coursePackageId: { type: mongoose.Schema.Types.ObjectId, ref: "CoursePackage" },
            }
        ],

        changeHistory: [
            {
                timestamp: { type: Date, default: Date.now },
                changedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                changedByRole: String,
                changes: [String],
                previousValues: mongoose.Schema.Types.Mixed,
                newValues: mongoose.Schema.Types.Mixed,
            },
        ],
    },
    { timestamps: true }
);

const municipalityPath = StudentSchema.path("municipality");
if (municipalityPath?.set) {
    municipalityPath.set((value) => {
        if (typeof value === "string") {
            return { type: value };
        }
        return value;
    });
}

StudentSchema.pre("validate", function() {
    if (typeof this.municipality === "string") {
        this.municipality = { type: this.municipality };
    }
});

export default mongoose.model("Student", StudentSchema, "students");
