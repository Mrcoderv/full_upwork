import mongoose from "mongoose";

const examAttemptSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },

        courseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: true,
        },

        // The selected questions for this exam
        selectedQuestions: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Question",
            },
        ],

        totalQuestions: {
            type: Number,
            required: true,
            default: 0,
        },

        selectedCount: {
            type: Number,
            required: true,
            default: 0,
        },

        // Who generated this exam
        generatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // Status: generated, assigned, completed, graded
        status: {
            type: String,
            enum: ["generated", "assigned", "completed", "graded"],
            default: "generated",
        },

        // When the exam was assigned to a course instance
        assignedAt: Date,

        // Optional: which course instance this exam is for
        courseInstanceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CourseInstance",
        },

        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

// Index for finding exams by course and status
examAttemptSchema.index({ courseId: 1, status: 1 });
examAttemptSchema.index({ generatedBy: 1 });

export default mongoose.model("ExamAttempt", examAttemptSchema, "exam_attempts");
