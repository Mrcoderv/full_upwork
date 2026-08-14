import { describe, it, expect } from "vitest";
import { Buffer } from "node:buffer";
import { buildStudyCertificatePdf } from "../../src/services/studyCertificatePdf.js";

describe("buildStudyCertificatePdf", () => {
    const baseData = {
        studentName: "Anna Andersson",
        personalNumber: "19900101-1234",
        courseName: "Svenska 1",
        courseCode: "SVESVE01",
        periodStart: "2026-01-01",
        periodEnd: "2026-03-15",
        completedAt: "2026-03-16",
        teacherName: "Läraren Lars",
        certificateNumber: "CERT-2026-ABC123",
    };

    it("generates a valid PDF buffer with header and trailer", () => {
        const pdf = buildStudyCertificatePdf(baseData);
        expect(Buffer.isBuffer(pdf)).toBe(true);
        expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
        expect(pdf.subarray(pdf.length - 6).toString("latin1")).toBe("%%EOF\n");
    });

    it("includes the certificate details in the rendered content", () => {
        const content = buildStudyCertificatePdf(baseData).toString("latin1");
        expect(content).toContain("Studieintyg");
        expect(content).toContain("Mindful Learning");
        expect(content).toContain("Anna Andersson");
        expect(content).toContain("19900101-1234");
        expect(content).toContain("Svenska 1");
        expect(content).toContain("SVESVE01");
        expect(content).toContain("2026-01-01 - 2026-03-15");
        expect(content).toContain("2026-03-16");
        expect(content).toContain("Läraren Lars");
        expect(content).toContain("CERT-2026-ABC123");
    });

    it("falls back to dashes for missing values", () => {
        const content = buildStudyCertificatePdf({
            studentName: "",
            personalNumber: "",
            courseName: "",
            periodStart: null,
            periodEnd: undefined,
            completedAt: "not-a-date",
            teacherName: "",
            certificateNumber: "",
        }).toString("latin1");
        expect(content).toContain("-");
    });
});
