import { PdfBuilder } from "./pdfGenerator.js";

function normalizeList(value) {
    if (value === undefined || value === null || value === "") return [];
    if (Array.isArray(value)) {
        return value.filter(
            (item) => item !== undefined && item !== null && String(item).trim() !== ""
        );
    }
    return [value];
}

const KNOWN_KEYS = new Set([
    "studentId",
    "educationId",
    "courseId",
    "studentName",
    "courseName",
    "teacherId",
    "teacherName",
    "date",
    "reason",
    "schoolEfforts",
    "studentEfforts",
    "studyTime",
    "meetings",
    "notified",
    "answers",
    "pdf",
    "pdfContentType",
    "type",
    "createdAt",
    "updatedAt",
    "locked",
    "lockedAt",
    "_id",
    "__v",
]);

export function buildActionPlanPdf({ plan, studentName, courseName, questions }) {
    const builder = new PdfBuilder();
    builder.heading("Handlingsplan / Åtgärdsprogram");

    const effectiveStudentName = studentName || plan.studentName || "-";
    builder.label("Elev");
    builder.paragraph(effectiveStudentName);

    const effectiveCourse = courseName || plan.courseName || plan.educationId;
    if (effectiveCourse) {
        builder.label("Kurs / Utbildning");
        builder.paragraph(String(effectiveCourse));
    }

    if (plan.teacherName) {
        builder.label("Ansvarig lärare");
        builder.paragraph(String(plan.teacherName));
    }

    if (plan.date) {
        builder.label("Datum");
        builder.paragraph(String(plan.date));
    }

    if (plan.reason) {
        builder.label("Orsak till handlingsplan");
        builder.paragraph(String(plan.reason));
    }

    const schoolEfforts = normalizeList(plan.schoolEfforts);
    if (schoolEfforts.length) {
        builder.label("Skolans/lärarens insatser");
        for (const effort of schoolEfforts) builder.bullet(String(effort));
    }

    const studentEfforts = normalizeList(plan.studentEfforts);
    if (studentEfforts.length) {
        builder.label("Elevens insatser");
        for (const effort of studentEfforts) builder.bullet(String(effort));
    }

    if (plan.studyTime) {
        builder.label("Avsatt tid för studier");
        builder.paragraph(String(plan.studyTime));
    }

    const meetings = normalizeList(plan.meetings);
    if (meetings.length) {
        builder.label("Möten");
        for (const meeting of meetings) builder.bullet(String(meeting));
    }

    const notified = normalizeList(plan.notified);
    if (notified.length) {
        builder.label("Eleven har meddelats handlingsplan");
        for (const item of notified) builder.bullet(String(item));
    }

    // Dynamic questionnaire questions / answers if provided
    const answersSource = plan.answers || {};
    const questionMap = new Map();
    if (Array.isArray(questions)) {
        for (const q of questions) {
            if (q.key) questionMap.set(q.key, q.label || q.key);
        }
    }

    // Check answers object
    const extraEntries = Object.entries(answersSource);
    // Also check direct properties on plan not in KNOWN_KEYS
    for (const [k, v] of Object.entries(plan)) {
        if (!KNOWN_KEYS.has(k) && !answersSource[k]) {
            extraEntries.push([k, v]);
        }
    }

    for (const [key, value] of extraEntries) {
        if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
            continue;
        }
        const label = questionMap.get(key) || key;
        builder.label(String(label));
        if (Array.isArray(value)) {
            for (const item of value) builder.bullet(String(item));
        } else {
            builder.paragraph(String(value));
        }
    }

    if (plan.createdAt) {
        const created = new Date(plan.createdAt);
        if (!Number.isNaN(created.getTime())) {
            builder.label("Skapad");
            builder.paragraph(created.toISOString().slice(0, 10));
        }
    }

    if (plan.locked) {
        builder.addText("Handlingsplanen är låst.", { size: 10, bold: true, marginTop: 12 });
    }

    return builder.generate();
}
