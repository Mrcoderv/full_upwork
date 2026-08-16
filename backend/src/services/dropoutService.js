/**
 * Shared dropout (avbrott) cascade service (Etapp 2, P0).
 *
 * The avbrott flow is the single source of truth for what happens when a
 * student is discontinued. It is shared by three entry points so every path
 * behaves identically:
 *   1. the admin UI (POST /api/student-details/:id/dropout),
 *   2. the inactivity notification action (admin acting on a notification),
 *   3. the automatic inactivity scan (auto-withdraw after the warning date).
 *
 * Cascade (idempotent, non-fatal side effects):
 *   - flags the student `dropout` + changeHistory audit entry,
 *   - cascades every non-terminal enrollment to "dropped",
 *   - removes the student from slutprovslista (ExamAttendance + persisted
 *     calendar events) and prövningar (Provning),
 *   - creates/resets a dropout notification to the responsible teacher,
 *   - opens a teacher<->admin discussion thread.
 *
 * APL removal is implicit: every APL read path already filters dropout
 * students (see README "APL rule"). Revivability is handled by the
 * re-registration flow (POST /student, processStudentEducation) which clears
 * the dropout flag.
 */
import mongoose from "mongoose";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import User from "../models/User.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import ExamAttendance from "../models/ExamAttendance.js";
import Provning from "../models/Provning.js";
import Notification from "../models/Notification.js";
import CalendarEvent from "../models/Event.js";
import logger from "../utils/logger.js";
import {
    computeLiveInactivitySignal,
    ensureInactivityDiscussionThread,
    safeInactivitySideEffect,
    summarizeInactivitySignal,
} from "./inactivityDiscussionService.js";

/** Enrollment statuses that must be cascaded to "dropped" on avbrott. */
export const CASCADE_DROPOUT_STATUSES = [
    "enrolled",
    "active",
    "inactive",
    "suspended",
    "reviderad",
];

/**
 * Resolve the responsible teacher (Student.teacherId or the teacher name
 * string) into { teacherRecord, teacherUserId } for notifications.
 * @param {Object} student - the (preferably populated) Student document.
 * @returns {Promise<{ teacherRecord: Object|null, teacherUserId: ObjectId|string|null }>}
 */
async function resolveResponsibleTeacherForDropout(student) {
    let teacherRecord = null;
    let teacherUserId = null;

    if (student.teacherId) {
        if (student.teacherId._id) {
            // Populated teacherId.
            teacherRecord = student.teacherId;
        } else {
            teacherRecord = await Teacher.findById(student.teacherId);
        }
        if (teacherRecord) {
            if (teacherRecord.userId) {
                teacherUserId = teacherRecord.userId._id || teacherRecord.userId;
            } else {
                const populated = await Teacher.findById(teacherRecord._id).populate("userId");
                teacherUserId = populated?.userId?._id || populated?.userId || null;
            }
        }
    } else if (typeof student.teacher === "string" && student.teacher.trim() !== "") {
        const teacherUser = await User.findOne({ name: student.teacher });
        if (teacherUser) {
            teacherRecord = await Teacher.findOne({ userId: teacherUser._id });
            teacherUserId = teacherUser._id;
        }
    }

    return { teacherRecord, teacherUserId };
}

/**
 * Create (or reset) the dropout notification for the responsible teacher.
 * @param {Object} student
 * @param {ObjectId|string|null} teacherRecordId
 * @param {ObjectId|string|null} teacherUserId
 * @param {ObjectId|string} adminUserId
 */
async function ensureDropoutNotification(student, teacherRecordId, teacherUserId, adminUserId) {
    if (!teacherRecordId) {
        logger.warn({ name: student.name }, "No teacher found for student, skipping dropout notification");
        return null;
    }

    const existing = await Notification.findOne({
        type: "dropout",
        teacher: teacherRecordId,
        "meta.studentId": student._id,
    });

    if (existing) {
        existing.resolvedByUsers = [];
        existing.resolved = false;
        existing.createdByAdmin = adminUserId;
        await existing.save();
        return existing;
    }

    return Notification.create({
        type: "dropout",
        teacher: teacherRecordId,
        createdByAdmin: adminUserId,
        message: `Eleven ${student.name} har markerats som avbrott (inaktiv).`,
        meta: {
            teacherId: teacherUserId,
            studentId: student._id,
            url: `/student/${student._id}`,
        },
        resolved: false,
        resolvedByUsers: [],
    });
}

/**
 * Execute the full avbrott cascade for a student. Idempotent: calling it again
 * on an already-dropped student re-verifies the side effects (e.g. after a
 * teacher change) without double-processing.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.studentId
 * @param {ObjectId|string} [params.userId] - the acting user (null = system).
 * @param {string} [params.role] - acting role ("system" for automation).
 * @param {string} [params.reason] - optional reason recorded in the cascade.
 * @returns {Promise<{success: boolean, student: Object, conversationId: string|null, deletedExamAttendance: number, deletedProvning: number, deletedEmptyExams: number, removedFromEvents: number, deletedEmptyEvents: number, droppedEnrollments: number, wasAlreadyDropout: boolean}>}
 */
export const performStudentDropout = async ({ studentId, userId, role, reason }) => {
    const student = await Student.findById(studentId).populate({
        path: "teacherId",
        populate: { path: "userId", select: "_id username email" },
    });
    if (!student) {
        const error = new Error("Student not found");
        error.statusCode = 404;
        throw error;
    }

    const wasAlreadyDropout = student.dropout;
    if (!student.dropout) {
        student.dropout = true;
    }

    if (!wasAlreadyDropout) {
        if (!student.changeHistory) student.changeHistory = [];
        student.changeHistory.push({
            timestamp: new Date(),
            changedBy: userId || null,
            changedByRole: role || "system",
            changes: ["dropout"],
            previousValues: { dropout: false },
            newValues: { dropout: true },
            reason: reason || null,
        });
    }
    await student.save();

    // Snapshot the live inactivity signal before the cascade drops the
    // enrollments so the discussion thread shows the triggering status.
    let dropoutSignalSummary = "";
    await safeInactivitySideEffect(async () => {
        const signal = await computeLiveInactivitySignal({
            studentId: student._id.toString(),
            email: student.email,
        });
        if (signal) dropoutSignalSummary = summarizeInactivitySignal(signal, student.name);
        return null;
    }, "inactivity_signal_snapshot_for_dropout");

    let droppedEnrollments = 0;
    try {
        const enrollmentsToDrop = await StudentEnrollment.find({
            studentId: student._id,
            status: { $in: CASCADE_DROPOUT_STATUSES },
        });
        for (const enrollment of enrollmentsToDrop) {
            await enrollment.changeStatus(
                "dropped",
                reason || "Student marked as dropout (Avbrott)",
                null,
                userId
            );
            droppedEnrollments += 1;
        }
        if (droppedEnrollments > 0) {
            logger.info(
                { count: droppedEnrollments, name: student.name },
                "Cascaded dropout to enrollments"
            );
        }
    } catch (cascadeError) {
        logger.error(
            { err: cascadeError, name: student.name },
            "Error cascading dropout to enrollments"
        );
    }

    // ── Slutprovslista: remove ExamAttendance records, then delete exams that
    //    become empty. Idempotent by construction (deleteMany).
    const studentObjectId = mongoose.Types.ObjectId.isValid(student._id)
        ? new mongoose.Types.ObjectId(student._id)
        : student._id;

    const allExamAttendance = await ExamAttendance.find({ studentId: studentObjectId });
    const deletedExamAttendance = (await ExamAttendance.deleteMany({
        studentId: studentObjectId,
    })).deletedCount || 0;

    let deletedEmptyExams = 0;
    const examGroups = new Map();
    for (const attendance of allExamAttendance) {
        const examDateStart = new Date(attendance.examDate);
        examDateStart.setHours(0, 0, 0, 0);
        const examDateEnd = new Date(examDateStart);
        examDateEnd.setHours(23, 59, 59, 999);
        const examKey = `${examDateStart.toISOString()}_${attendance.teacherId}_${attendance.courseId || "null"}`;
        if (!examGroups.has(examKey)) {
            examGroups.set(examKey, {
                examDateStart,
                examDateEnd,
                teacherId: attendance.teacherId,
                courseId: attendance.courseId,
            });
        }
    }
    for (const examGroup of examGroups.values()) {
        const examQuery = {
            $and: [
                { examDate: { $gte: examGroup.examDateStart, $lte: examGroup.examDateEnd } },
                { teacherId: examGroup.teacherId },
            ],
        };
        if (examGroup.courseId) {
            examQuery.$and.push({ courseId: examGroup.courseId });
        } else {
            examQuery.$and.push({ $or: [{ courseId: null }, { courseId: { $exists: false } }] });
        }
        const remaining = await ExamAttendance.countDocuments(examQuery);
        if (remaining === 0) {
            deletedEmptyExams += (await ExamAttendance.deleteMany(examQuery)).deletedCount || 0;
        }
    }

    // ── Prövningar (challenge exams): remove all registrations.
    const deletedProvning = (await Provning.deleteMany({
        studentId: studentObjectId,
    })).deletedCount || 0;

    // ── Persisted calendar slutprov events: pull the student out and delete
    //    now-empty events (durable removal; read endpoints filter too).
    let removedFromEvents = 0;
    let deletedEmptyEvents = 0;
    try {
        const pullResult = await CalendarEvent.updateMany(
            {
                "extendedProps.type": "slutprov",
                "extendedProps.students._id": studentObjectId,
            },
            { $pull: { "extendedProps.students": { _id: studentObjectId } } }
        );
        removedFromEvents = pullResult.modifiedCount || 0;

        const emptyEvents = await CalendarEvent.find({
            "extendedProps.type": "slutprov",
            $or: [
                { "extendedProps.students": { $size: 0 } },
                { "extendedProps.students": { $exists: false } },
                { "extendedProps.students": null },
            ],
        }).select("_id");

        if (emptyEvents.length > 0) {
            deletedEmptyEvents = (await CalendarEvent.deleteMany({
                _id: { $in: emptyEvents.map((e) => e._id) },
            })).deletedCount || 0;
        }
    } catch (eventError) {
        logger.error({ err: eventError, name: student.name }, "Error cleaning up calendar events for dropout student");
    }

    // ── Teacher notification + discussion thread (non-fatal).
    const { teacherRecord, teacherUserId } = await resolveResponsibleTeacherForDropout(student);
    if (teacherRecord?._id) {
        await ensureDropoutNotification(student, teacherRecord._id, teacherUserId, userId);
    }

    let conversationId = null;
    await safeInactivitySideEffect(async () => {
        if (!teacherUserId) return null;
        const thread = await ensureInactivityDiscussionThread({
            studentId: student._id.toString(),
            adminUserId: userId,
            teacherUserId,
            studentName: student.name,
            actionLabel: "Eleven har avslutats (avbrott) på grund av inaktivitet",
            signalSummary: dropoutSignalSummary,
        });
        conversationId = thread?._id?.toString() || null;
        return null;
    }, "inactivity_discussion_thread_for_dropout");

    return {
        success: true,
        student,
        conversationId,
        deletedExamAttendance,
        deletedProvning,
        deletedEmptyExams,
        removedFromEvents,
        deletedEmptyEvents,
        droppedEnrollments,
        wasAlreadyDropout,
    };
};

/**
 * Remove the dropout flag and re-sync calendar events (admin action or
 * re-registration). Mirrors the controller's removeStudentDropout logic so all
 * paths behave the same.
 * @param {Object} params
 * @param {string|ObjectId} params.studentId
 * @param {ObjectId|string} [params.userId]
 * @param {string} [params.role]
 * @returns {Promise<{success: boolean, wasDropout: boolean, student: Object, resolvedNotifications: number, reSyncedEnrollments: number}>}
 */
export const removeStudentDropoutRecord = async ({ studentId, userId, role }) => {
    const student = await Student.findById(studentId);
    if (!student) {
        const error = new Error("Student not found");
        error.statusCode = 404;
        throw error;
    }

    const wasDropout = student.dropout;
    if (wasDropout) {
        student.dropout = false;
        if (!student.changeHistory) student.changeHistory = [];
        student.changeHistory.push({
            timestamp: new Date(),
            changedBy: userId || null,
            changedByRole: role || "system",
            changes: ["dropout"],
            previousValues: { dropout: true },
            newValues: { dropout: false },
        });
        await student.save();
    }

    const resolvedNotifications = (await Notification.updateMany(
        {
            type: "dropout",
            "meta.studentId": student._id,
            resolved: false,
        },
        {
            $set: {
                resolved: true,
                resolvedBy: userId,
                resolvedAt: new Date(),
            },
        }
    )).modifiedCount || 0;

    let reSyncedEnrollments = 0;
    if (wasDropout) {
        try {
            const { syncCalendarEventFromEnrollment, syncCalendarEventsForStudent } =
                await import("../utils/calendarEventSync.js");
            const enrollments = await StudentEnrollment.find({
                studentId: student._id,
                slutprovDate: { $ne: null },
            }).select("_id");
            for (const enrollment of enrollments) {
                await syncCalendarEventFromEnrollment(enrollment._id);
                reSyncedEnrollments += 1;
            }
            if (student.finalExamDate) {
                await syncCalendarEventsForStudent(student._id);
            }
        } catch (syncError) {
            logger.error({ err: syncError, name: student.name }, "Error re-syncing calendar events after dropout removal");
        }
    }

    return {
        success: true,
        wasDropout,
        student,
        resolvedNotifications,
        reSyncedEnrollments,
    };
};

/**
 * Re-registration revival: clear the dropout flag and reset the inactivity
 * warning markers so a newly re-enrolled student starts a fresh activity
 * window. Adds an audit trail entry.
 * @param {Object} studentDoc - a Student document.
 * @param {ObjectId|string} [userId]
 * @param {string} [role]
 * @returns {Promise<Object>} the (possibly saved) student document.
 */
export const reactivateStudent = async ({ studentDoc, userId, role }) => {
    if (!studentDoc) return null;

    const wasDropout = !!studentDoc.dropout;
    const hadWarningMarkers = (studentDoc.changeHistory || []).some(
        (entry) => entry.changes && entry.changes.includes("inactivity_warning_email")
    );

    if (studentDoc.dropout) studentDoc.dropout = false;
    if (hadWarningMarkers && Array.isArray(studentDoc.changeHistory)) {
        studentDoc.changeHistory = studentDoc.changeHistory.filter(
            (entry) => !(entry.changes && entry.changes.includes("inactivity_warning_email"))
        );
    }

    if (wasDropout || hadWarningMarkers) {
        if (!studentDoc.changeHistory) studentDoc.changeHistory = [];
        studentDoc.changeHistory.push({
            timestamp: new Date(),
            changedBy: userId || null,
            changedByRole: role || "system",
            changes: ["re_registration"],
            previousValues: { dropout: wasDropout },
            newValues: { dropout: false },
        });
        await studentDoc.save();
        logger.info(
            { studentId: studentDoc._id, name: studentDoc.name },
            "Reactivated previously dropout student via re-registration"
        );
    }

    return studentDoc;
};
