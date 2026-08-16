import Student from "../models/Student.js";
import User from "../models/User.js";
import Teacher from "../models/Teacher.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import CourseInstance from "../models/CourseInstance.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import Conversation from "../models/Conversation.js";
import Notification from "../models/Notification.js";
import NOTIFICATION_TYPES from "./notificationTypes.js";
import {
    ACTIVE_ENROLLMENT_STATUSES,
    INACTIVITY_WITHDRAW_DAYS,
    INACTIVITY_WARNING_DAYS,
    computeInactivitySignal,
} from "../utils/inactivityStatus.js";
import {
    sendInactivityWarningEmail,
} from "../services/emailService.js";
import {
    computeLiveInactivitySignal,
    ensureInactivityDiscussionThread,
    notifyInactivityAction,
    resolveResponsibleTeacher,
    safeInactivitySideEffect,
    summarizeInactivitySignal,
} from "../services/inactivityDiscussionService.js";
import {
    getLastScanSummary,
    runInactivityScan,
} from "../services/inactivityScanner.js";
import { performStudentDropout } from "../services/dropoutService.js";

const uniq = (values) => [...new Set(values.filter(Boolean))];

const municipalityLabel = (value) => {
    if (typeof value === "string") return value;
    if (value && typeof value.type === "string") return value.type;
    return "";
};

const latestInactivityWarning = (student) => {
    const entry = (student.changeHistory || [])
        .filter((item) => item.changes && item.changes.includes("inactivity_warning_email"))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    if (!entry) return { warningSentAt: null, warnedWithdrawalDate: null };
    return {
        warningSentAt: entry.timestamp,
        warnedWithdrawalDate: entry.newValues?.withdrawalDate || null,
    };
};

const buildReport = (today) => ({
    generatedAt: today,
    thresholds: {
        withdrawDays: INACTIVITY_WITHDRAW_DAYS,
        warningDays: INACTIVITY_WARNING_DAYS,
    },
    summary: {
        evaluated: 0,
        mustWithdraw: 0,
        inactiveForWarning: 0,
        ok: 0,
    },
    students: [],
});

/**
 * GET /api/inactivity/report
 * Computed-only inactivity report (Phase 4A): no emails, no withdrawals.
 * Admins/systemadmins see every evaluated student; teachers only see students
 * on their own enrollments.
 */
export const getInactivityReport = async (req, res) => {
    const today = new Date();
    const isTeacherScope = req.user?.role === "teacher";

    let teacherIds = null;
    if (isTeacherScope) {
        const teacherRecords = await Teacher.find({ userId: req.user.userId })
            .select("_id")
            .lean();
        teacherIds = teacherRecords.map((t) => t._id.toString());
        if (teacherIds.length === 0) {
            return res.status(200).json(buildReport(today));
        }
    }

    const enrollmentQuery = {
        status: { $in: ACTIVE_ENROLLMENT_STATUSES },
        endDate: { $gte: today },
    };
    if (teacherIds) {
        enrollmentQuery.teacherId = { $in: teacherIds };
    }

    const enrollments = await StudentEnrollment.find(enrollmentQuery)
        .select("studentId courseInstanceId startDate endDate status teacherId")
        .lean();

    if (enrollments.length === 0) {
        return res.status(200).json(buildReport(today));
    }

    const studentIds = uniq(enrollments.map((e) => e.studentId));
    const courseInstanceIds = uniq(enrollments.map((e) => e.courseInstanceId));
    const enrollmentIds = enrollments.map((e) => e._id);
    const enrollmentTeacherIds = uniq(enrollments.map((e) => e.teacherId));

    const [students, courseInstances, submissions, teachers] = await Promise.all([
        Student.find({ _id: { $in: studentIds } })
            .select("name personalNumber email municipality changeHistory")
            .lean(),
        CourseInstance.find({ _id: { $in: courseInstanceIds } })
            .select("courseName")
            .lean(),
        AssignmentSubmission.find({ enrollmentId: { $in: enrollmentIds } })
            .select("studentId submittedAt feedback revisionDecision")
            .lean(),
        enrollmentTeacherIds.length
            ? Teacher.find({ _id: { $in: enrollmentTeacherIds } }).select("userId").lean()
            : Promise.resolve([]),
    ]);
    const teacherUserIds = enrollmentTeacherIds.length
        ? uniq(teachers.map((t) => t.userId))
        : [];
    let teacherNames = [];
    if (teacherUserIds.length) {
        teacherNames = await User.find({ _id: { $in: teacherUserIds } })
            .select("name email")
            .lean();
    }

    const discussionThreads = await Conversation.find({ studentId: { $in: studentIds } })
        .select("studentId participants")
        .lean();
    const threadByStudent = new Map();
    for (const thread of discussionThreads) {
        const key = thread.studentId?.toString();
        if (!key) continue;
        if (!threadByStudent.has(key) || thread.participants.length > threadByStudent.get(key).participantCount) {
            threadByStudent.set(key, {
                conversationId: thread._id.toString(),
                participantCount: thread.participants.length,
            });
        }
    }

    const emails = uniq(students.map((s) => s.email));
    const users = emails.length
        ? await User.find({ email: { $in: emails } }).select("email lastLoginAt").lean()
        : [];

    const studentsById = new Map(students.map((s) => [s._id.toString(), s]));
    const courseNameById = new Map(
        courseInstances.map((c) => [c._id.toString(), c.courseName || ""])
    );
    const usersByEmail = new Map(users.map((u) => [String(u.email).toLowerCase(), u]));

    const teacherByName = new Map(
        teacherNames.map((u) => [u._id.toString(), u.name || u.email || ""])
    );
    const teacherIdToUser = new Map(teachers.map((t) => [t._id.toString(), t.userId?.toString()]));
    const resolveTeacherForEnrollment = (enrollment) => {
        const teacherUserId = teacherIdToUser.get(enrollment.teacherId?.toString());
        if (!teacherUserId) return { teacherName: "", teacherUserId: null };
        return {
            teacherName: teacherByName.get(teacherUserId) || "",
            teacherUserId,
        };
    };

    const submissionsByStudent = new Map();
    for (const submission of submissions) {
        const key = submission.studentId?.toString();
        if (!key) continue;
        const entry = submissionsByStudent.get(key) || { lastAt: null, open: 0 };
        if (
            !submission.feedback ||
            (submission.feedback.status !== "godkänd" &&
                submission.revisionDecision !== "godkänd")
        ) {
            entry.open += 1;
        }
        if (submission.submittedAt) {
            const ts = new Date(submission.submittedAt).getTime();
            if (!entry.lastAt || ts > entry.lastAt) entry.lastAt = ts;
        }
        submissionsByStudent.set(key, entry);
    }

    const byStudent = new Map();
    for (const enrollment of enrollments) {
        const key = enrollment.studentId?.toString();
        if (!key) continue;
        if (!byStudent.has(key)) byStudent.set(key, []);
        byStudent.get(key).push(enrollment);
    }

    const rows = [];
    for (const [studentId, studentEnrollments] of byStudent) {
        const student = studentsById.get(studentId);
        if (!student) continue;
        const user = usersByEmail.get(String(student.email || "").toLowerCase());
        const activity = submissionsByStudent.get(studentId);
        const signal = computeInactivitySignal({
            lastLoginAt: user?.lastLoginAt || null,
            enrollments: studentEnrollments,
            lastSubmissionAt: activity?.lastAt ? new Date(activity.lastAt) : null,
            openSubmissions: activity?.open || 0,
            today,
        });
        if (!signal.evaluated) continue;

        const { warningSentAt, warnedWithdrawalDate } = latestInactivityWarning(student);

        const responsible = studentEnrollments
            .map(resolveTeacherForEnrollment)
            .find((entry) => entry.teacherName || entry.teacherUserId);

        rows.push({
            studentId,
            name: student.name,
            personalNumber: student.personalNumber,
            email: student.email,
            municipality: municipalityLabel(student.municipality),
            responsibleTeacher: responsible?.teacherName || "",
            responsibleTeacherUserId: responsible?.teacherUserId || null,
            conversationId: threadByStudent.get(studentId)?.conversationId || null,
            lastLoginAt: user?.lastLoginAt || null,
            daysSinceLastLogin: signal.daysSinceLastLogin,
            daysSinceLastSubmission: signal.daysSinceLastSubmission,
            daysSinceWindowStart: signal.daysSinceWindowStart,
            openSubmissions: signal.openSubmissions,
            mustWithdraw: signal.mustWithdraw,
            inactiveForWarning: signal.inactiveForWarning,
            daysUntilWithdraw: signal.daysUntilWithdraw,
            level: signal.level,
            warningSentAt,
            warnedWithdrawalDate,
            windowStart: signal.windowStart,
            windowEnd: signal.windowEnd,
            enrollments: studentEnrollments.map((enrollment) => {
                const { teacherName, teacherUserId: enrollmentTeacherUserId } =
                    resolveTeacherForEnrollment(enrollment);
                return {
                    courseInstanceId: enrollment.courseInstanceId,
                    courseName: courseNameById.get(enrollment.courseInstanceId?.toString()) || "",
                    startDate: enrollment.startDate,
                    endDate: enrollment.endDate,
                    status: enrollment.status,
                    teacherId: enrollment.teacherId,
                    teacherName,
                    teacherUserId: enrollmentTeacherUserId,
                };
            }),
        });
    }

    const rank = { withdraw: 0, warning: 1, ok: 2 };
    rows.sort(
        (a, b) => rank[a.level] - rank[b.level] || b.daysSinceLastLogin - a.daysSinceLastLogin
    );

    res.status(200).json({
        generatedAt: today,
        thresholds: {
            withdrawDays: INACTIVITY_WITHDRAW_DAYS,
            warningDays: INACTIVITY_WARNING_DAYS,
        },
        summary: {
            evaluated: rows.length,
            mustWithdraw: rows.filter((r) => r.mustWithdraw).length,
            inactiveForWarning: rows.filter((r) => r.inactiveForWarning).length,
            ok: rows.filter((r) => r.level === "ok").length,
        },
        students: rows,
    });
};

/**
 * POST /api/inactivity/scan
 * Admin action (P0): run the inactivity automation scan on demand. Evaluates
 * every active student in batch and auto-sends warning emails to those past
 * the warning threshold that have not been warned yet. Idempotent — re-runs
 * never send duplicate emails.
 */
export const runInactivityScanHandler = async (req, res) => {
    const summary = await runInactivityScan();
    res.status(200).json({
        success: true,
        message: "Inaktivitets-skanning klar",
        summary,
    });
};

/**
 * GET /api/inactivity/scan-status
 * Read-only view of the last scan run (when it ran and what it did), for
 * staff auditing that the automation loop is alive.
 */
export const getInactivityScanStatus = async (_req, res) => {
    const summary = getLastScanSummary();
    res.status(200).json({
        success: true,
        autoWarningEnabled: process.env.INACTIVITY_AUTO_WARNING_ENABLED !== "false",
        lastScan: summary,
    });
};

/**
 * Send the inactivity warning email for a student and open the teacher
 * discussion loop. Shared by the report action and the notification action so
 * both paths behave identically.
 * @param {{ studentId: string, actor: { userId: string, role: string } }} args
 * @returns {Promise<{sent: boolean, reason?: string, emailResult?: Object, warningSentAt?: Date, withdrawalDate?: Date, conversationId?: string|null}>}
 */
export const performInactivityWarning = async ({ studentId, actor }) => {
    const student = await Student.findById(studentId).select("name email changeHistory");
    if (!student) return { sent: false, reason: "student_not_found" };
    if (!student.email) return { sent: false, reason: "no_email" };

    const withdrawalDate = new Date();
    withdrawalDate.setDate(withdrawalDate.getDate() + INACTIVITY_WITHDRAW_DAYS);

    const result = await sendInactivityWarningEmail({
        studentName: student.name,
        email: student.email,
        withdrawalDate,
    });

    if (!result.sent) {
        return { sent: false, reason: result.reason || "send_failed", emailResult: result.result };
    }

    const warningSentAt = new Date();
    if (!student.changeHistory) student.changeHistory = [];
    student.changeHistory.push({
        timestamp: warningSentAt,
        changedBy: actor.userId,
        changedByRole: actor.role,
        changes: ["inactivity_warning_email"],
        newValues: { withdrawalDate },
    });
    await student.save();

    let conversationId = null;
    await safeInactivitySideEffect(async () => {
        const responsible = await resolveResponsibleTeacher(studentId);
        if (!responsible) return null;
        const signal = await computeLiveInactivitySignal({
            studentId,
            email: student.email,
        });
        const signalSummary = signal
            ? summarizeInactivitySignal(signal, student.name)
            : "";
        await notifyInactivityAction({
            studentId,
            studentName: student.name,
            teacherId: responsible.teacherId,
            teacherUserId: responsible.userId,
            adminUserId: actor.userId,
            action: "warning_email",
            signalSummary,
        });
        const thread = await ensureInactivityDiscussionThread({
            studentId,
            adminUserId: actor.userId,
            teacherUserId: responsible.userId,
            studentName: student.name,
            actionLabel: "Varningsmail om inaktivitet har skickats",
            signalSummary,
        });
        conversationId = thread?._id?.toString() || null;
        return null;
    }, "notify_teacher_of_warning");

    return {
        sent: true,
        emailResult: result.result,
        warningSentAt,
        withdrawalDate,
        conversationId,
    };
};

/**
 * POST /api/inactivity/:studentId/warning-email
 * Admin action (Phase 4B): send the inactivity warning email to a flagged
 * student, stating the withdrawal date (today + INACTIVITY_WITHDRAW_DAYS).
 * Records the send in the student's change history; the report then surfaces
 * warningSentAt/warnedWithdrawalDate.
 */
export const sendInactivityWarning = async (req, res) => {
    const { studentId } = req.params;
    const result = await performInactivityWarning({
        studentId,
        actor: { userId: req.user.userId, role: req.user.role },
    });

    if (result.reason === "student_not_found") {
        return res.status(404).json({ error: "Student not found" });
    }
    if (result.reason === "no_email") {
        return res.status(400).json({ error: "Student has no email address" });
    }

    res.status(result.sent ? 200 : 502).json({
        success: result.sent,
        emailResult: result.emailResult,
        warningSentAt: result.warningSentAt,
        withdrawalDate: result.withdrawalDate,
        conversationId: result.conversationId || null,
    });
};

/**
 * POST /api/inactivity/notifications/:notificationId/action
 * Admin action straight from the notification (P0): the admin can send the
 * warning email ("warning") or trigger the avbrott cascade ("withdraw") for the
 * student a notification refers to, then the notification is resolved for that
 * admin.
 */
export const performInactivityNotificationAction = async (req, res) => {
    const { notificationId } = req.params;
    const { action } = req.body || {};

    if (!["warning", "withdraw"].includes(action)) {
        return res.status(400).json({ error: "action must be 'warning' or 'withdraw'" });
    }

    const notification = await Notification.findById(notificationId);
    if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
    }
    if (notification.type !== NOTIFICATION_TYPES.INACTIVITY_ACTION) {
        return res.status(400).json({ error: "Not an inactivity notification" });
    }
    const studentId = notification.meta?.studentId;
    if (!studentId) {
        return res.status(400).json({ error: "Notification has no linked student" });
    }

    let result;
    if (action === "warning") {
        result = await performInactivityWarning({
            studentId: studentId.toString(),
            actor: { userId: req.user.userId, role: req.user.role },
        });
        if (result.reason === "student_not_found") {
            return res.status(404).json({ error: "Student not found" });
        }
        if (result.reason === "no_email") {
            return res.status(400).json({ error: "Student has no email address" });
        }
    } else {
        const dropout = await performStudentDropout({
            studentId: studentId.toString(),
            userId: req.user.userId,
            role: req.user.role,
            reason: "Avbrott från inaktivitetsnotis (admin-åtgärd)",
        });
        result = { sent: true, dropout };
    }

    if (result.sent) {
        if (!notification.resolvedByUsers) notification.resolvedByUsers = [];
        const userIdStr = req.user.userId.toString();
        if (!notification.resolvedByUsers.some((u) => u.toString() === userIdStr)) {
            notification.resolvedByUsers.push(req.user.userId);
            await notification.save();
        }
    }

    res.status(200).json({
        success: result.sent,
        action,
        warning: result.sent && action === "warning" ? {
            emailResult: result.emailResult,
            warningSentAt: result.warningSentAt,
            withdrawalDate: result.withdrawalDate,
            conversationId: result.conversationId || null,
        } : undefined,
        dropout: result.sent && action === "withdraw" ? result.dropout : undefined,
    });
};
