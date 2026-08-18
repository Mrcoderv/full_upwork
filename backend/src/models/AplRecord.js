import mongoose from "mongoose";

const aplRecordSchema = new mongoose.Schema(
    {
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },
        coursePackageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CoursePackage",
            default: null,
        },
        status: {
            type: String,
            enum: ["GRAY", "BLUE", "YELLOW", "PURPLE", "RED", "GREEN"],
            default: "GRAY",
        },
        statusHistory: [
            {
                status: {
                    type: String,
                    enum: ["GRAY", "BLUE", "YELLOW", "PURPLE", "RED", "GREEN"],
                },
                changedAt: { type: Date, default: Date.now },
                changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                reason: String,
            },
        ],
        placementCompany: { type: String, default: "" },
        placementContact: { type: String, default: "" },
        placementAddress: { type: String, default: "" },
        internshipStartDate: { type: Date, default: null },
        internshipEndDate: { type: Date, default: null },
        notes: { type: String, default: "" },
        requirements: { type: String, default: "" },
        cvDocId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Document",
            default: null,
        },
        contractDocId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Document",
            default: null,
        },
        completedAt: { type: Date, default: null },
        completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

aplRecordSchema.index({ studentId: 1, coursePackageId: 1 }, { unique: true, sparse: true });
aplRecordSchema.index({ status: 1 });

const AplRecord = mongoose.model("AplRecord", aplRecordSchema);

export default AplRecord;
