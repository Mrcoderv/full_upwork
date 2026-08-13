import mongoose from "mongoose";
import { courseModuleSchema } from "./courseModuleSchema.js";

const courseTemplateSchema = new mongoose.Schema(
    {
        // Per-course templates: optional reference to the Course this template belongs to
        courseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: false,
        },
        templateName: { type: String, required: true, trim: true },
        // 5 modules × 2 sections by default
        modules: { type: [courseModuleSchema], default: [] },
        // "Select teachers" grant is enforced via permission middleware; record who created it
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
        },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

courseTemplateSchema.index({ courseId: 1 });
courseTemplateSchema.index({ createdBy: 1 });

export default mongoose.model("CourseTemplate", courseTemplateSchema, "courseTemplates");
