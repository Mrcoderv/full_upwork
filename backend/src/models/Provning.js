import mongoose from "mongoose";

const examSchema = new mongoose.Schema(
    {
        name: String,
        personalNumber: String,
        phone: String,
        email: String,
        address: String,
        course: String,
        municipality: String,
        teacherId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
            required: false,
            default: null,
        },
        requestedMonth: String,
        originalRequestedMonth: String,
        materialReceived: {
            status: { type: Boolean, default: false },
            receivedDate: Date,
        },
        paymentDate: Date,
        decision: {
            type: String,
            enum: ["accept", "move", "deny", ""],
            default: "",
        },
        comment: String,
        status: {
            type: String,
            enum: ["intresse", "scheduled", "moved", "denied"],
            default: "intresse",
        },
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
        },
        // Interest list - students who have expressed interest in this exam
        interestedStudentIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Student",
            },
        ],
        // Exam accommodations (Section 19.8)
        accommodations: {
            extraTime: { type: Boolean, default: false },
            computer: { type: Boolean, default: false },
            separateRoom: { type: Boolean, default: false },
            notes: { type: String },
        },
        // On-site vs remote exam (Section 7.10)
        examMode: {
            type: String,
            enum: ["onsite", "remote"],
            default: "onsite",
        },
        // Room assignment (Section 19.11)
        examRoom: { type: String },
    },
    { timestamps: true }
);

examSchema.index({ status: 1 });
examSchema.index({ "interestedStudentIds": 1 });

export default mongoose.model("Exam", examSchema, "exams");
