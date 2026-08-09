import { describe, it, expect } from "vitest";
import {
    subjectFromCourseCode,
    termFromDate,
    gradeFromScale,
    validateScalePayload,
} from "../../src/utils/gradingScale.js";

describe("subjectFromCourseCode", () => {
    it("maps national course codes to subjects", () => {
        expect(subjectFromCourseCode("SVEENG01")).toBe("Svenska");
        expect(subjectFromCourseCode("ENGENG05")).toBe("Engelska");
        expect(subjectFromCourseCode("MA01")).toBe("Matematik");
        expect(subjectFromCourseCode("MATTE2")).toBe("Matematik");
    });

    it("is case-insensitive and tolerant of whitespace", () => {
        expect(subjectFromCourseCode("  sve123 ")).toBe("Svenska");
        expect(subjectFromCourseCode("eng1")).toBe("Engelska");
    });

    it("returns null for non-national courses", () => {
        expect(subjectFromCourseCode("FYS")).toBeNull();
        expect(subjectFromCourseCode(null)).toBeNull();
        expect(subjectFromCourseCode("")).toBeNull();
    });
});

describe("termFromDate", () => {
    it("derives HT for autumn months", () => {
        expect(termFromDate("2024-10-15")).toBe("HT24");
        expect(termFromDate(new Date(2024, 11, 1))).toBe("HT24");
    });

    it("derives VT for spring months", () => {
        expect(termFromDate("2025-03-15")).toBe("VT25");
        expect(termFromDate(new Date(2025, 0, 10))).toBe("VT25");
    });

    it("returns null for invalid input", () => {
        expect(termFromDate(null)).toBeNull();
        expect(termFromDate("not-a-date")).toBeNull();
    });
});

describe("gradeFromScale", () => {
    const scale = [
        { min: 90, grade: "A" },
        { min: 75, grade: "B" },
        { min: 60, grade: "C" },
        { min: 45, grade: "D" },
        { min: 30, grade: "E" },
    ];

    it("returns the highest threshold the score reaches", () => {
        expect(gradeFromScale(95, scale)).toBe("A");
        expect(gradeFromScale(82, scale)).toBe("B");
        expect(gradeFromScale(60, scale)).toBe("C");
        expect(gradeFromScale(45, scale)).toBe("D");
        expect(gradeFromScale(30, scale)).toBe("E");
    });

    it("returns null below every threshold", () => {
        expect(gradeFromScale(10, scale)).toBeNull();
    });

    it("returns null for invalid inputs", () => {
        expect(gradeFromScale("abc", scale)).toBeNull();
        expect(gradeFromScale(60, [])).toBeNull();
        expect(gradeFromScale(60, null)).toBeNull();
        expect(gradeFromScale(NaN, scale)).toBeNull();
    });
});

describe("validateScalePayload", () => {
    const validScale = [
        { min: 90, grade: "A" },
        { min: 30, grade: "E" },
    ];

    it("accepts a valid payload", () => {
        expect(validateScalePayload("HT24", "Matematik", validScale)).toBeNull();
        expect(validateScalePayload("vt25", "Svenska", validScale)).toBeNull();
    });

    it("rejects a bad term format", () => {
        expect(validateScalePayload("2024", "Matematik", validScale)).toMatch(/HT24|VT25/);
        expect(validateScalePayload("", "Matematik", validScale)).toBeTruthy();
    });

    it("rejects a missing subject", () => {
        expect(validateScalePayload("HT24", "", validScale)).toBeTruthy();
        expect(validateScalePayload("HT24", null, validScale)).toBeTruthy();
    });

    it("rejects an empty scale or malformed rows", () => {
        expect(validateScalePayload("HT24", "Matematik", [])).toMatch(/tröskel/);
        expect(validateScalePayload("HT24", "Matematik", [{ min: "x", grade: "A" }])).toMatch(/tröskel/);
        expect(validateScalePayload("HT24", "Matematik", [{ min: 90, grade: "" }])).toMatch(/tröskel/);
    });
});
