import mongoose from "mongoose";

const studentEnrollmentSchema = new mongoose.Schema(
    {
        // Student reference
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },

        // Course instance reference
        courseInstanceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CourseInstance",
            required: true,
        },

        // New fields for teacher enrollment
        needsSupport: {
            type: Boolean,
            default: false,
        },
        examMode: {
            type: String,
            enum: ["on-site", "remote"],
            default: "on-site",
        },

        // Main course reference (for easy querying)
        mainCourseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: false,
        },
        // Course package reference (for package enrollments)
        coursePackageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CoursePackage",
            required: false,
        },
        // Program reference (for program enrollments)
        programId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Program",
            required: false,
        },

        // Enrollment dates
        enrollmentDate: {
            type: Date,
            default: Date.now,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },

        // Status tracking
        status: {
            type: String,
            enum: [
                "enrolled",
                "active",
                "completed",
                "dropped",
                "inactive",
                "suspended",
                "reviderad",
            ],
            default: "enrolled",
        },

        // Status change history
        statusHistory: [
            {
                status: {
                    type: String,
                    enum: [
                        "enrolled",
                        "active",
                        "completed",
                        "dropped",
                        "inactive",
                        "suspended",
                        "reviderad",
                    ],
                },
                changedAt: { type: Date, default: Date.now },
                changedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                reason: String,
                notes: String,
            },
        ],

        // Academic information
        grade: { type: String, default: null },
        gradeDate: { type: Date, default: null },
        gradeBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        motivation: { type: String, default: '' }, // Grade motivation/reason
        comments: { type: String, default: '' }, // Grade comments
        nationalTestPoints: { type: Number, default: null }, // National test points
        isGradeLocked: { type: Boolean, default: false }, // Lock grade from editing
        
        // Slutprov (final exam) date
        slutprovDate: { type: Date, default: null },

        // Attendance tracking
        attendancePercentage: { type: Number, min: 0, max: 100, default: null },
        lastAttendanceDate: { type: Date, default: null },

        // Financial tracking
        paymentStatus: {
            type: String,
            enum: ["pending", "paid", "partial", "overdue", "waived"],
            default: "pending",
        },

        // Metadata
        teacherId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
        },

        notes: String,
        tags: [String],

        // Completion tracking
        completedAt: { type: Date, default: null },
        completionCertificate: { type: String, default: null },

        // Dropout information
        dropoutReason: String,
        dropoutDate: { type: Date, default: null },
        dropoutBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

        // Re-enrollment tracking
        isReEnrollment: { type: Boolean, default: false },
        previousEnrollmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "StudentEnrollment",
        },
    },
    {
        timestamps: true,
        indexes: [
            { studentId: 1, courseInstanceId: 1 },
            { studentId: 1, status: 1 },
            { courseInstanceId: 1, status: 1 },
            { startDate: 1, endDate: 1 },
            { status: 1, startDate: 1 },
        ],
    }
);

// Pre-save middleware to update status history
studentEnrollmentSchema.pre("save", function () {
    if (this.isModified("status")) {
        // Ensure statusHistory is initialized
        if (!this.statusHistory) {
            this.statusHistory = [];
        }
        
        this.statusHistory.push({
            status: this.status,
            changedAt: new Date(),
            changedBy: this.updatedBy || null,
            reason: this.statusChangeReason || null,
            notes: this.statusChangeNotes || null,
        });

        // Clear temporary fields
        delete this.updatedBy;
        delete this.statusChangeReason;
        delete this.statusChangeNotes;
    }
});

let originalDoc = null;
studentEnrollmentSchema.pre('save', async function () {
    if (!this.isNew) {
        originalDoc = await this.constructor.findById(this._id).lean();
    }
});


// Post-save hook for creation and updates
studentEnrollmentSchema.post("save", async function (doc) {
    const { sendStudyplanChangedNotification } = await import("../controllers/notificationController.js");
    const changeType = this.isNew ? 'created' : 'updated';
    let changes = null;

    if (changeType === 'updated' && originalDoc) {
        const changedFields = [];
        const previousValues = {};
        const newValues = {};

        doc.schema.eachPath((path) => {
            if (!doc.isModified(path) || ['_id', '__v', 'updatedAt', 'createdAt'].includes(path)) return;
            
            const originalValue = originalDoc[path];
            const newValue = doc[path];

            // Simple comparison for now. Mongoose's isModified can be complex.
            if (JSON.stringify(originalValue) !== JSON.stringify(newValue)) {
                changedFields.push(path);
                previousValues[path] = originalValue;
                newValues[path] = newValue;
            }
        });

        if (changedFields.length > 0) {
            changes = { changedFields, previousValues, newValues };
        } else {
            // If no fields were meaningfully changed, don't send a notification.
            return;
        }
    }
    
    await sendStudyplanChangedNotification({ doc, changeType, changes });

    // Sync calendar event if enrollment has a slutprovDate (and it was newly set or modified)
    if (doc.slutprovDate && (!originalDoc || originalDoc.slutprovDate?.toString() !== doc.slutprovDate?.toString())) {
        try {
            const { syncCalendarEventFromEnrollment } = await import("../utils/calendarEventSync.js");
            await syncCalendarEventFromEnrollment(doc._id);
        } catch (calendarError) {
            console.error(`❌ Error syncing calendar event for enrollment ${doc._id}:`, calendarError);
            // Don't fail the enrollment save if calendar sync fails
        }
    }
});

// Post-delete hook
studentEnrollmentSchema.post("findOneAndDelete", async function (doc) {
    if (doc) {
        const { sendStudyplanChangedNotification } = await import("../controllers/notificationController.js");
        await sendStudyplanChangedNotification({ doc, changeType: 'deleted' });
    }
});


// Method to change status with reason
studentEnrollmentSchema.methods.changeStatus = function (
    newStatus,
    reason = null,
    notes = null,
    changedBy = null
) {
    this.status = newStatus;
    this.updatedBy = changedBy;
    this.statusChangeReason = reason;
    this.statusChangeNotes = notes;

    // Set specific dates based on status
    if (newStatus === "completed") {
        this.completedAt = new Date();
    } else if (newStatus === "dropped") {
        this.dropoutDate = new Date();
        this.dropoutBy = changedBy;
    }

    return this.save();
};

// Method to calculate duration
studentEnrollmentSchema.methods.getDuration = function () {
    return Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
};

// Method to check if enrollment is currently active
studentEnrollmentSchema.methods.isCurrentlyActive = function () {
    const now = new Date();
    return (
        this.status === "active" && this.startDate <= now && this.endDate >= now
    );
};

studentEnrollmentSchema.index({ studentId: 1 });
studentEnrollmentSchema.index({ mainCourseId: 1 });
studentEnrollmentSchema.index({ teacherId: 1 });
studentEnrollmentSchema.index({ status: 1 });
studentEnrollmentSchema.index({ gradeDate: 1 });
studentEnrollmentSchema.index({ endDate: 1 });

export default mongoose.model(
    "StudentEnrollment",
    studentEnrollmentSchema,
    "studentEnrollments"
);
