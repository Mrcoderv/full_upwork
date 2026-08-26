/**
 * APL auto-status helpers
 * The APL board shows a student's APL placement color. This module derives the
 * APL period from the student's education entries (single source of truth =
 * StudentEnrollment, consistent with the APL rule in GET /students) and computes
 * an effective, date-driven status: when the APL period ends within a configurable
 * number of weeks, the effective status becomes RED ("Röd – varning, snart slut").
 * The stored `aplStatus` is never mutated; the effective status is attached to the
 * API responses instead.
 * 
 * New: "behind schedule" detection — when a student's APL period has been active
 * for at least APL_BEHIND_MIN_DAYS_SINCE_LOGIN days (default 14) and the APL
 * period start date is available, the student is flagged as potentially behind
 * schedule, consistent with the spec's broader intent of considering schedule
 * adherence. This is scoped to APL-relevant CoursePackage enrollments.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Number of weeks before the APL end date that auto-RED kicks in. */
export const APL_AUTO_RED_WEEKS = (() => {
    const raw = parseInt(process.env.APL_AUTO_RED_WEEKS, 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 3;
})();

/** Date-driven warning bands, evaluated from most urgent to least urgent. */
export const APL_AUTO_ORANGE_WEEKS = (() => {
    const raw = parseInt(process.env.APL_AUTO_ORANGE_WEEKS, 10);
    return Number.isFinite(raw) && raw >= APL_AUTO_RED_WEEKS ? raw : 4;
})();
export const APL_AUTO_YELLOW_WEEKS = (() => {
    const raw = parseInt(process.env.APL_AUTO_YELLOW_WEEKS, 10);
    return Number.isFinite(raw) && raw >= APL_AUTO_ORANGE_WEEKS ? raw : 8;
})();

/** Minimum days since the APL period start that triggers "behind schedule" consideration. */
export const APL_BEHIND_MIN_DAYS_SINCE_LOGIN = (() => {
    const raw = parseInt(process.env.APL_BEHIND_MIN_DAYS_SINCE_LOGIN || '14', 10);
    return Number.isFinite(raw) && raw >= 0 ? raw : 14;
})();

function toDate(value) {
    if (value === null || value === undefined) return null;
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

function startOfDay(value) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/**
 * Derive the APL period (start/end dates) from an education array. The APL
 * period is the envelope over the student's CoursePackage entries.
 * @param {Array} education - education entries (type/startDate/endDate).
 * @returns {{ aplStartDate: (Date|null), aplEndDate: (Date|null) }}
 */
export function computeAplPeriod(education = []) {
    let startMs = null;
    let endMs = null;
    for (const entry of education || []) {
        if (!entry || entry.type !== "CoursePackage") continue;
        const start = toDate(entry.startDate);
        const end = toDate(entry.endDate);
        if (start) {
            startMs = startMs === null ? start.getTime() : Math.min(startMs, start.getTime());
        }
        if (end) {
            endMs = endMs === null ? end.getTime() : Math.max(endMs, end.getTime());
        }
    }
    return {
        aplStartDate: startMs === null ? null : new Date(startMs),
        aplEndDate: endMs === null ? null : new Date(endMs),
    };
}

/**
 * Compute the effective APL status from the stored status and the APL end date.
 * Near-term end dates receive date-driven warning colors: RED, then PURPLE,
 * then YELLOW. The stored status remains unchanged.
 * @param {string} aplStatus - stored APL status.
 * @param {Date|string|null} aplEndDate - end of the APL period.
 * @param {Date} [today] - reference date (injectable for tests).
 * @returns {{ aplStatus: string, aplStatusStored: string, aplAutoRed: boolean, aplWeeksRemaining: (number|null) }}
 */
export function computeAplEffectiveStatus(aplStatus, aplEndDate, today = new Date()) {
    const end = toDate(aplEndDate);
    let aplWeeksRemaining = null;
    let aplAutoRed = false;
    let aplAutoOrange = false;
    let aplAutoYellow = false;
    if (end) {
        const now = startOfDay(today);
        const endDay = startOfDay(end);
        const daysRemaining = Math.round((endDay.getTime() - now.getTime()) / MS_PER_DAY);
        aplWeeksRemaining = Math.ceil(daysRemaining / 7);
        aplAutoRed = daysRemaining >= 0 && daysRemaining <= APL_AUTO_RED_WEEKS * 7;
        aplAutoOrange = !aplAutoRed && daysRemaining >= 0 && daysRemaining <= APL_AUTO_ORANGE_WEEKS * 7;
        aplAutoYellow = !aplAutoRed && !aplAutoOrange && daysRemaining >= 0 && daysRemaining <= APL_AUTO_YELLOW_WEEKS * 7;
    }
    const stored = aplStatus || "GRAY";
    const computedStatus = aplAutoRed ? "RED" : aplAutoOrange ? "PURPLE" : aplAutoYellow ? "YELLOW" : stored;
    return {
        aplStatus: computedStatus,
        aplStatusStored: stored,
        aplAutoRed,
        aplAutoOrange,
        aplAutoYellow,
        aplWeeksRemaining,
    };
}

/**
 * Compute whether the student is "behind schedule" for APL.
 * A student is considered behind schedule if their APL period has been active
 * for at least APL_BEHIND_MIN_DAYS_SINCE_LOGIN days (default 14) based on
 * the APL period start date from their education entries. This uses the
 * education period data as a proxy for schedule adherence, consistent with
 * the spec's intent of considering whether a student is visibly behind where
 * they should be relative to their APL timeline.
 * 
 * This is scoped to APL CoursePackage enrollments, consistent with the existing
 * RED auto-derivation scoping.
 * 
 * @param {Array} education - student's education entries (type/startDate/endDate).
 * @param {Date} [today] - reference date (injectable for tests).
 * @returns {{ aplBehindSchedule: boolean, aplBehindSince: Date|null, aplPeriodStart: Date|null }}
 */
export function computeAplBehindSchedule(education = [], today = new Date()) {
    const todayNormalized = startOfDay(today);
    let periodStart = null;
    
    // Find the APL period start date from CoursePackage education entries
    const periodStartEntry = education.find(e => e.type === 'CoursePackage' && e.startDate);
    if (periodStartEntry) {
        periodStart = toDate(periodStartEntry.startDate);
    }
    
    return {
        aplBehindSchedule: Boolean(periodStart && Math.round((todayNormalized.getTime() - startOfDay(periodStart).getTime()) / MS_PER_DAY) >= APL_BEHIND_MIN_DAYS_SINCE_LOGIN),
        aplBehindSince: periodStart || null,
        aplPeriodStart: periodStart || null,
    };
}

/**
 * Full APL status computation: effective RED auto-derivation + behind-schedule flag.
 * @param {string} aplStatus - stored APL status.
 * @param {Date|string|null} aplEndDate - end of the APL period.
 * @param {Array} education - student's education entries (type/startDate/endDate).
 * @param {Date} [today] - reference date (injectable for tests).
 * @returns {{ aplStatus: string, aplStatusStored: string, aplAutoRed: boolean, aplWeeksRemaining: (number|null), aplBehindSchedule: boolean, aplBehindSince: Date|null, aplPeriodStart: Date|null }}
 */
export function computeAplFullStatus(
    aplStatus,
    aplEndDate,
    education,
    today = new Date()
) {
    const effective = computeAplEffectiveStatus(aplStatus, aplEndDate, today);
    const behind = computeAplBehindSchedule(education, today);
    return {
        aplStatus: effective.aplStatus,
        aplStatusStored: effective.aplStatusStored,
        aplAutoRed: effective.aplAutoRed,
        aplWeeksRemaining: effective.aplWeeksRemaining,
        aplBehindSchedule: behind.aplBehindSchedule,
        aplBehindSince: behind.aplBehindSince,
        aplPeriodStart: behind.aplPeriodStart,
    };
}
