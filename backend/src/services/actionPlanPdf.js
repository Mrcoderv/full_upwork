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

export function buildActionPlanPdf({ plan, studentName }) {
    const builder = new PdfBuilder();
    builder.heading("Handlingsplan");

    builder.label("Elev");
    builder.paragraph(studentName || "-");

    if (plan.educationId) {
        builder.label("Utbildning");
        builder.paragraph(String(plan.educationId));
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
