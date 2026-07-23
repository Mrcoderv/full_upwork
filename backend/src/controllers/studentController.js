/**
 * Student Controller
 * Handles student data, normalization, municipality matching, and related utilities.
 * Uses Student, Program, Course, User, Teacher, and CoursePackage models.
 */
import Student from "../models/Student.js";
import Program from "../models/Program.js";
import Course from "../models/Course.js";
import User from "../models/User.js";
import Teacher from "../models/Teacher.js";
import CoursePackage from "../models/CoursePackage.js";
import {
    parseStudentExcel,
    normalizeCodeForMatching,
} from "../utils/parseStudentExcel.js";
import { distance } from "fastest-levenshtein";
import logger from "../utils/logger.js";

logger.debug("studentController.js loaded");

/**
 * Normalizes a string by removing special characters, accents, and converting to lowercase.
 * @param {string} value - The string to normalize
 * @returns {string} The normalized string
 */
function normalize(value) {
    if (!value) return "";
    return value
        .toString()
        .replace(/\(.*?\)/g, "")
        .replace(/\bmot\b/gi, "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();
}

/**
 * Finds the best fuzzy match for a target string among candidates using Levenshtein distance.
 * @param {string} target - The string to match
 * @param {string[]} candidates - Array of candidate strings
 * @param {number} [maxRatio=0.3] - Maximum allowed ratio for a match
 * @returns {string|null} The best match or null if none found
 */
function getBestFuzzyMatch(target, candidates, maxRatio = 0.3) {
    let best = null;
    let minDistance = Infinity;

    for (const candidate of candidates) {
        const d = distance(target, candidate);
        if (d < minDistance) {
            minDistance = d;
            best = candidate;
        }
    }

    const maxAllowed = Math.floor(target.length * maxRatio);
    return minDistance <= maxAllowed ? best : null;
}

const VALID_MUNICIPALITIES = [
    "Botkyrka",
    "Danderyd",
    "Huddinge",
    "Järfälla",
    "KCNO",
    "Lidingö",
    "Norrtälje",
    "Nykvarn",
    "Privat kunder",
    "Salem",
    "Sigtuna",
    "Sollentuna",
    "Solna",
    "Sundbyberg",
    "Södertälje",
    "Täby",
    "Upplands Bro",
    "Upplands Väsby",
    "Vallentuna",
    "Vaxholm",
    "Växjö",
    "Österåker",
];

/**
 * Returns the closest valid municipality name to the input using Levenshtein distance.
 * @param {string} input - The input municipality name
 * @returns {string|null} The closest valid municipality or null
 */
function getClosestMunicipality(input) {
    if (!input) return null;
    let bestMatch = null;
    let minDistance = Infinity;
    for (const m of VALID_MUNICIPALITIES) {
        const d = distance(input.toLowerCase(), m.toLowerCase());
        if (d < minDistance) {
            minDistance = d;
            bestMatch = m;
        }
    }
    return minDistance <= 4 ? bestMatch : null;
}

/**
 * Builds a normalized map from an array of original names.
 * @param {string[]} originals - Array of original names
 * @returns {Object} Map of normalized names to original names
 */
function buildNormalizedMap(originals) {
    const map = {};
    for (const name of originals) {
        map[normalize(name)] = name;
    }
    return map;
}

/**
 * Normalizes a municipality name, handling common aliases.
 * @param {string} name - The municipality name
 * @returns {string} The normalized municipality name
 */
export function normalizeMunicipalityName(name) {
    if (!name) return name;
    const trimmed = name.trim().toLowerCase();

    // Alias map for common variants
    const aliasMap = {
        "uppl väsby": "Upplands Väsby",
        "uppl. väsby": "Upplands Väsby",
        "upplands väsby": "Upplands Väsby", // canonical
        // Add more aliases as needed
    };

    if (aliasMap[trimmed]) {
        return aliasMap[trimmed];
    }

    // Fallback: fuzzy match for anything containing both "uppl" and "väsby"
    if (trimmed.includes("uppl") && trimmed.includes("väsby")) {
        return "Upplands Väsby";
    }

    return name;
}

// ✅ Main upload function
async function uploadXlsx(req, res) {
    logger.debug("uploadXlsx called");
    logger.info("Received XLSX file upload request");

    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        // Teacher will be read from the document, so we pass empty string as fallback
        const teacherNameFallback = "";
        const parsedStudents = await parseStudentExcel(
            fileBuffer,
            teacherNameFallback
        );

        // Teacher will be read from each student's "Lärare" column in the document
        // Use the first student's teacher as fallback for metadata fields if needed
        let teacherNameFallbackForMetadata = teacherNameFallback;
        if (parsedStudents.length > 0 && parsedStudents[0].teacher) {
            teacherNameFallbackForMetadata = parsedStudents[0].teacher.trim();
        }
        if (parsedStudents.length === 0) {
            return res.status(400).json({ error: "No valid data to save." });
        }

        // ✅ Group by email and merge multiple entries
        const grouped = new Map();
        for (const s of parsedStudents) {
            if (!s.email) continue;
            if (grouped.has(s.email)) {
                grouped.get(s.email).education.push(...(s.education || []));
            } else {
                grouped.set(s.email, {
                    ...s,
                    education: [...(s.education || [])],
                });
            }
        }

        const mergedStudents = [...grouped.values()];
        const emails = mergedStudents.map((s) => s.email);
        const existingStudents = await Student.find({ email: { $in: emails } });
        const existingMap = new Map(existingStudents.map((s) => [s.email, s]));

        const [programs, packages, courses] = await Promise.all([
            Program.find({}).lean(),
            CoursePackage.find({}).lean(),
            Course.find({}).lean(),
        ]);

        const programMap = Object.fromEntries(
            programs.map((p) => [p.programName, p._id])
        );
        // Use coursePackageCode for matching
        const packageMap = Object.fromEntries(
            packages.map((p) => [p.coursePackageCode, p._id])
        );
        // Use courseCode for matching
        const courseMap = Object.fromEntries(
            courses.map((c) => [c.courseCode, c._id])
        );

        const normalizedProgramMap = buildNormalizedMap(
            Object.keys(programMap)
        );
        // Build normalized maps using codes (apply same normalization as Excel parser)
        const normalizedPackageMap = {};
        for (const pkg of packages) {
            const norm = normalizeCodeForMatching(pkg.coursePackageCode || "");
            normalizedPackageMap[norm] = pkg.coursePackageCode;
            logger.debug({ original: pkg.coursePackageCode, normalized: norm }, "Package code mapping");
        }
        const normalizedCourseMap = {};
        for (const c of courses) {
            const norm = normalizeCodeForMatching(c.courseCode || "");
            normalizedCourseMap[norm] = c.courseCode;
            logger.debug({ original: c.courseCode, normalized: norm }, "Course code mapping");
        }
        logger.debug({ count: Object.keys(normalizedPackageMap).length }, "Total packages in map");
        logger.debug({ count: Object.keys(normalizedCourseMap).length }, "Total courses in map");

        const now = new Date();

        // ---------------------------------------------
        // Pre-validation: abort upload if any course cannot be matched
        // ---------------------------------------------
        (function prevalidateUnmatchedCourses() {
            const reasons = [];

            function strictMatch(target, candidates) {
                // Only exact match - no fuzzy matching
                if (candidates.includes(target)) return target;
                return null;
            }

            for (const student of mergedStudents) {
                const studentIdLabel =
                    student.email || student.name || "unknown";
                const entries = Array.isArray(student.education)
                    ? student.education
                    : [];
                for (const entry of entries) {
                    // Skip empty entries
                    if (!entry.name || !entry.name.trim()) {
                        continue;
                    }

                    // Normalize as code using the same function as database codes
                    // (entry.name already has cleanCourseName applied during parsing)
                    const originalName = entry.name || "";
                    let normalizedName = normalizeCodeForMatching(originalName);

                    // Skip if normalization resulted in empty string
                    if (!normalizedName) {
                        logger.debug({ originalName }, "Skipping entry with empty normalized name");
                        continue;
                    }

                    logger.debug({ originalName, normalized: normalizedName }, "Matching entry");

                    const isCourse = /NIVÅ\s*\d+$/i.test(normalizedName);
                    let type = isCourse ? "Course" : "CoursePackage";

                    const matchPackage = strictMatch(
                        normalizedName,
                        Object.keys(normalizedPackageMap)
                    );
                    const matchCourse = strictMatch(
                        normalizedName,
                        Object.keys(normalizedCourseMap)
                    );

                    logger.debug({
                        normalized: normalizedName,
                        package: matchPackage || "none",
                        course: matchCourse || "none",
                    }, "Match results");
                    logger.debug({
                        packageKeys: Object.keys(normalizedPackageMap).slice(0, 10),
                    }, "Available package keys");
                    logger.debug({
                        courseKeys: Object.keys(normalizedCourseMap).slice(0, 10),
                    }, "Available course keys");

                    // Treat as failure when an entry is a course and neither a course nor package match exists
                    if (type === "Course" && !matchCourse && !matchPackage) {
                        // Find closest matches for better error message
                        let closestPkg = null,
                            closestPkgDist = Infinity;
                        let closestCourse = null,
                            closestCourseDist = Infinity;
                        for (const key of Object.keys(normalizedPackageMap)) {
                            const d = distance(normalizedName, key);
                            if (d < closestPkgDist) {
                                closestPkgDist = d;
                                closestPkg = normalizedPackageMap[key];
                            }
                        }
                        for (const key of Object.keys(normalizedCourseMap)) {
                            const d = distance(normalizedName, key);
                            if (d < closestCourseDist) {
                                closestCourseDist = d;
                                closestCourse = normalizedCourseMap[key];
                            }
                        }

                        const suggestions = [];
                        if (closestPkg && closestPkgDist <= 3) {
                            suggestions.push(
                                `closest package: "${closestPkg}" (distance: ${closestPkgDist})`
                            );
                        }
                        if (closestCourse && closestCourseDist <= 3) {
                            suggestions.push(
                                `closest course: "${closestCourse}" (distance: ${closestCourseDist})`
                            );
                        }

                        reasons.push({
                            type: "no_match",
                            student: studentIdLabel,
                            courseName: entry.name,
                            normalizedName: normalizedName,
                            message: `No matching course found for "${
                                entry.name
                            }" (normalized: "${normalizedName}") for student ${studentIdLabel}. ${
                                suggestions.length > 0
                                    ? "Suggestions: " + suggestions.join(", ")
                                    : ""
                            }`,
                        });
                    }
                }
            }

            if (reasons.length > 0) {
                throw Object.assign(
                    new Error("Unmatched courses found; upload aborted."),
                    {
                        statusCode: 422,
                        reasons,
                    }
                );
            }
        })();

        const warnings = [];
        const bulkOps = await Promise.all(
            mergedStudents.map(async (student) => {
                const existing = existingMap.get(student.email);
                const existingEdu = existing?.education || [];

                let rawMunicipality =
                    typeof student.municipality === "string"
                        ? student.municipality
                        : student.municipality?.type || "";
                rawMunicipality = normalizeMunicipalityName(rawMunicipality);
                const correctedMunicipality =
                    getClosestMunicipality(rawMunicipality);
                if (!correctedMunicipality) {
                    throw new Error(
                        `❌ Could not match municipality: "${rawMunicipality}"`
                    );
                }

                // Convert education entries → { refId, type, ... }
                const studentWarnings = [];
                const newEducation = student.education.map((entry) => {
                    // Normalize as code using the same function as database codes
                    // (entry.name already has cleanCourseName applied during parsing)
                    let normalized = normalizeCodeForMatching(entry.name || "");

                    // Distinguish course vs package by name ending
                    const isCourse = /NIVÅ\s*\d+$/i.test(normalized);
                    let type = isCourse ? "Course" : "CoursePackage";

                    // Always log normalized input and all normalized package keys
                    logger.debug({ normalized, packageKeys: Object.keys(normalizedPackageMap) }, "Normalized input and package keys");

                    // Only exact match - no fuzzy matching
                    function strictMatch(target, candidates) {
                        if (candidates.includes(target)) return target;
                        return null;
                    }

                    const matchProgram = strictMatch(
                        normalized,
                        Object.keys(normalizedProgramMap)
                    );
                    const matchPackage = strictMatch(
                        normalized,
                        Object.keys(normalizedPackageMap)
                    );
                    const matchCourse = strictMatch(
                        normalized,
                        Object.keys(normalizedCourseMap)
                    );

                    let refId = null;

                    if (matchProgram) {
                        refId = programMap[normalizedProgramMap[matchProgram]];
                        type = "Program";
                    } else if (type === "CoursePackage" && matchPackage) {
                        refId = packageMap[normalizedPackageMap[matchPackage]];
                        type = "CoursePackage";
                    } else if (type === "Course" && matchCourse) {
                        refId = courseMap[normalizedCourseMap[matchCourse]];
                        type = "Course";
                    } else {
                        if (!type || type === "Auto") type = "Course";
                        // Log for debugging
                        let bestPkg = null,
                            bestPkgDist = Infinity;
                        for (const candidate of Object.keys(
                            normalizedPackageMap
                        )) {
                            const d = distance(normalized, candidate);
                            if (d < bestPkgDist) {
                                bestPkgDist = d;
                                bestPkg = candidate;
                            }
                        }
                        let bestCourse = null,
                            bestCourseDist = Infinity;
                        for (const candidate of Object.keys(
                            normalizedCourseMap
                        )) {
                            const d = distance(normalized, candidate);
                            if (d < bestCourseDist) {
                                bestCourseDist = d;
                                bestCourse = candidate;
                            }
                        }
                        logger.warn({
                            entryName: entry.name,
                            normalized,
                            bestPackage: bestPkg,
                            bestPackageDistance: bestPkgDist,
                            bestCourse,
                            bestCourseDistance: bestCourseDist,
                            packageKeys: Object.keys(normalizedPackageMap),
                        }, "No match found");
                        // Only push warning for unmatched courses, unless the name matches a known package
                        if (type === "Course" && !matchPackage) {
                            logger.warn({
                                entryName: entry.name,
                                type,
                                matchPackage,
                                normalized,
                                packageKeys: Object.keys(normalizedPackageMap),
                            }, "Pushing no_match warning");
                            studentWarnings.push({
                                type: "no_match",
                                courseName: entry.name,
                                message: `No matching course found for \"${entry.name}\"`,
                            });
                        }
                    }

                    return {
                        type,
                        refId,
                        name: entry.name,
                        grade: null,
                        addedAt: now,
                        addedBy:
                            student.teacher?.trim() ||
                            teacherNameFallbackForMetadata,
                        removedAt: null,
                    };
                });
                // After processing this student, add their warnings to the global array
                warnings.push(...studentWarnings);

                // Merge new education with existing
                const mergedEducation = [...existingEdu];
                for (const e of newEducation) {
                    const exists = mergedEducation.some(
                        (old) =>
                            old.refId?.toString() === e.refId?.toString() &&
                            old.type === e.type &&
                            new Date(old.startDate).getTime() ===
                                new Date(e.startDate).getTime() &&
                            new Date(old.endDate).getTime() ===
                                new Date(e.endDate).getTime()
                    );
                    if (!exists) mergedEducation.push(e);
                }

                let teacherDoc = null;
                if (student.teacher) {
                    const rawName = student.teacher.trim();
                    const firstName = rawName.split(",")[0].split(" ")[0];
                    const user = await User.findOne({
                        username: new RegExp(`^${firstName}`, "i"),
                    });
                    if (user) {
                        teacherDoc = await Teacher.findOne({
                            userId: user._id,
                        });
                        if (!user.username) {
                            logger.warn({ user }, "User found without username");
                        }
                    } else {
                        // Auto-create teacher with subject if not found
                        const { teacher } = await createOrFindTeacher(
                            rawName,
                            null,
                            student.subject || "Övrigt"
                        );
                        teacherDoc = teacher;
                    }
                }

                const studentDoc = {
                    ...student,
                    teacherId: teacherDoc?._id || null,
                    education: mergedEducation,
                    municipality: { type: correctedMunicipality },
                    aplStatus: existing?.aplStatus || "GRAY",
                    createdAt: existing?.createdAt || now,
                    updatedAt: now,
                    uploadedBy:
                        student.teacher?.trim() ||
                        teacherNameFallbackForMetadata,
                };

                return {
                    updateOne: {
                        filter: { email: student.email },
                        update: { $set: studentDoc },
                        upsert: true,
                    },
                };
            })
        );

        await Student.bulkWrite(bulkOps);

        const sample = await Student.findOne({
            email: mergedStudents[0].email,
        });
        logger.debug({ education: sample.education }, "Sample saved student education");

        res.status(200).json({
            message: "Upload successful",
            students: mergedStudents,
            warnings,
        });
    } catch (err) {
        logger.error({ err }, "Upload failed");
        const status = err.statusCode || 500;
        const payload =
            err.statusCode === 422
                ? {
                      error: "Unmatched courses found; upload aborted.",
                      reasons: err.reasons,
                  }
                : { error: "Failed to process file", details: err.message };
        res.status(status).json(payload);
    }
}

export { uploadXlsx };
