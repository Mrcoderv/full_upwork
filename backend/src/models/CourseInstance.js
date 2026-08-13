import mongoose from "mongoose";
import logger from "../utils/logger.js";
import { courseModuleSchema } from "./courseModuleSchema.js";

const courseInstanceSchema = new mongoose.Schema(
    {
        // Reference to the main course (static definition)
        mainCourseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: true,
        },

        // Temporal information
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },

        // Instance-specific data (can override main course data)
        courseName: { type: String, required: true },
        courseCode: { type: String, required: true },
        coursePoints: { type: String },
        courseExtent: String,

        // Version tracking
        version: {
            type: String,
            default: "1.0",
        },

        // Status
        isActive: {
            type: Boolean,
            default: true,
        },

        // Metadata
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        responsibleTeacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
        },
        assistantTeacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
        },
        notes: String,
        slutprovDate: Date,

        // Copied modules from a course template (course card content)
        modules: { type: [courseModuleSchema], default: [] },

        // Statistics tracking
        enrollmentCount: {
            type: Number,
            default: 0,
        },
        completionCount: {
            type: Number,
            default: 0,
        },
        dropoutCount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        // Index for efficient queries
        indexes: [
            { mainCourseId: 1, startDate: 1, endDate: 1 },
            { startDate: 1, endDate: 1 },
            { isActive: 1 },
        ],
    }
);

// Validation: endDate must be after startDate
courseInstanceSchema.pre("validate", function () {
    if (this.startDate && this.endDate && this.endDate <= this.startDate) {
        this.invalidate("endDate", "End date must be after start date");
    }
});

// Auto-calculate slutprovDate based on teacher and course end date
courseInstanceSchema.pre("save", async function () {
    // Check if this was explicitly set via the update endpoint (bypass auto-calculation)
    if (this._slutprovDateExplicitlySet) {
        logger.debug({ slutprovDate: this.slutprovDate }, "Pre-save hook: _slutprovDateExplicitlySet flag is true, preserving");
        delete this._slutprovDateExplicitlySet; // Clean up the flag
        return; // Don't auto-calculate
    }
    
    // Check if slutprovDate was explicitly set/modified
    const isSlutprovDateExplicitlySet = this.isModified('slutprovDate');
    const hasValidSlutprovDate = this.slutprovDate !== null && 
                                  this.slutprovDate !== undefined && 
                                  !isNaN(new Date(this.slutprovDate).getTime()) &&
                                  new Date(this.slutprovDate).getFullYear() > 1970; // Not epoch date
    
    logger.debug({
        value: this.slutprovDate,
        isModified: isSlutprovDateExplicitlySet,
        hasValidDate: hasValidSlutprovDate,
        responsibleTeacher: this.responsibleTeacher,
        endDate: this.endDate,
        dateType: typeof this.slutprovDate,
        dateInstance: this.slutprovDate instanceof Date
    }, "Pre-save hook - slutprovDate");
    
    // If slutprovDate was explicitly modified and has a valid date, preserve it
    if (isSlutprovDateExplicitlySet && hasValidSlutprovDate) {
        logger.debug({ slutprovDate: this.slutprovDate }, "Pre-save hook: Preserving explicitly set slutprovDate");
        return; // Don't auto-calculate
    }
    
    // Only auto-calculate if slutprovDate is not set or is invalid
    if (this.responsibleTeacher && this.endDate && !hasValidSlutprovDate) {
        try {
            const { calculateSlutprovDate } = await import("../utils/slutprovDateCalculator.js");
            const calculatedDate = await calculateSlutprovDate(this.responsibleTeacher, this.endDate);
            if (calculatedDate) {
                this.slutprovDate = calculatedDate;
                logger.info({ courseName: this.courseName, calculatedDate: calculatedDate.toDateString() }, "Auto-calculated slutprovDate for course");
            }
        } catch (error) {
            logger.error({ err: error }, "Error calculating slutprovDate");
            // Don't fail the save if calculation fails
        }
    }
    // If slutprovDate is already set, we preserve it (could be manually set via drag-and-drop)
});

// Method to check if instance overlaps with date range
courseInstanceSchema.methods.overlapsWith = function (startDate, endDate) {
    return this.startDate < endDate && this.endDate > startDate;
};

// Method to get duration in days
courseInstanceSchema.methods.getDuration = function () {
    return Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
};

// Prevent duplicate instances for same course/date/teacher
courseInstanceSchema.index(
    { mainCourseId: 1, startDate: 1, endDate: 1, responsibleTeacher: 1 },
    { unique: true }
);

export default mongoose.model(
    "CourseInstance",
    courseInstanceSchema,
    "courseInstances"
);
