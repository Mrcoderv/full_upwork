import { PdfBuilder } from "./pdfGenerator.js";

function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toISOString().slice(0, 10);
}

export function buildStudyCertificatePdf({
    studentName,
    personalNumber,
    courseName,
    courseCode,
    periodStart,
    periodEnd,
    completedAt,
    teacherName,
    certificateNumber,
}) {
    const builder = new PdfBuilder();

    builder.heading("Studieintyg");
    builder.addText("Mindful Learning", { size: 12, bold: true, marginTop: 4 });

    builder.label("Elev");
    builder.paragraph(studentName || "-");

    if (personalNumber) {
        builder.label("Personnummer");
        builder.paragraph(String(personalNumber));
    }

    builder.label("Kurs");
    builder.paragraph(courseName || "-");
    if (courseCode) {
        builder.paragraph(`Kurskod: ${courseCode}`);
    }

    builder.label("Studieperiod");
    builder.paragraph(`${formatDate(periodStart)} - ${formatDate(periodEnd)}`);

    builder.label("Kursen är slutförd");
    builder.paragraph(formatDate(completedAt));

    if (teacherName) {
        builder.label("Ansvarig lärare");
        builder.paragraph(String(teacherName));
    }

    if (certificateNumber) {
        builder.label("Intygsnummer");
        builder.paragraph(String(certificateNumber));
    }

    builder.addText("", { size: 12, marginTop: 32 });
    builder.addText("Mindful Learning", { size: 12, bold: true });
    builder.addText("____________________", { size: 12 });
    builder.addText("Underskrift", { size: 10 });

    return builder.generate();
}
