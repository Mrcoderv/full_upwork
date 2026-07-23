import ExcelJS from "exceljs";
import logger from "./logger.js";

function parseExcelDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "number") {
        return new Date((value - 25569) * 86400 * 1000).toISOString();
    }
    return null;
}

function normalizePN(value) {
    if (!value) return "";
    return value.toString().replace(/\s/g, "").trim();
}

function extractMail(value) {
    if (!value) return "";
    if (typeof value === "object" && value.text) return value.text.trim();
    return typeof value === "string" ? value.trim() : "";
}

// ✅ Clean course-like strings for normalization (exact matching only)
export function cleanCourseName(name) {
    if (!name) return "";
    return name
        .toString()
        .replace(/\(.*?\)/g, "") // Remove parentheses, e.g. (REVIDERAD)
        .replace(/\bmot\b/gi, "") // Remove "mot"
        .replace(/[,;|]/g, "") // Remove separators
        .replace(/\s+/g, " ") // Collapse spaces
        .trim();
}

/**
 * Normalizes a course/package code for matching by applying cleanCourseName
 * and then standardizing (uppercase, remove all spaces, remove week patterns)
 * @param {string} code - The code to normalize
 * @returns {string} The normalized code
 */
export function normalizeCodeForMatching(code) {
    if (!code) return "";
    // Convert to string and trim
    let normalized = code.toString().trim();
    // First apply cleanCourseName to remove parentheses, "mot", separators
    normalized = cleanCourseName(normalized);
    // Then uppercase and remove all spaces
    normalized = normalized.toUpperCase().replace(/\s+/g, "");
    // Remove trailing week extent patterns for package matching
    normalized = normalized.replace(/[-\s]*\d+\s*v$/i, '');
    normalized = normalized.replace(/[-\s]*\d+v$/i, '');
    normalized = normalized.replace(/\d+v$/i, '');
    return normalized;
}

export async function parseStudentExcel(fileBuffer, teacherName) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    const worksheet = workbook.worksheets[0];

    const headers = worksheet.getRow(1).values.slice(1);
    const requiredFields = [
        "NAMN",
        "PERSONNUMMER",
        "KURS/PAKET",
        "START",
        "SLUT",
        "KOMMUN/PRIVAT",
    ];

    const studentsToSave = [];
    let consecutiveEmptyRows = 0;

    logger.debug({ rowCount: worksheet.rowCount }, "Excel parsing: Starting to process rows");

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        const rowObject = {};
        let hasRedBackground = false;

        row.eachCell((cell, colNumber) => {
            const columnName = headers[colNumber - 1];
            if (columnName) {
                rowObject[columnName] = cell.value;
                if (
                    cell.style.fill?.fgColor?.argb?.toUpperCase() === "FFFF0000"
                ) {
                    hasRedBackground = true;
                }
            }
        });

        // Read teacher from "Lärare" column if available, otherwise fall back to filename
        const teacherFromDoc = rowObject["Lärare"]?.toString().trim();
        rowObject["teacher"] = teacherFromDoc || teacherName;
        rowObject["dropout"] = hasRedBackground;

        if (requiredFields.every((field) => !rowObject[field])) {
            consecutiveEmptyRows++;
            if (consecutiveEmptyRows >= 20) {
                logger.debug({ rowNumber, consecutiveEmptyRows }, "Excel parsing: Stopping due to consecutive empty rows");
                break; // Increased from 5 to 20
            }
            continue;
        } else {
            consecutiveEmptyRows = 0;
        }

        const rawInput = rowObject["KURS/PAKET"];
        let rawNames = [];

        if (typeof rawInput === "string") {
            rawNames = [rawInput.trim().toUpperCase()];
        } else if (Array.isArray(rawInput)) {
            rawNames = rawInput
                .map((n) => n.trim().toUpperCase())
                .filter(Boolean);
        } else if (rawInput && typeof rawInput.text === "string") {
            rawNames = [rawInput.text.trim().toUpperCase()];
        }

        const education = [];

        let programName = rowObject["PROGRAM"]?.toString().trim();
        if (programName) {
            education.push({
                type: "Program",
                name: cleanCourseName(programName),
            });
        }

        for (const name of rawNames) {
            const parsedStartDate = parseExcelDate(rowObject["START"]);
            const parsedEndDate = parseExcelDate(rowObject["SLUT"]);
            const parsedSlutprovDate = parseExcelDate(rowObject["PREL. DATUM SLUTPROV"]);
            
            logger.debug({ studentName: rowObject["NAMN"], rawStart: rowObject["START"], parsedStartDate, rawSlut: rowObject["SLUT"], parsedEndDate, rawSlutprov: rowObject["PREL. DATUM SLUTPROV"], parsedSlutprovDate }, "Parsing education entry for student");
            
            const cleanedName = cleanCourseName(name);
            logger.debug({ raw: name, cleaned: cleanedName }, "Parsing course");
            education.push({
                type: "Course",
                name: cleanedName,
                startDate: parsedStartDate,
                endDate: parsedEndDate,
                slutprovDate: parsedSlutprovDate,
            });
        }

        if (rawNames.length === 0 && !programName) {
            education.push({ type: "Course", name: "SE STUDIEPLAN" });
        }

        studentsToSave.push({
            name: rowObject["NAMN"],
            personalNumber: normalizePN(rowObject["PERSONNUMMER"]),
            startDate: parseExcelDate(rowObject["START"]),
            endDate: parseExcelDate(rowObject["SLUT"]),
            finalExamDate: parseExcelDate(rowObject["PREL. DATUM SLUTPROV"]),
            municipality: {
                type: rowObject["KOMMUN/PRIVAT"]?.toString().trim() || "",
            },
            phone: rowObject["TELEFON"] || "",
            email: extractMail(rowObject["MAIL"]),
            exam: rowObject["PROV"] || "",
            additionalInfo: rowObject["ÖVRIGT"] || "",
            teacher: rowObject["teacher"],
            dropout: hasRedBackground,
            aplStatus: "GRAY",
            education,
        });
    }

    logger.debug({ count: studentsToSave.length }, "Excel parsing: Completed");
    logger.debug({ studentNames: studentsToSave.map(s => s.name || "unknown") }, "Student names parsed");

    return studentsToSave;
}
