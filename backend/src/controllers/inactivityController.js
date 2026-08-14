import Student from "../models/Student.js";
import User from "../models/User.js";
import Teacher from "../models/Teacher.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import CourseInstance from "../models/CourseInstance.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import {
    ACTIVE_ENROLLMENT_STATUSES,
    INACTIVITY_WITHDRAW_DAYS,
    INACTIVITY_WARNING_DAYS,
    computeInactivitySignal,
} from "../utils/inactivityStatus.js";
import { sendInactivityWarningEmail } from "../services/emailService.js";

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

    const [students, courseInstances, submissions] = await Promise.all([
        Student.find({ _id: { $in: studentIds } })
            .select("name personalNumber email municipality changeHistory")
            .lean(),
        CourseInstance.find({ _id: { $in: courseInstanceIds } })
            .select("courseName")
            .lean(),
        AssignmentSubmission.find({ enrollmentId: { $in: enrollmentIds } })
            .select("studentId submittedAt feedback revisionDecision")
            .lean(),
    ]);

    const emails = uniq(students.map((s) => s.email));
    const users = emails.length
        ? await User.find({ email: { $in: emails } }).select("email lastLoginAt").lean()
        : [];

    const studentsById = new Map(students.map((s) => [s._id.toString(), s]));
    const courseNameById = new Map(
        courseInstances.map((c) => [c._id.toString(), c.courseName || ""])
    );
    const usersByEmail = new Map(users.map((u) => [String(u.email).toLowerCase(), u]));

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

        rows.push({
            studentId,
            name: student.name,
            personalNumber: student.personalNumber,
            email: student.email,
            municipality: municipalityLabel(student.municipality),
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
            enrollments: studentEnrollments.map((enrollment) => ({
                courseInstanceId: enrollment.courseInstanceId,
                courseName: courseNameById.get(enrollment.courseInstanceId?.toString()) || "",
                startDate: enrollment.startDate,
                endDate: enrollment.endDate,
                status: enrollment.status,
                teacherId: enrollment.teacherId,
            })),
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
 * POST /api/inactivity/:studentId/warning-email
 * Admin action (Phase 4B): send the inactivity warning email to a flagged
 * student, stating the withdrawal date (today + INACTIVITY_WITHDRAW_DAYS).
 * Records the send in the student's change history; the report then surfaces
 * warningSentAt/warnedWithdrawalDate.
 */
export const sendInactivityWarning = async (req, res) => {
    const { studentId } = req.params;
    const student = await Student.findById(studentId).select("name email changeHistory");
    if (!student) {
        return res.status(404).json({ error: "Student not found" });
    }
    if (!student.email) {
        return res.status(400).json({ error: "Student has no email address" });
    }

    const withdrawalDate = new Date();
    withdrawalDate.setDate(withdrawalDate.getDate() + INACTIVITY_WITHDRAW_DAYS);

    const result = await sendInactivityWarningEmail({
        studentName: student.name,
        email: student.email,
        withdrawalDate,
    });

    let warningSentAt = null;
    if (result.sent) {
        warningSentAt = new Date();
        if (!student.changeHistory) student.changeHistory = [];
        student.changeHistory.push({
            timestamp: warningSentAt,
            changedBy: req.user.userId,
            changedByRole: req.user.role,
            changes: ["inactivity_warning_email"],
            newValues: { withdrawalDate },
        });
        await student.save();
    }

    res.status(result.sent ? 200 : 502).json({
        success: result.sent,
        emailResult: result.result,
        warningSentAt,
        withdrawalDate,
    });
};
