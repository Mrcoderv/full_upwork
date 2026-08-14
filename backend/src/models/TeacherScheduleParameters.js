import mongoose from "mongoose";

const TeacherScheduleParametersSchema = new mongoose.Schema({
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Teacher",
        required: true,
    },
    courseId: {
        type: String,
        required: true,
    },
    lengthWeeks: {
        type: Number,
        enum: [5, 10, 20],
        required: true,
    },
    sectionOffsets: {
        type: [Number],
        default: [],
        validate: {
            validator: function (v) {
                return v.length === 5 || v.length === 0;
            },
            message: "sectionOffsets must have exactly 5 values (one per module) or be empty",
        },
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

// Helper: resolve section offsets — use saved if present, otherwise default
TeacherScheduleParametersSchema.methods.getSectionOffsets = function () {
    if (this.sectionOffsets && this.sectionOffsets.length === 5) {
        return this.sectionOffsets;
    }
    // No saved parameters → evenly-spaced defaults for this length
    const defaultOffsets = {
        5: [0, 1, 2, 3, 4],
        10: [0, 2, 4, 6, 8],
        20: [0, 4, 8, 12, 16],
    };
    return defaultOffsets[this.lengthWeeks] || [0, 1, 2, 3, 4];
};

// Index for fast lookup by teacher + course + length
TeacherScheduleParametersSchema.index({ teacherId: 1, courseId: 1, lengthWeeks: 1 }, { unique: true });

export default mongoose.model("TeacherScheduleParameters", TeacherScheduleParametersSchema);