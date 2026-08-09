/**
 * APL auto-status helpers
 * The APL board shows a student's APL placement color. This module derives the
 * APL period from the student's education entries (single source of truth =
 * StudentEnrollment, consistent with the APL rule in GET /students) and computes
 * an effective, date-driven status: when the APL period ends within a configurable
 * number of weeks, the effective status becomes RED ("Röd – varning, snart slut").
 * The stored `aplStatus` is never mutated; the effective status is attached to the
 * API responses instead.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Number of weeks before the APL end date that auto-RED kicks in. */
export const APL_AUTO_RED_WEEKS = (() => {
    const raw = parseInt(process.env.APL_AUTO_RED_WEEKS, 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 3;
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
 * When the APL ends within APL_AUTO_RED_WEEKS weeks (and hasn't ended yet), the
 * effective status becomes RED.
 * @param {string} aplStatus - stored APL status.
 * @param {Date|string|null} aplEndDate - end of the APL period.
 * @param {Date} [today] - reference date (injectable for tests).
 * @returns {{ aplStatus: string, aplStatusStored: string, aplAutoRed: boolean, aplWeeksRemaining: (number|null) }}
 */
export function computeAplEffectiveStatus(aplStatus, aplEndDate, today = new Date()) {
    const end = toDate(aplEndDate);
    let aplWeeksRemaining = null;
    let aplAutoRed = false;
    if (end) {
        const now = startOfDay(today);
        const endDay = startOfDay(end);
        const daysRemaining = Math.round((endDay.getTime() - now.getTime()) / MS_PER_DAY);
        aplWeeksRemaining = Math.ceil(daysRemaining / 7);
        aplAutoRed = daysRemaining >= 0 && daysRemaining <= APL_AUTO_RED_WEEKS * 7;
    }
    const stored = aplStatus || "GRAY";
    return {
        aplStatus: aplAutoRed ? "RED" : stored,
        aplStatusStored: stored,
        aplAutoRed,
        aplWeeksRemaining,
    };
}
