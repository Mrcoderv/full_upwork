import { describe, it, expect } from "vitest";
import { Buffer } from "node:buffer";
import {
    PdfBuilder,
    escapePdfString,
    textWidth,
    toLatin1,
    wrapText,
} from "../../src/services/pdfGenerator.js";

describe("pdfGenerator text helpers", () => {
    it("textWidth is 0 for empty string and grows with content", () => {
        expect(textWidth("")).toBe(0);
        expect(textWidth("a", 10)).toBe(5);
        expect(textWidth("hello", 10)).toBeGreaterThan(textWidth("hi", 10));
    });

    it("wrapText splits long text into lines within the max width", () => {
        const text =
            "detta är en lång mening som bör radbrytas på ett snyggt sätt och fortsätta på nästa rad";
        const lines = wrapText(text, 100, 10);
        expect(lines.length).toBeGreaterThan(1);
        for (const line of lines) {
            expect(textWidth(line, 10)).toBeLessThanOrEqual(100);
        }
        expect(lines.join(" ")).toBe(text);
    });

    it("wrapText keeps a single long word on its own line", () => {
        const word = "Superlångtekniskterm";
        expect(wrapText(word, 20, 10)).toEqual([word]);
    });

    it("wrapText preserves explicit line breaks", () => {
        expect(wrapText("första raden\nandra raden", 1000, 10)).toEqual([
            "första raden",
            "andra raden",
        ]);
    });

    it("escapePdfString escapes parentheses and backslashes", () => {
        expect(escapePdfString("a(b)\\c)")).toBe("a\\(b\\)\\\\c\\)");
    });

    it("toLatin1 keeps latin-1 chars and replaces others", () => {
        expect(toLatin1("Åsa äter öl")).toBe("Åsa äter öl");
        expect(toLatin1("€100 😀")).toBe("?100 ??");
    });
});

describe("PdfBuilder", () => {
    it("generates a PDF buffer with valid header and trailer", () => {
        const builder = new PdfBuilder();
        builder.heading("Handlingsplan");
        builder.paragraph("Hej åäö!");
        const pdf = builder.generate();
        expect(Buffer.isBuffer(pdf)).toBe(true);
        expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
        expect(pdf.subarray(pdf.length - 6).toString("latin1")).toBe("%%EOF\n");
    });

    it("includes the rendered text content", () => {
        const builder = new PdfBuilder();
        builder.heading("Handlingsplan");
        builder.paragraph("Hej åäö!");
        const content = builder.generate().toString("latin1");
        expect(content).toContain("Handlingsplan");
        expect(content).toContain("Hej åäö!");
    });

    it("uses bold font for headings and normal font for paragraphs", () => {
        const builder = new PdfBuilder();
        builder.heading("Rubrik");
        builder.paragraph("Brödtext");
        const content = builder.generate().toString("latin1");
        expect(content).toContain("/F2 16 Tf");
        expect(content).toContain("/F1 12 Tf");
    });

    it("creates multiple pages when content overflows", () => {
        const builder = new PdfBuilder();
        for (let i = 0; i < 100; i++) {
            builder.paragraph(
                `Rad nummer ${i}: en hel del text som fyller sidan ordentligt`
            );
        }
        const content = builder.generate().toString("latin1");
        const pageObjects = content.match(/\/Type \/Page\b/g);
        expect(pageObjects.length).toBeGreaterThan(1);
        expect(content).toMatch(new RegExp(`/Count ${pageObjects.length}`));
    });

    it("escapes special characters in the content stream", () => {
        const builder = new PdfBuilder();
        builder.paragraph("Parentes (test) och backslash \\ och €");
        const content = builder.generate().toString("latin1");
        expect(content).toContain("Parentes \\(test\\) och backslash \\\\ och ?");
    });

    it("wires page and content objects without self-references", () => {
        const builder = new PdfBuilder();
        builder.heading("A");
        builder.addPage();
        builder.heading("B");
        const content = builder.generate().toString("latin1");

        expect(content).toContain("/Kids [6 0 R 8 0 R] /Count 2");
        expect(content).toContain("/Contents 5 0 R");
        expect(content).toContain("/Contents 7 0 R");
        expect(content).toContain("/Type /Page /Parent 2 0 R");
    });
});
