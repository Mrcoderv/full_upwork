/**
 * Inactive-student automation (Etapp 2, P0).
 *
 * The inactivity *report* is computed on demand; this scanner is the
 * automation loop that turns the report's flags into actions:
 *
 *   1. It runs the same batched evaluation as the report (no per-student N+1).
 *   2. For every student at or past the warning threshold
 *      (INACTIVITY_WARNING_DAYS without login/submission), it AUTO-SENDS the
 *      warning email stating the specific withdrawal date.
 *   3. Idempotency: a student is only emailed once — the send is recorded in
 *      the student's changeHistory with the same marker used by the manual
 *      admin action ("inactivity_warning_email"), so re-runs skip them and the
 *      report surfaces warningSentAt/warnedWithdrawalDate.
 *   4. Every automated send is auditable (changedByRole "system" + timestamp)
 *      and mirrors the manual path's teacher notification + discussion thread.
 *
 * The scan is deliberately non-fatal: a per-student failure is logged and the
 * scan continues. It is safe to run on a schedule (see scheduler.js) or
 * manually (POST /api/inactivity/scan).
 */
import logger from "../utils/logger.js";
import Student from "../models/Student.js";
import User from "../models/User.js";
import Teacher from "../models/Teacher.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import CourseInstance from "../models/CourseInstance.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import Conversation from "../models/Conversation.js";
import {
    ACTIVE_ENROLLMENT_STATUSES,
    INACTIVITY_WITHDRAW_DAYS,
    INACTIVITY_WARNING_DAYS,
    computeInactivitySignal,
} from "../utils/inactivityStatus.js";
import { sendInactivityWarningEmail } from "./emailService.js";
import {
    notifyInactivityAction,
    safeInactivitySideEffect,
    summarizeInactivitySignal,
} from "./inactivityDiscussionService.js";
import { performStudentDropout } from "./dropoutService.js";

const uniq = (values) => [...new Set(values.filter(Boolean))];

/** Auto-send is on unless explicitly disabled. */
export const AUTO_WARNING_ENABLED = process.env.INACTIVITY_AUTO_WARNING_ENABLED !== "false";

/** Auto-withdraw is on unless explicitly disabled (default on). */
export const AUTO_WITHDRAW_ENABLED = process.env.INACTIVITY_AUTO_WITHDRAW_ENABLED !== "false";

const SYSTEM_ROLE = "system";

let lastScanAt = null;
let lastScanSummary = null;

export const getLastScanSummary = () =>
    lastScanSummary ? { ...lastScanSummary, lastScanAt } : null;

const hasSentWarning = (student) =>
    (student.changeHistory || []).some(
        (entry) => entry.changes && entry.changes.includes("inactivity_warning_email")
    );

/**
 * The withdrawal date stated in the student's latest inactivity warning email
 * (when one has been sent), from the audited change history.
 * @param {Object} student
 * @returns {{ warningSentAt: Date|null, warnedWithdrawalDate: Date|null }}
 */
export const latestInactivityWarning = (student) => {
    const entry = (student.changeHistory || [])
        .filter((item) => item.changes && item.changes.includes("inactivity_warning_email"))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    if (!entry) return { warningSentAt: null, warnedWithdrawalDate: null };
    return {
        warningSentAt: entry.timestamp,
        warnedWithdrawalDate: entry.newValues?.withdrawalDate || null,
    };
};

/**
 * Load every student currently expected to study, batched, and compute their
 * inactivity signal — the same evaluation the report endpoint performs.
 * @param {Date} today
 * @returns {Promise<Array<{ student, user, signal, enrollments, teacherUserId, teacherName }>>}
 */
async function evaluateActiveStudents(today) {
    const enrollments = await StudentEnrollment.find({
        status: { $in: ACTIVE_ENROLLMENT_STATUSES },
        endDate: { $gte: today },
    })
        .select("studentId courseInstanceId startDate endDate status teacherId")
        .lean();

    if (enrollments.length === 0) return [];

    const studentIds = uniq(enrollments.map((e) => e.studentId));
    const courseInstanceIds = uniq(enrollments.map((e) => e.courseInstanceId));
    const enrollmentIds = enrollments.map((e) => e._id);
    const enrollmentTeacherIds = uniq(enrollments.map((e) => e.teacherId));

    const [students, courseInstances, submissions, teachers] = await Promise.all([
        Student.find({ _id: { $in: studentIds } })
            .select("name email changeHistory")
            .lean(),
        CourseInstance.find({ _id: { $in: courseInstanceIds } })
            .select("courseName")
            .lean(),
        AssignmentSubmission.find({ enrollmentId: { $in: enrollmentIds } })
            .select("studentId submittedAt feedback revisionDecision")
            .lean(),
        enrollmentTeacherIds.length
            ? Teacher.find({ _id: { $in: enrollmentTeacherIds } })
                  .select("userId")
                  .lean()
            : Promise.resolve([]),
    ]);

    const teacherUserIds = uniq(teachers.map((t) => t.userId));
    const teacherUsers = teacherUserIds.length
        ? await User.find({ _id: { $in: teacherUserIds } })
              .select("name email")
              .lean()
        : [];

    const emails = uniq(students.map((s) => s.email));
    const users = emails.length
        ? await User.find({ email: { $in: emails } }).select("email lastLoginAt").lean()
        : [];

    const studentsById = new Map(students.map((s) => [s._id.toString(), s]));
    const usersByEmail = new Map(users.map((u) => [String(u.email).toLowerCase(), u]));
    const teacherUserByName = new Map(
        teacherUsers.map((u) => [u._id.toString(), u.name || u.email || ""])
    );
    const teacherIdToUser = new Map(
        teachers.map((t) => [t._id.toString(), t.userId?.toString()])
    );

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

        let teacherId = null;
        let teacherUserId = null;
        let teacherName = "";
        for (const enrollment of studentEnrollments) {
            const teacherRecordId = enrollment.teacherId?.toString();
            const userId = teacherIdToUser.get(teacherRecordId);
            if (userId) {
                teacherId = teacherRecordId;
                teacherUserId = userId;
                teacherName = teacherUserByName.get(userId) || "";
                break;
            }
        }

        rows.push({
            studentId,
            student,
            user,
            signal,
            teacherId,
            teacherUserId,
            teacherName,
        });
    }
    return rows;
}

/**
 * Auto-send the warning email for a single student and record the audit trail.
 * Mirrors the manual admin path (sendInactivityWarning) so the report's
 * warningSentAt/warnedWithdrawalDate and the teacher discussion thread behave
 * identically for automated sends.
 * @param {{ studentId: string, student: Object, signal: Object, teacherId: string|null, teacherUserId: string|null, teacherName: string, today: Date }} ctx
 * @returns {Promise<{sent: boolean, reason?: string, error?: string}>}
 */
async function warnStudent({ studentId, student, signal, teacherId, teacherUserId, teacherName, today }) {
    if (!student.email) {
        return { sent: false, reason: "no_email" };
    }
    if (hasSentWarning(student)) {
        return { sent: false, reason: "already_warned" };
    }

    const withdrawalDate = new Date(today);
    withdrawalDate.setDate(withdrawalDate.getDate() + INACTIVITY_WITHDRAW_DAYS);

    const result = await sendInactivityWarningEmail({
        studentName: student.name,
        email: student.email,
        withdrawalDate,
    });

    if (!result.sent) {
        logger.warn(
            { studentId, reason: result.reason, err: result.result },
            "Auto inactivity warning email failed — will retry on next scan"
        );
        return { sent: false, reason: result.reason || "send_failed", error: result.result?.error };
    }

    const sentAt = new Date();
    const updated = await Student.findOneAndUpdate(
        { _id: studentId, "changeHistory.changes": { $nin: ["inactivity_warning_email"] } },
        {
            $push: {
                changeHistory: {
                    timestamp: sentAt,
                    changedBy: null,
                    changedByRole: SYSTEM_ROLE,
                    changes: ["inactivity_warning_email", "auto"],
                    newValues: { withdrawalDate },
                },
            },
        },
        { new: true }
    );

    if (!updated) {
        logger.info({ studentId }, "Auto warning already recorded — skipping duplicate");
        return { sent: false, reason: "already_warned" };
    }

    const signalSummary = summarizeInactivitySignal(signal, student.name);

    // Best-effort teacher notification + discussion thread (never fatal).
    await safeInactivitySideEffect(async () => {
        if (!teacherId || !teacherUserId) return null;
        await notifyInactivityAction({
            studentId,
            studentName: student.name,
            teacherId,
            teacherUserId,
            adminUserId: null,
            action: "warning_email",
            signalSummary,
        });
        return null;
    }, "auto_warning_notify_teacher");

    logger.info(
        { studentId, studentName: student.name, withdrawalDate },
        "Auto inactivity warning email sent"
    );
    return { sent: true, withdrawalDate };
}

/**
 * Auto-withdraw a single student whose warning deadline has passed without any
 * resumed activity. Runs the full avbrott cascade so the student is removed
 * from slutprovslista/APL/exams and their courses are dropped consistently.
 * @param {Object} row - an evaluateActiveStudents row.
 * @returns {Promise<{withdrawn: boolean, reason?: string}>}
 */
async function withdrawStudent(row) {
    const { studentId, student, signal, today } = row;
    if (!signal.mustWithdraw) {
        return { withdrawn: false, reason: "activity_resumed" };
    }

    const { warnedWithdrawalDate } = latestInactivityWarning(student);
    const due = warnedWithdrawalDate
        ? warnedWithdrawalDate.getTime() <= today.getTime()
        : false;
    if (!due) {
        return { withdrawn: false, reason: "deadline_not_reached" };
    }

    const result = await performStudentDropout({
        studentId,
        userId: null,
        role: SYSTEM_ROLE,
        reason: "Auto-avbrott efter varning utan återupptagen aktivitet (inaktivitet)",
    });
    if (!result.success) {
        return { withdrawn: false, reason: "cascade_failed" };
    }

    // Audit marker making the automation explicit in the student's history
    // (the cascade already records a "dropout" entry with changedByRole system).
    await Student.updateOne(
        { _id: studentId, "changeHistory.changes": { $nin: ["inactivity_auto_withdraw"] } },
        {
            $push: {
                changeHistory: {
                    timestamp: new Date(),
                    changedBy: null,
                    changedByRole: SYSTEM_ROLE,
                    changes: ["inactivity_auto_withdraw", "auto"],
                    newValues: { withdrawalDate: warnedWithdrawalDate, triggeredAt: new Date() },
                },
            },
        }
    ).catch((error) => logger.warn({ err: error, studentId }, "Failed to record auto-withdraw audit marker"));

    logger.info(
        { studentId, studentName: student.name, warnedWithdrawalDate },
        "Auto-withdrew inactive student after warning deadline"
    );
    return { withdrawn: true };
}

/**
 * Run the inactivity automation scan.
 *
 * Batched evaluation over all currently-expected students; sends the warning
 * email to every student past the warning threshold that has not been warned
 * yet, and auto-withdraws students whose warned withdrawal date has passed
 * without resumed activity. Never throws — failures are collected and reported
 * so a scheduled run cannot crash the process.
 *
 * @param {{ today?: Date, autoSend?: boolean }} [options]
 * @returns {Promise<{ evaluated: number, inactiveForWarning: number, warned: number, alreadyWarned: number, noEmail: number, autoWithdrawn: number, withdrawPending: number, failed: number, autoSend: boolean, autoWithdraw: boolean, failures: Array<{studentId: string, reason: string}> }>}
 */
export async function runInactivityScan({ today = new Date(), autoSend = AUTO_WARNING_ENABLED } = {}) {
    const summary = {
        evaluated: 0,
        inactiveForWarning: 0,
        warned: 0,
        alreadyWarned: 0,
        noEmail: 0,
        autoWithdrawn: 0,
        withdrawPending: 0,
        failed: 0,
        autoSend,
        autoWithdraw: AUTO_WITHDRAW_ENABLED,
        failures: [],
    };

    try {
        const rows = await evaluateActiveStudents(today);
        summary.evaluated = rows.length;

        const candidates = rows.filter((row) => row.signal.inactiveForWarning);
        summary.inactiveForWarning = candidates.length;

        for (const row of candidates) {
            const { studentId, student, signal, teacherId, teacherUserId, teacherName } = row;
            try {
                if (hasSentWarning(student)) {
                    summary.alreadyWarned += 1;
                    continue;
                }
                if (!student.email) {
                    summary.noEmail += 1;
                    summary.failures.push({ studentId, reason: "no_email" });
                    continue;
                }
                if (!autoSend) {
                    // Flagged but automation disabled — leave for the report/manual action.
                    continue;
                }
                const result = await warnStudent({
                    studentId,
                    student,
                    signal,
                    teacherId,
                    teacherUserId,
                    teacherName,
                    today,
                });
                if (result.sent) {
                    summary.warned += 1;
                } else if (result.reason === "already_warned") {
                    summary.alreadyWarned += 1;
                } else {
                    summary.failed += 1;
                    summary.failures.push({ studentId, reason: result.reason || "send_failed" });
                }
            } catch (error) {
                summary.failed += 1;
                summary.failures.push({ studentId, reason: error.message });
                logger.error({ err: error, studentId }, "Auto inactivity warning failed (non-fatal)");
            }
        }

        // Auto-withdraw pass: students whose warning email's stated withdrawal
        // date has passed without resumed activity. Runs after the warning pass
        // so a warning sent today schedules the next scan's withdrawal.
        if (AUTO_WITHDRAW_ENABLED) {
            for (const row of rows) {
                const { studentId } = row;
                try {
                    if (row.signal.mustWithdraw && hasSentWarning(row.student)) {
                        const result = await withdrawStudent({ ...row, today });
                        if (result.withdrawn) {
                            summary.autoWithdrawn += 1;
                        } else {
                            summary.withdrawPending += 1;
                        }
                    }
                } catch (error) {
                    summary.failed += 1;
                    summary.failures.push({ studentId, reason: error.message });
                    logger.error({ err: error, studentId }, "Auto-withdraw failed (non-fatal)");
                }
            }
        }
    } catch (error) {
        logger.error({ err: error }, "Inactivity scan aborted (non-fatal)");
        summary.failed += 1;
        summary.failures.push({ studentId: null, reason: error.message });
    }

    lastScanAt = new Date();
    lastScanSummary = summary;
    return summary;
}
