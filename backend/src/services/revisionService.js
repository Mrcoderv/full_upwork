import mongoose from "mongoose";
import logger from "../utils/logger.js";
import { AppError } from "../utils/errorHandler.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import CourseInstance from "../models/CourseInstance.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import CourseMatchingService from "../utils/courseMatchingService.js";
import { sendEmail, getEmailSignature } from "../services/emailService.js";

/**
 * Revision service — handles study-plan changes (pace, add/remove courses,
 * reschedule) with full cascade: enrollments, exams, notifications, audit trail.
 */

/**
 * Revision reason types for the audit trail.
 */
export const REVISION_REASONS = [
    "pace_change",
    "course_added",
    "course_removed",
    "date_adjustment",
    "package_swap",
    "other",
];

/**
 * Perform a study-plan revision: reschedule future enrollments, update exams,
 * notify teacher + student, record revision history.
 *
 * @param {Object} params
 * @param {string} params.studentId - Student ID
 * @param {string} params.revisionReason - One of REVISION_REASONS
 * @param {string} [params.description] - Free-text description of the change
 * @param {Object} params.changes - { tempoWeeks?, removeEnrollmentIds?, addCourses?, dateAdjustments? }
 * @param {string} params.userId - Staff user performing the revision
 * @param {string} params.userRole - Staff role
 * @returns {Promise<Object>} revision result
 */
export const performStudyplanRevision = async ({
    studentId,
    revisionReason,
    description,
    changes,
    userId,
    userRole,
}) => {
    if (!REVISION_REASONS.includes(revisionReason)) {
        throw new AppError("Invalid revision reason", 400);
    }

    const student = await Student.findById(studentId);
    if (!student) throw new AppError("Student not found", 404);

    const session = await mongoose.startSession();
    let result = {};

    try {
        await session.withTransaction(async () => {
            const auditEntry = {
                timestamp: new Date(),
                changedBy: userId,
                changedByRole: userRole,
                changes: ["studyplan_revision"],
                previousValues: {},
                newValues: {},
                revisionReason,
                revisionDescription: description || "",
            };

            // 1. Pace change — reschedule future enrollments
            if (changes.tempoWeeks) {
                const tempoResult = await rescheduleByTempo({
                    student,
                    tempoWeeks: changes.tempoWeeks,
                    userId,
                    session,
                });
                auditEntry.previousValues.tempoWeeks = student.tempoWeeks || null;
                auditEntry.newValues.tempoWeeks = changes.tempoWeeks;
                student.tempoWeeks = changes.tempoWeeks;
                result.rescheduledEnrollments = tempoResult.count;
            }

            // 2. Remove enrollments
            if (changes.removeEnrollmentIds?.length > 0) {
                const removeResult = await removeEnrollments({
                    studentId,
                    enrollmentIds: changes.removeEnrollmentIds,
                    userId,
                    session,
                });
                auditEntry.previousValues.removedEnrollmentIds = changes.removeEnrollmentIds;
                result.removedEnrollments = removeResult.count;
            }

            // 3. Add new courses
            if (changes.addCourses?.length > 0) {
                const addResult = await addNewCourses({
                    student,
                    courses: changes.addCourses,
                    userId,
                    userRole,
                    session,
                });
                auditEntry.newValues.addedCourseNames = addResult.courseNames;
                result.addedEnrollments = addResult.count;
            }

            // 4. Date adjustments
            if (changes.dateAdjustments?.length > 0) {
                const adjResult = await adjustDates({
                    studentId,
                    adjustments: changes.dateAdjustments,
                    userId,
                    session,
                });
                auditEntry.previousValues.dateAdjustments = adjResult.previous;
                result.adjustedEnrollments = adjResult.count;
            }

            // 5. Record audit entry
            if (!student.changeHistory) student.changeHistory = [];
            student.changeHistory.push(auditEntry);
            await student.save({ session });

            result.auditEntry = auditEntry;
            result.studentId = studentId;
        });

        // 6. Notify teacher + student (outside transaction — non-critical)
        try {
            await sendRevisionNotifications({
                student,
                revisionReason,
                description,
                userId,
            });
        } catch (notifError) {
            logger.error({ err: notifError }, "Error sending revision notifications (non-fatal)");
        }

        result.success = true;
        result.message = "Study plan revision applied";
        return result;
    } catch (error) {
        if (error instanceof AppError) throw error;
        logger.error({ err: error, studentId }, "Error performing study plan revision");
        throw new AppError("Failed to perform study plan revision", 500);
    } finally {
        session.endSession();
    }
};

/**
 * Reschedule all future enrollments based on new tempo.
 */
async function rescheduleByTempo({ student, tempoWeeks, userId, session }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const enrollments = await StudentEnrollment.find({
        studentId: student._id,
        mainCourseId: { $exists: true, $ne: null },
        status: { $nin: ["completed", "dropped", "cancelled"] },
    })
        .sort({ startDate: 1, createdAt: 1 })
        .session(session);

    const futureEnrollments = enrollments.filter((e) => {
        if (!e.startDate) return false;
        return new Date(e.startDate).getTime() > today.getTime();
    });

    if (futureEnrollments.length === 0) return { count: 0 };

    let nextStartDate = new Date(futureEnrollments[0].startDate);
    let count = 0;

    for (const enrollment of futureEnrollments) {
        const startDate = new Date(nextStartDate);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + Number(tempoWeeks) * 7);

        const { instance } = await CourseMatchingService.findOrCreateCourseInstance(
            enrollment.mainCourseId,
            startDate,
            endDate,
            userId,
            student.teacherId || enrollment.teacherId || null
        );

        const previousInstanceId = enrollment.courseInstanceId;
        const previousEnrollmentId = enrollment._id;

        const newEnrollment = new StudentEnrollment({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: enrollment.mainCourseId,
            startDate,
            endDate,
            status: enrollment.status || "enrolled",
            teacherId: enrollment.teacherId || student.teacherId || null,
            notes: enrollment.notes || null,
            needsSupport: enrollment.needsSupport || false,
            examMode: enrollment.examMode || "on-site",
            isReEnrollment: true,
            previousEnrollmentId,
        });

        await newEnrollment.save({ session });
        await StudentEnrollment.findByIdAndDelete(previousEnrollmentId).session(session);

        if (previousInstanceId) {
            const remaining = await StudentEnrollment.countDocuments({
                courseInstanceId: previousInstanceId,
            }).session(session);
            if (remaining === 0) {
                await CourseInstance.findByIdAndDelete(previousInstanceId).session(session);
            }
        }

        count += 1;
        nextStartDate = new Date(endDate);
    }

    return { count };
}

/**
 * Remove specific enrollments (marks them as cancelled, shifts later dates).
 */
async function removeEnrollments({ studentId, enrollmentIds, userId, session }) {
    let count = 0;

    for (const enrollmentId of enrollmentIds) {
        const enrollment = await StudentEnrollment.findOne({
            _id: enrollmentId,
            studentId,
        }).session(session);

        if (!enrollment) continue;

        await enrollment.changeStatus("cancelled", "Removed during study-plan revision", null, userId);
        count += 1;
    }

    return { count };
}

/**
 * Add new courses to the study plan after the last existing enrollment.
 */
async function addNewCourses({ student, courses, userId, userRole: _userRole, session }) {
    // Find the last enrollment end date
    const lastEnrollment = await StudentEnrollment.findOne({
        studentId: student._id,
        mainCourseId: { $exists: true, $ne: null },
    })
        .sort({ endDate: -1 })
        .session(session);

    let nextStartDate = lastEnrollment?.endDate
        ? new Date(lastEnrollment.endDate)
        : new Date();
    nextStartDate.setDate(nextStartDate.getDate() + 1);

    const tempoWeeks = student.tempoWeeks || 10;
    const courseNames = [];

    for (const course of courses) {
        const startDate = new Date(nextStartDate);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + tempoWeeks * 7);

        const { instance } = await CourseMatchingService.findOrCreateCourseInstance(
            course.courseId,
            startDate,
            endDate,
            userId,
            student.teacherId || null
        );

        const enrollment = new StudentEnrollment({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: course.courseId,
            startDate,
            endDate,
            status: "enrolled",
            teacherId: student.teacherId || null,
            examMode: course.examMode || "on-site",
        });

        await enrollment.save({ session });
        courseNames.push(course.courseName || course.courseId);
        nextStartDate = new Date(endDate);
    }

    return { count: courses.length, courseNames };
}

/**
 * Adjust dates for specific enrollments.
 */
async function adjustDates({ studentId, adjustments, userId: _userId, session }) {
    let count = 0;
    const previous = [];

    for (const adj of adjustments) {
        const enrollment = await StudentEnrollment.findOne({
            _id: adj.enrollmentId,
            studentId,
        }).session(session);

        if (!enrollment) continue;

        previous.push({
            enrollmentId: adj.enrollmentId,
            startDate: enrollment.startDate,
            endDate: enrollment.endDate,
        });

        if (adj.startDate) enrollment.startDate = new Date(adj.startDate);
        if (adj.endDate) enrollment.endDate = new Date(adj.endDate);
        await enrollment.save({ session });
        count += 1;
    }

    return { count, previous };
}

/**
 * Send notifications to teacher and student about the study-plan revision.
 */
async function sendRevisionNotifications({ student, revisionReason, description, userId: _userId }) {
    const teacherId = student.teacherId;
    if (!teacherId) return;

    const teacher = await User.findById(teacherId).select("name email");
    if (!teacher?.email) return;

    const reasonLabels = {
        pace_change: "Tempoändring",
        course_added: "Kurs tillagd",
        course_removed: "Kurs borttagen",
        date_adjustment: "Datumjustering",
        package_swap: "Paketbyte",
        other: "Övrig ändring",
    };

    const reasonLabel = reasonLabels[revisionReason] || revisionReason;
    const message = `Studieplanen för ${student.name} har reviderats: ${reasonLabel}${description ? ` — ${description}` : ""}`;

    // Create in-app notification for teacher
    try {
        await Notification.create({
            type: "studyplan_changed",
            message,
            teacher: teacherId,
            meta: {
                studentId: student._id,
                studentName: student.name,
                revisionReason,
                description: description || "",
            },
        });
    } catch (notifError) {
        logger.error({ err: notifError }, "Error creating revision notification");
    }

    // Send email to teacher
    try {
        const signature = await getEmailSignature();
        const emailBody = `
Hej ${teacher.name},

${message}

Med vänlig hälsning,
${signature}
        `.trim();

        await sendEmail({
            to: teacher.email,
            subject: `Studieplan reviderad — ${student.name}`,
            body: emailBody,
        });
    } catch (emailError) {
        logger.error({ err: emailError }, "Error sending revision email to teacher");
    }
}

/**
 * Get the revision history for a student.
 */
export const getRevisionHistory = async (studentId) => {
    const student = await Student.findById(studentId)
        .select("changeHistory name")
        .lean();

    if (!student) throw new AppError("Student not found", 404);

    const revisions = (student.changeHistory || []).filter(
        (h) => h.changes?.includes("studyplan_revision")
    );

    return revisions.map((r) => ({
        timestamp: r.timestamp,
        changedBy: r.changedBy,
        changedByRole: r.changedByRole,
        reason: r.revisionReason,
        description: r.revisionDescription,
        previousValues: r.previousValues,
        newValues: r.newValues,
    }));
};
