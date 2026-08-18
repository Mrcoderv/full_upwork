import mongoose from "mongoose";

const deviationSchema = new mongoose.Schema(
    {
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },
        enrollmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "StudentEnrollment",
            required: true,
        },
        courseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
        },
        courseInstanceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CourseInstance",
        },
        type: {
            type: String,
            enum: ["exception", "revision", "deviation"],
            required: true,
        },
        title: { type: String, required: true },
        description: String,
        reason: String,
        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
        },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        requestedByName: String,
        resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        resolvedByName: String,
        resolution: String,
        resolvedAt: Date,
    },
    { timestamps: true }
);

deviationSchema.index({ studentId: 1 });
deviationSchema.index({ enrollmentId: 1 });
deviationSchema.index({ status: 1 });

export default mongoose.model("Deviation", deviationSchema, "deviations");
