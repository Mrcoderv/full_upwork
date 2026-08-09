import { Buffer } from "node:buffer";

const FONT_HELVETICA = "Helvetica";
const FONT_HELVETICA_BOLD = "Helvetica-Bold";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const DEFAULT_FONT_SIZE = 12;

function charWidthEm(ch) {
    if (ch === " ") return 0.28;
    const code = ch.codePointAt(0);
    if (code === 87 || code === 77) return 0.94;
    if (code >= 65 && code <= 90) return 0.66;
    if (code >= 48 && code <= 57) return 0.55;
    return 0.5;
}

export function textWidth(text, size = DEFAULT_FONT_SIZE) {
    let width = 0;
    for (const ch of String(text)) {
        width += charWidthEm(ch);
    }
    return width * size;
}

export function wrapText(text, maxWidth, size = DEFAULT_FONT_SIZE) {
    const lines = [];
    const paragraphs = String(text).split(/\r?\n/);
    for (const paragraph of paragraphs) {
        if (!paragraph) {
            lines.push("");
            continue;
        }
        const words = paragraph.split(" ");
        let current = "";
        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (current && textWidth(candidate, size) > maxWidth) {
                lines.push(current);
                current = word;
            } else {
                current = candidate;
            }
        }
        if (current) lines.push(current);
    }
    return lines;
}

export function escapePdfString(text) {
    return String(text)
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)");
}

export function toLatin1(text) {
    return String(text)
        .split("")
        .map((ch) => (ch.codePointAt(0) <= 255 ? ch : "?"))
        .join("");
}

export class PdfBuilder {
    constructor({
        pageWidth = PAGE_WIDTH,
        pageHeight = PAGE_HEIGHT,
        margin = MARGIN,
        fontSize = DEFAULT_FONT_SIZE,
    } = {}) {
        this.pageWidth = pageWidth;
        this.pageHeight = pageHeight;
        this.margin = margin;
        this.fontSize = fontSize;
        this.maxContentWidth = pageWidth - margin * 2;
        this.pages = [[]];
        this.y = margin;
    }

    lineHeightFor(size) {
        return Math.round(size * 1.5);
    }

    addPage() {
        this.pages.push([]);
        this.y = this.margin;
    }

    ensureSpace(lineHeight) {
        if (this.y + lineHeight > this.pageHeight - this.margin) {
            this.addPage();
        }
    }

    addText(text, { size = this.fontSize, bold = false, marginTop = 0 } = {}) {
        const lineHeight = this.lineHeightFor(size);
        const font = bold ? FONT_HELVETICA_BOLD : FONT_HELVETICA;
        if (marginTop) {
            this.ensureSpace(lineHeight);
            this.y += marginTop;
        }
        const lines = wrapText(text, this.maxContentWidth, size);
        for (const line of lines) {
            this.ensureSpace(lineHeight);
            this.pages[this.pages.length - 1].push({
                text: line,
                x: this.margin,
                y: this.y,
                size,
                font,
            });
            this.y += lineHeight;
        }
    }

    heading(text) {
        this.addText(text, { size: 16, bold: true, marginTop: 12 });
    }

    label(text) {
        this.addText(text, { size: this.fontSize, bold: true, marginTop: 10 });
    }

    paragraph(text) {
        this.addText(text, { size: this.fontSize });
    }

    bullet(text) {
        this.addText(`-  ${text}`, { size: this.fontSize });
    }

    renderContentStream(lines) {
        let stream = "";
        for (const line of lines) {
            const baseline = this.pageHeight - line.y - line.size * 0.75;
            const fontNumber = line.font === FONT_HELVETICA_BOLD ? 2 : 1;
            stream +=
                `BT /F${fontNumber} ${line.size} Tf ` +
                `1 0 0 1 ${line.x.toFixed(2)} ${baseline.toFixed(2)} Tm ` +
                `(${escapePdfString(toLatin1(line.text))}) Tj ET\n`;
        }
        return stream;
    }

    generate() {
        const pageCount = this.pages.length;

        // Object layout:
        // 1 Catalog, 2 Pages, 3 Font F1, 4 Font F2,
        // then per page: content stream (5 + 2i) and page (6 + 2i).
        const contentIdFor = (i) => 5 + 2 * i;
        const pageIdFor = (i) => 6 + 2 * i;

        const objectBodies = [
            "<< /Type /Catalog /Pages 2 0 R >>",
            `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${pageIdFor(i)} 0 R`).join(" ")}] /Count ${pageCount} >>`,
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
        ];

        const streams = this.pages.map((page) => this.renderContentStream(page));
        for (let i = 0; i < pageCount; i++) {
            const stream = streams[i];
            objectBodies.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
            objectBodies.push(
                `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] ` +
                    `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentIdFor(i)} 0 R >>`
            );
        }

        const header = "%PDF-1.4\n";
        const objectStrings = objectBodies.map(
            (body, index) => `${index + 1} 0 obj\n${body}\nendobj\n`
        );

        const offsets = [0];
        let running = header.length;
        for (const objectString of objectStrings) {
            offsets.push(running);
            running += objectString.length;
        }

        const xref = `xref\n0 ${objectStrings.length + 1}\n0000000000 65535 f \n${offsets
            .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
            .join("")}`;
        const trailer = `trailer\n<< /Size ${objectStrings.length + 1} /Root 1 0 R >>\nstartxref\n${running}\n%%EOF\n`;

        return Buffer.from(header + objectStrings.join("") + xref + trailer, "latin1");
    }
}
