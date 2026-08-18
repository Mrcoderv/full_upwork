import mongoose from "mongoose";
import logger from "../utils/logger.js";
import { AppError } from "../utils/errorHandler.js";
import AplRecord from "../models/AplRecord.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import NOTIFICATION_TYPES from "../controllers/notificationTypes.js";
import { sendEmail, getEmailSignature } from "../services/emailService.js";
import {
    computeAplPeriod,
    computeAplEffectiveStatus,
    APL_AUTO_RED_WEEKS,
} from "../utils/aplAutoStatus.js";

export const APL_STATUSES = ["GRAY", "BLUE", "YELLOW", "PURPLE", "RED", "GREEN"];

export const APL_STATUS_LABELS = {
    GRAY: "Ny elev",
    BLUE: "Kontaktad",
    YELLOW: "APL på gång",
    PURPLE: "Behöver uppföljning",
    RED: "Snart slut",
    GREEN: "Klar praktik",
};

/**
 * Find all students eligible for APL (have a CoursePackage enrollment, not dropped).
 */
export async function findEligibleStudents() {
    const students = await Student.find({ dropout: false })
        .populate("teacherId", "name email")
        .lean();

    const eligible = [];
    for (const student of students) {
        const hasPackage = student.education?.some(
            (e) => e.type === "CoursePackage" && !e.removedAt
        );
        if (hasPackage) {
            const aplPeriod = computeAplPeriod(student.education || []);
            const effective = computeAplEffectiveStatus(
                student.aplStatus,
                aplPeriod.aplEndDate
            );
            eligible.push({
                ...student,
                aplStartDate: aplPeriod.aplStartDate,
                aplEndDate: aplPeriod.aplEndDate,
                aplStatusAuto: effective.aplAutoRed,
                aplWeeksRemaining: effective.aplWeeksRemaining,
                aplStatusStored: effective.aplStatusStored,
            });
        }
    }
    return eligible;
}

/**
 * Auto-create APL records for eligible students who don't have one yet.
 */
export async function autoCreateRecords(userId) {
    const eligible = await findEligibleStudents();
    const created = [];

    for (const student of eligible) {
        const existing = await AplRecord.findOne({ studentId: student._id });
        if (existing) continue;

        const record = new AplRecord({
            studentId: student._id,
            status: student.aplStatus || "GRAY",
            statusHistory: [
                {
                    status: student.aplStatus || "GRAY",
                    changedAt: new Date(),
                    changedBy: userId,
                    reason: "Automatisk skapelse vid APL-berättigande",
                },
            ],
            internshipStartDate: student.aplStartDate || null,
            internshipEndDate: student.aplEndDate || null,
        });
        await record.save();
        created.push(record);
    }

    return created;
}

/**
 * Update APL status for a student, sync both AplRecord and Student.aplStatus.
 */
export async function updateAplStatus({ studentId, status, reason, userId }) {
    if (!APL_STATUSES.includes(status)) {
        throw new AppError("Invalid APL status", 400);
    }

    const student = await Student.findById(studentId);
    if (!student) throw new AppError("Student not found", 404);

    const previousStatus = student.aplStatus;

    // Update Student model
    student.aplStatus = status;
    if (!student.aplStatusHistory) student.aplStatusHistory = [];
    student.aplStatusHistory.push({
        status,
        changedAt: new Date(),
        changedBy: userId?.toString() || "system",
    });
    await student.save();

    // Update or create AplRecord
    let record = await AplRecord.findOne({ studentId });
    if (!record) {
        const aplPeriod = computeAplPeriod(student.education || []);
        record = new AplRecord({
            studentId,
            status,
            statusHistory: [
                {
                    status,
                    changedAt: new Date(),
                    changedBy: userId,
                    reason: reason || `Status ändrad från ${previousStatus} till ${status}`,
                },
            ],
            internshipStartDate: aplPeriod.aplStartDate || null,
            internshipEndDate: aplPeriod.aplEndDate || null,
        });
    } else {
        record.status = status;
        if (!record.statusHistory) record.statusHistory = [];
        record.statusHistory.push({
            status,
            changedAt: new Date(),
            changedBy: userId,
            reason: reason || `Status ändrad från ${previousStatus} till ${status}`,
        });
    }

    // Mark completed
    if (status === "GREEN" && previousStatus !== "GREEN") {
        record.completedAt = new Date();
        record.completedBy = userId;
    }

    await record.save();

    // Send notifications on status change
    if (previousStatus !== status) {
        try {
            await sendAplStatusNotification({
                student,
                previousStatus,
                newStatus: status,
                userId,
            });
        } catch (notifError) {
            logger.error({ err: notifError }, "Error sending APL status notification (non-fatal)");
        }
    }

    return { student, record, previousStatus };
}

/**
 * Auto-transition students to RED when APL ending within threshold.
 * Auto-transition to GREEN when APL period has ended.
 */
export async function autoTransitionStatuses() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const transitions = [];

    // Find all active APL records (not GREEN or RED-auto)
    const records = await AplRecord.find({
        status: { $in: ["GRAY", "BLUE", "YELLOW", "PURPLE"] },
    }).populate("studentId", "name email education aplStatus");

    for (const record of records) {
        const student = record.studentId;
        if (!student || student.dropout) continue;

        const aplPeriod = computeAplPeriod(student.education || []);
        if (!aplPeriod.aplEndDate) continue;

        const endDate = new Date(aplPeriod.aplEndDate);
        const daysRemaining = Math.ceil(
            (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Auto-RED: ending within threshold
        if (daysRemaining >= 0 && daysRemaining <= APL_AUTO_RED_WEEKS * 7) {
            if (record.status !== "RED") {
                const { student: updatedStudent, record: updatedRecord } = await updateAplStatus({
                    studentId: student._id,
                    status: "RED",
                    reason: `Automatisk: ${daysRemaining} dagar kvar (tröskel: ${APL_AUTO_RED_WEEKS * 7} dagar)`,
                    userId: null,
                });
                transitions.push({
                    studentId: student._id,
                    studentName: student.name,
                    from: record.status,
                    to: "RED",
                    reason: "auto-red",
                });
            }
        }

        // Auto-GREEN: period ended
        if (daysRemaining < 0) {
            if (record.status !== "GREEN") {
                await updateAplStatus({
                    studentId: student._id,
                    status: "GREEN",
                    reason: `Automatisk: APL-perioden avslutad ${endDate.toLocaleDateString("sv-SE")}`,
                    userId: null,
                });
                transitions.push({
                    studentId: student._id,
                    studentName: student.name,
                    from: record.status,
                    to: "GREEN",
                    reason: "auto-green",
                });
            }
        }
    }

    return transitions;
}

/**
 * Get all APL records with filtering.
 */
export async function getAplRecords({ status, includeCompleted, search }) {
    const query = {};
    if (status) query.status = status;
    if (!includeCompleted && !status) {
        query.status = { $ne: "GREEN" };
    }

    const records = await AplRecord.find(query)
        .populate("studentId", "name email phone teacherId education aplStatus dropout")
        .populate("coursePackageId", "coursePackageName coursePackageCode")
        .populate("cvDocId", "filename uploadDate")
        .populate("contractDocId", "filename uploadDate")
        .sort({ createdAt: -1 })
        .lean();

    let filtered = records;
    if (search) {
        const q = search.toLowerCase();
        filtered = records.filter((r) => {
            const name = r.studentId?.name || "";
            const email = r.studentId?.email || "";
            return name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
        });
    }

    // Enrich with computed fields
    return filtered.map((record) => {
        const student = record.studentId;
        const aplPeriod = computeAplPeriod(student?.education || []);
        const effective = computeAplEffectiveStatus(
            record.status,
            aplPeriod.aplEndDate
        );
        return {
            ...record,
            aplStartDate: aplPeriod.aplStartDate,
            aplEndDate: aplPeriod.aplEndDate,
            aplWeeksRemaining: effective.aplWeeksRemaining,
            aplStatusAuto: effective.aplAutoRed,
        };
    });
}

/**
 * Get a single APL record by student ID.
 */
export async function getAplRecordByStudent(studentId) {
    const record = await AplRecord.findOne({ studentId })
        .populate("studentId", "name email phone teacherId education aplStatus dropout")
        .populate("coursePackageId", "coursePackageName coursePackageCode")
        .populate("cvDocId", "filename uploadDate")
        .populate("contractDocId", "filename uploadDate")
        .lean();

    if (!record) return null;

    const student = record.studentId;
    const aplPeriod = computeAplPeriod(student?.education || []);
    const effective = computeAplEffectiveStatus(record.status, aplPeriod.aplEndDate);

    return {
        ...record,
        aplStartDate: aplPeriod.aplStartDate,
        aplEndDate: aplPeriod.aplEndDate,
        aplWeeksRemaining: effective.aplWeeksRemaining,
        aplStatusAuto: effective.aplAutoRed,
    };
}

/**
 * Update APL record details (placement, notes, requirements, documents).
 */
export async function updateAplRecordDetails({ studentId, updates, userId }) {
    let record = await AplRecord.findOne({ studentId });
    if (!record) {
        // Auto-create if not exists
        const student = await Student.findById(studentId);
        if (!student) throw new AppError("Student not found", 404);
        const aplPeriod = computeAplPeriod(student.education || []);
        record = new AplRecord({
            studentId,
            status: student.aplStatus || "GRAY",
            internshipStartDate: aplPeriod.aplStartDate || null,
            internshipEndDate: aplPeriod.aplEndDate || null,
        });
    }

    const allowedFields = [
        "placementCompany",
        "placementContact",
        "placementAddress",
        "internshipStartDate",
        "internshipEndDate",
        "notes",
        "requirements",
        "cvDocId",
        "contractDocId",
    ];

    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            record[field] = updates[field];
        }
    }

    await record.save();
    return record;
}

/**
 * Send notification on APL status change.
 */
async function sendAplStatusNotification({ student, previousStatus, newStatus, userId }) {
    // Notify teachers and coordinators
    const teacherId = student.teacherId?._id || student.teacherId;

    const statusLabel = APL_STATUS_LABELS[newStatus] || newStatus;
    const prevLabel = APL_STATUS_LABELS[previousStatus] || previousStatus;
    const message = `APL-status för ${student.name} ändrad: ${prevLabel} → ${statusLabel}`;

    // Create in-app notification
    try {
        await Notification.create({
            type: newStatus === "RED" ? NOTIFICATION_TYPES.APL_WARNING :
                  newStatus === "GREEN" ? NOTIFICATION_TYPES.APL_COMPLETE :
                  "apl_status_changed",
            message,
            teacher: teacherId || undefined,
            meta: {
                studentId: student._id,
                studentName: student.name,
                previousStatus,
                newStatus,
            },
        });
    } catch (notifError) {
        logger.error({ err: notifError }, "Error creating APL notification");
    }

    // Send email to teacher if available
    if (teacherId) {
        try {
            const teacher = await User.findById(teacherId).select("name email");
            if (teacher?.email) {
                const signature = await getEmailSignature();
                const emailBody = `
Hej ${teacher.name},

${message}

Med vänlig hälsning,
${signature}
                `.trim();

                await sendEmail({
                    to: teacher.email,
                    subject: `APL-status ändrad — ${student.name}`,
                    body: emailBody,
                });
            }
        } catch (emailError) {
            logger.error({ err: emailError }, "Error sending APL status email");
        }
    }
}

/**
 * Get APL statistics (counts per status).
 */
export async function getAplStatistics() {
    const records = await AplRecord.find({}).lean();
    const counts = {};
    for (const status of APL_STATUSES) {
        counts[status] = records.filter((r) => r.status === status).length;
    }
    return { counts, total: records.length };
}
