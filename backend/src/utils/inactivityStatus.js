/**
 * Inactive-student detection (Etapp 2, Phase 4A).
 *
 * Computes a non-persisted inactivity signal per enrolled student, following
 * the compute-don't-store pattern of aplAutoStatus.js — nothing is written to
 * the database; the flags are attached to API responses only.
 *
 * A student is only evaluated while they have at least one current enrollment
 * (status enrolled/active/reviderad, not yet ended, and already started), i.e.
 * they are expected to be studying right now.
 *
 * Two independent, env-configurable thresholds are reported separately:
 *  - mustWithdraw:        last LOGIN >= INACTIVITY_WITHDRAW_DAYS (default 5)
 *                         days ago -> the student must be withdrawn (municipal
 *                         compliance rule). Login-only per product decision;
 *                         never-logged-in students use their earliest current
 *                         enrollment start date as a proxy.
 *  - inactiveForWarning:  last ACTIVITY (login OR assignment submission) >=
 *                         INACTIVITY_WARNING_DAYS (default 14) days ago ->
 *                         candidate for an automatic warning email. Activity
 *                         based per product decision so it is not automatically
 *                         a superset of mustWithdraw.
 *
 * Schedule adherence is surfaced separately (daysSinceLastSubmission and
 * openSubmissions) rather than folded into the withdraw flag.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Days without login after which the student must be withdrawn (compliance). */
export const INACTIVITY_WITHDRAW_DAYS = (() => {
    const raw = parseInt(process.env.INACTIVITY_WITHDRAW_DAYS, 10);
    return Number.isFinite(raw) && raw >= 1 ? raw : 5;
})();

/** Days without activity after which a warning email is warranted. */
export const INACTIVITY_WARNING_DAYS = (() => {
    const raw = parseInt(process.env.INACTIVITY_WARNING_DAYS || '14', 10);
    return Number.isFinite(raw) && raw >= 1 ? raw : 14;
})();

/** Enrollment statuses that mean the student is still expected to study. */
export const ACTIVE_ENROLLMENT_STATUSES = ["enrolled", "active", "reviderad"];

function toDate(value) {
    if (value === null || value === undefined) return null;
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

function startOfDay(value) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function daysBetween(later, earlier) {
    return Math.round(
        (startOfDay(later).getTime() - startOfDay(earlier).getTime()) / MS_PER_DAY
    );
}

/**
 * Compute the inactivity signal for a single student.
 *
 * @param {Object} params
 * @param {Date|string|null} params.lastLoginAt - the student's last login date.
 * @param {Array} [params.enrollments] - the student's enrollments
 *   ({ status, startDate, endDate } shapes).
 * @param {Date|string|null} [params.lastSubmissionAt] - latest assignment
 *   submission date across the student's current enrollments.
 * @param {number} [params.openSubmissions] - submissions not yet accepted.
 * @param {Date} [params.today] - reference date (injectable for tests).
 * @returns {{
 *   evaluated: boolean, relevantCount: number,
 *   windowStart: (Date|null), windowEnd: (Date|null),
 *   daysSinceLastLogin: (number|null), daysSinceLastSubmission: (number|null),
 *   daysSinceWindowStart: (number|null), openSubmissions: number,
 *   mustWithdraw: boolean, inactiveForWarning: boolean,
 *   daysUntilWithdraw: (number|null), level: "ok"|"warning"|"withdraw"
 * }}
 */
export function computeInactivitySignal({
    lastLoginAt,
    enrollments = [],
    lastSubmissionAt = null,
    openSubmissions = 0,
    today = new Date(),
}) {
    const now = startOfDay(today);

    const relevant = (enrollments || []).filter((enrollment) => {
        if (!enrollment || !ACTIVE_ENROLLMENT_STATUSES.includes(enrollment.status)) {
            return false;
        }
        const end = toDate(enrollment.endDate);
        return end !== null && end.getTime() >= now.getTime();
    });

    let windowStartMs = null;
    let windowEndMs = null;
    for (const enrollment of relevant) {
        const start = toDate(enrollment.startDate);
        const end = toDate(enrollment.endDate);
        if (start) {
            windowStartMs =
                windowStartMs === null ? start.getTime() : Math.min(windowStartMs, start.getTime());
        }
        if (end) {
            windowEndMs =
                windowEndMs === null ? end.getTime() : Math.max(windowEndMs, end.getTime());
        }
    }
    const windowStart = windowStartMs === null ? null : new Date(windowStartMs);
    const windowEnd = windowEndMs === null ? null : new Date(windowEndMs);

    const evaluated = windowStart !== null && windowStart.getTime() <= now.getTime();

    const login = toDate(lastLoginAt);
    const submission = toDate(lastSubmissionAt);
    const daysSinceLastLogin = login ? daysBetween(now, login) : null;
    const daysSinceLastSubmission = submission ? daysBetween(now, submission) : null;
    const daysSinceWindowStart = windowStart ? daysBetween(now, windowStart) : null;

    let mustWithdraw = false;
    let inactiveForWarning = false;
    let daysUntilWithdraw = null;
    let level = "ok";

    if (evaluated) {
        const loginBasis =
            daysSinceLastLogin !== null ? daysSinceLastLogin : daysSinceWindowStart;
        const activityDays = [daysSinceLastLogin, daysSinceLastSubmission].filter(
            (v) => v !== null
        );
        const activityBasis =
            activityDays.length > 0 ? Math.min(...activityDays) : daysSinceWindowStart;

        mustWithdraw = loginBasis !== null && loginBasis >= INACTIVITY_WITHDRAW_DAYS;
        inactiveForWarning =
            activityBasis !== null && activityBasis >= INACTIVITY_WARNING_DAYS;
        daysUntilWithdraw =
            loginBasis === null ? null : Math.max(0, INACTIVITY_WITHDRAW_DAYS - loginBasis);

        if (mustWithdraw) level = "withdraw";
        else if (inactiveForWarning) level = "warning";
        else level = "ok";
    }

    return {
        evaluated,
        relevantCount: relevant.length,
        windowStart,
        windowEnd,
        daysSinceLastLogin,
        daysSinceLastSubmission,
        daysSinceWindowStart,
        openSubmissions: Number(openSubmissions) || 0,
        mustWithdraw,
        inactiveForWarning,
        daysUntilWithdraw,
        level,
    };
}
