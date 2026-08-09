/**
 * Grading scale helpers for national tests (Engelska/Svenska/Matematik).
 * The grading scale (points -> grade) changes annually and is maintained by
 * system admins (GradingScale model + /grading-scale routes).
 */

export const NATIONAL_SUBJECTS = ["Svenska", "Engelska", "Matematik"];

export const GRADE_ORDER = ["A", "B", "C", "D", "E", "F"];

/** Map a course code prefix to a national-test subject (or null). */
export function subjectFromCourseCode(courseCode = "") {
    const code = String(courseCode || "").toUpperCase().trim();
    if (code.startsWith("SVE")) return "Svenska";
    if (code.startsWith("ENG")) return "Engelska";
    if (code.startsWith("MAT") || code.startsWith("MA")) return "Matematik";
    return null;
}

/** Derive the Swedish term label ("HT24"/"VT25") from a date. */
export function termFromDate(value) {
    if (!value) return null;
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (isNaN(d.getTime())) return null;
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    if (month >= 8) return `HT${String(year).slice(2)}`;
    return `VT${String(year).slice(2)}`;
}

/**
 * Look up the grade for a national-test score using a scale.
 * scale is an array of { min, grade } (e.g. [{ min: 90, grade: "A" }, ...]).
 * Returns the grade with the highest min threshold that the score reaches,
 * or null if the score is below every threshold.
 */
export function gradeFromScale(points, scale = []) {
    if (typeof points !== "number" || isNaN(points)) return null;
    if (!Array.isArray(scale) || scale.length === 0) return null;
    let best = null;
    for (const row of scale) {
        if (!row || typeof row.min !== "number" || isNaN(row.min)) continue;
        if (points >= row.min && (best === null || row.min >= best.min)) {
            best = row;
        }
    }
    return best ? best.grade || null : null;
}

/** Validate a scale payload; returns an error message string or null. */
export function validateScalePayload(term, subject, scale) {
    if (!term || typeof term !== "string" || !/^(HT|VT)\d{2}$/i.test(term.trim())) {
        return "term måste vara på formatet HT24 eller VT25";
    }
    if (!subject || typeof subject !== "string" || !subject.trim()) {
        return "subject krävs";
    }
    if (!Array.isArray(scale) || scale.length === 0) {
        return "scale kräver minst en tröskel (min + grade)";
    }
    for (const row of scale) {
        if (
            !row ||
            typeof row.min !== "number" ||
            isNaN(row.min) ||
            !row.grade ||
            typeof row.grade !== "string" ||
            !row.grade.trim()
        ) {
            return "varje tröskel kräver ett nummer (min) och en betygsbokstav (grade)";
        }
    }
    return null;
}
