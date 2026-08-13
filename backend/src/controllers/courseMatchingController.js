import CourseMatchingService from "../utils/courseMatchingService.js";
import Student from "../models/Student.js";
import CourseInstance from "../models/CourseInstance.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { parseStudentExcel, normalizeCodeForMatching } from "../utils/parseStudentExcel.js";
import { createOrFindTeacher } from "../utils/teacherService.js";
import { createGlobalNotification } from "../controllers/notificationController.js";
import { normalizeMunicipalityName } from "./studentController.js";
import Course from "../models/Course.js";
import User from "../models/User.js";
import CourseTemplate from "../models/CourseTemplate.js";
import { distance } from "fastest-levenshtein";
import { cloneModules } from "../models/courseModuleSchema.js";
import mongoose from "mongoose";
import logger from "../utils/logger.js";

/**
 * Course Matching Controller
 * Handles endpoints for uploading students, matching courses, managing enrollments, and course instances.
 * Relies on CourseMatchingService and related models/utilities.
 */
import CoursePackage from "../models/CoursePackage.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";

logger.debug("courseMatchingController.js loaded");

const formatDateOnlyUTC = (dateValue) => {
    if (!dateValue) return "";
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return "";
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const getInstanceKey = (instance) => {
    const mainCourseId = String(
        instance.mainCourseId?._id || instance.mainCourseId || ""
    );
    const responsibleTeacher = String(
        instance.responsibleTeacher?._id || instance.responsibleTeacher || ""
    );
    const startKey = formatDateOnlyUTC(instance.startDate);
    const endKey = formatDateOnlyUTC(instance.endDate);
    return `${mainCourseId}|${responsibleTeacher}|${startKey}|${endKey}`;
};

const mergeDuplicateCourseInstances = async (instances) => {
    if (!instances || instances.length === 0) return false;
    const grouped = new Map();
    for (const instance of instances) {
        const key = getInstanceKey(instance);
        if (!key) continue;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(instance);
    }

    let mergedAny = false;
    for (const duplicates of grouped.values()) {
        if (duplicates.length <= 1) continue;
        mergedAny = true;

        const counts = await Promise.all(
            duplicates.map(async (instance) => {
                const count = await StudentEnrollment.countDocuments({
                    courseInstanceId: instance._id,
                });
                return { instance, count };
            })
        );
        counts.sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return new Date(a.instance.createdAt || 0) - new Date(b.instance.createdAt || 0);
        });

        const base = counts[0].instance;
        const duplicatesToMerge = counts.slice(1).map((c) => c.instance);

        let needsSave = false;
        for (const dup of duplicatesToMerge) {
            await StudentEnrollment.updateMany(
                { courseInstanceId: dup._id },
                { $set: { courseInstanceId: base._id } }
            );

            if (!base.responsibleTeacher && dup.responsibleTeacher) {
                base.responsibleTeacher = dup.responsibleTeacher;
                needsSave = true;
            }
            if (!base.slutprovDate && dup.slutprovDate) {
                base.slutprovDate = dup.slutprovDate;
                needsSave = true;
            }
            if (base.isActive === false && dup.isActive === true) {
                base.isActive = true;
                needsSave = true;
            }
        }

        if (needsSave) {
            await base.save();
        }

        const duplicateIds = duplicatesToMerge.map((d) => d._id);
        await CourseInstance.deleteMany({ _id: { $in: duplicateIds } });
    }

    return mergedAny;
};

/**
 * Uploads an Excel file of students for course matching, parses the file, creates teachers if needed, and returns results.
 * @async
 * @param {import('express').Request} req - Express request object (expects file upload)
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
export const uploadStudentsForMatching = async (req, res) => {
    logger.debug("uploadStudentsForMatching called");
    try {
        logger.debug({ user: req.user }, "Request user");
        logger.debug({ userId: req.userId }, "Request userId");
        logger.debug({ cookies: req.cookies }, "Request cookies");

        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        // Teacher will be read from the document, so we pass empty string as fallback
        const teacherNameFallback = "";

        // Parse students using the existing parser
        const parsedStudents = await parseStudentExcel(fileBuffer, teacherNameFallback);

        logger.debug({ count: parsedStudents.length }, "Total students parsed from Excel");
        logger.debug({
            names: parsedStudents.map((s) => s.name || s.email || "unknown"),
        }, "Student names from Excel");

        // ✅ Group by email and merge multiple entries (same logic as studentController.js)
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
        logger.debug({ count: mergedStudents.length }, "After deduplication");
        logger.debug({
            names: mergedStudents.map((s) => s.name || s.email || "unknown"),
        }, "Merged student names");

        if (mergedStudents.length === 0) {
            return res
                .status(400)
                .json({ error: "No valid data found in file." });
        }

        const results = {
            students: [],
            warnings: [],
            errors: [],
            createdTeachers: [],
            enrollments: [], // <-- add this line
        };

        // ---------------------------------------------
        // Sanitize and pre-validate parsed data before any DB writes
        // - Convert Excel richText objects to strings
        // - Ensure education entry names are strings
        // - Collect reasons and abort with 422 if any unconvertible values exist
        // ---------------------------------------------
        (function sanitizeAndValidateParsedStudents() {
            const reasons = [];

            function coerceToString(value) {
                if (value === undefined || value === null) return "";
                if (typeof value === "string") return value;
                if (typeof value === "number" || typeof value === "boolean")
                    return String(value);
                if (typeof value === "object") {
                    // xlsx richText object: { richText: [ { text: '...' }, ... ] }
                    if (Array.isArray(value.richText)) {
                        return value.richText
                            .map((part) =>
                                typeof part?.text === "string" ? part.text : ""
                            )
                            .join("");
                    }
                    if (typeof value.text === "string") {
                        return value.text;
                    }
                }
                return null; // not safely convertible
            }

            for (const student of mergedStudents) {
                const studentIdLabel =
                    student.email || student.name || "unknown";

                // additionalInfo
                const coercedAdditional = coerceToString(
                    student.additionalInfo
                );
                if (coercedAdditional === null) {
                    reasons.push({
                        type: "invalid_field",
                        student: studentIdLabel,
                        studentEmail: student.email || "",
                        studentName: student.name || "",
                        field: "ÖVRIGT (additionalInfo)",
                        fieldValue: JSON.stringify(student.additionalInfo),
                        message: `Kunde inte konvertera fältet 'ÖVRIGT' till text för student ${studentIdLabel}. Fältet innehåller data som inte kan läsas korrekt. Kontrollera att cellen innehåller vanlig text och inte formaterade objekt.`,
                        suggestion: "Kontrollera kolumnen 'ÖVRIGT' i Excel-filen och se till att den innehåller vanlig text.",
                    });
                } else {
                    student.additionalInfo = coercedAdditional;
                }

                // education entry names
                if (Array.isArray(student.education)) {
                    for (const entry of student.education) {
                        const coercedName = coerceToString(entry?.name);
                        if (coercedName === null || coercedName.trim() === "") {
                            reasons.push({
                                type: "invalid_field",
                                student: studentIdLabel,
                                studentEmail: student.email || "",
                                studentName: student.name || "",
                                field: "KURS/PAKET",
                                fieldValue: JSON.stringify(entry?.name),
                                message: `Ogiltigt eller tomt kurs-/paketnamn för student ${studentIdLabel}. Kolumnen 'KURS/PAKET' måste innehålla en kurskod eller paketkod.`,
                                suggestion: "Kontrollera att kolumnen 'KURS/PAKET' innehåller en giltig kurskod (t.ex. MATE2A00X) eller paketkod (t.ex. KVARVO).",
                            });
                        } else {
                            entry.name = coercedName;
                        }
                    }
                }
            }

            if (reasons.length > 0) {
                const errorSummary = `Validering misslyckades: ${reasons.length} fel hittades i dokumentet.`;
                const error = new Error(errorSummary);
                error.statusCode = 422;
                error.reasons = reasons;
                error.detailedMessage = `Dokumentet innehåller ${reasons.length} fel som måste åtgärdas innan uppladdning kan fortsätta. Se detaljerna nedan för mer information.`;
                throw error;
            }
        })();

        // Collect all unique teachers from the document and create/find them
        const uniqueTeachers = new Set();
        for (const student of mergedStudents) {
            if (student.teacher && student.teacher.trim()) {
                uniqueTeachers.add(student.teacher.trim());
            }
        }

        // Create a map of teacher names to teacher documents
        const teacherMap = new Map();
        for (const teacherName of uniqueTeachers) {
            try {
                const teacherResult = await createOrFindTeacher(
                    teacherName,
                    req.user?.userId
                );

                if (teacherResult.wasCreated) {
                    const safeUsername =
                        teacherResult.user?.username || teacherName;
                    const safeEmail =
                        teacherResult.user?.email ||
                        `${teacherName
                            .toLowerCase()
                            .replace(/\s+/g, ".")}@mindful.se`;
                    results.createdTeachers.push({
                        name: safeUsername,
                        email: safeEmail,
                        password: teacherResult.password,
                        subject: teacherResult.teacher?.subject || "Övrigt",
                    });

                    logger.info({ username: safeUsername }, "Auto-created teacher");

                    // Create notification for the user who uploaded the file
                    try {
                        await createGlobalNotification(
                            "teacher_auto_created",
                            `Lärare "${safeUsername}" skapades automatiskt vid uppladdning av studenter. Lösenord: ${teacherResult.password}`
                        );
                    } catch (notificationError) {
                        logger.error({ err: notificationError }, "Error creating notification");
                    }
                }

                teacherMap.set(teacherName, teacherResult.teacher);
                logger.debug({ teacherName, teacherId: teacherResult.teacher?._id || 'null' }, "Teacher mapped");
            } catch (error) {
                logger.error({ err: error, teacherName }, "Error handling teacher creation");
                results.errors.push({
                    type: "teacher_creation",
                    teacher: teacherName,
                    field: "Lärare",
                    error: error.message,
                    message: `Kunde inte skapa eller hitta lärare "${teacherName}": ${error.message}`,
                    suggestion: `Kontrollera att lärarens namn i kolumnen 'Lärare' är korrekt angivet. Om läraren inte finns i systemet kommer en ny lärare att skapas automatiskt, men detta kan misslyckas om namnet är ogiltigt.`,
                });
            }
        }

        // Build normalized package map using coursePackageCode
        const allPackages = await CoursePackage.find({}).lean();
        const normalizedPackageMap = {};
        for (const pkg of allPackages) {
            // Normalize code using the same function as Excel parser
            const norm = normalizeCodeForMatching(pkg.coursePackageCode || "");
            normalizedPackageMap[norm] = pkg;
            logger.debug({ original: pkg.coursePackageCode, normalized: norm }, "Package code mapping");
        }
        logger.debug({ count: Object.keys(normalizedPackageMap).length }, "Total packages in map");

        // Build normalized course map using courseCode
        const allCourses = await Course.find({}).lean();
        logger.debug({ count: allCourses.length }, "Found courses in database");
        const normalizedCourseMap = {};
        for (const c of allCourses) {
            // Normalize code using the same function as Excel parser
            const norm = normalizeCodeForMatching(c.courseCode || "");
            normalizedCourseMap[norm] = c;
            // Only log first 50 to avoid spam, but log all if there are issues
            if (Object.keys(normalizedCourseMap).length <= 50) {
                logger.debug({ original: c.courseCode, normalized: norm }, "Course code mapping");
            }
        }
        logger.debug({ count: Object.keys(normalizedCourseMap).length }, "Total courses in map");
        // Log all normalized course codes for debugging (limit to first 100)
        const allNormalizedCodes = Object.keys(normalizedCourseMap).sort();
        logger.debug({ codes: allNormalizedCodes.slice(0, 100) }, "All normalized course codes (first 100)");
        if (allNormalizedCodes.length === 0) {
            logger.error("NO COURSES FOUND IN DATABASE - this will cause all matching to fail");
            logger.error("Please check that courses have been imported into the database");
        }

        // Pre-validation: if any course or package entry cannot be matched, abort upload
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
                    
                    // Normalize the code/name using the same function as database codes
                    // (entry.name already has cleanCourseName applied during parsing)
                    const originalName = entry.name || "";
                    let normalized = normalizeCodeForMatching(originalName);
                    
                    // Skip if normalization resulted in empty string
                    if (!normalized) {
                        logger.debug({ originalName }, "Skipping entry with empty normalized name");
                        continue;
                    }
                    
                    logger.debug({ originalName, normalized }, "Matching entry");
                    logger.debug({ normalized, inCourseMap: normalized in normalizedCourseMap }, "Checking course map");
                    logger.debug({ normalized, inPackageMap: normalized in normalizedPackageMap }, "Checking package map");
                    if (!(normalized in normalizedCourseMap) && !(normalized in normalizedPackageMap)) {
                        // Show closest matches for debugging
                        const allCodes = [...Object.keys(normalizedCourseMap), ...Object.keys(normalizedPackageMap)];
                        const closest = allCodes
                            .map(code => ({ code, dist: distance(normalized, code) }))
                            .sort((a, b) => a.dist - b.dist)
                            .slice(0, 5);
                        logger.debug({ normalized, closest }, "Closest matches");
                    }
                    const isCourse = /NIVÅ\s*\d+$/i.test(normalized);

                    // Check if the normalized name exists in either Course or CoursePackage collections
                    const matchPkg = strictMatch(
                        normalized,
                        Object.keys(normalizedPackageMap)
                    );
                    const matchCourse = strictMatch(
                        normalized,
                        Object.keys(normalizedCourseMap)
                    );
                    
                    logger.debug({
                        normalized,
                        package: matchPkg || 'none',
                        course: matchCourse || 'none',
                    }, "Match results");
                    logger.debug({ packageKeys: Object.keys(normalizedPackageMap).slice(0, 20) }, "Available package keys");
                    logger.debug({ courseKeys: Object.keys(normalizedCourseMap).slice(0, 20) }, "Available course keys");
                    logger.debug({
                        courses: Object.keys(normalizedCourseMap).length,
                        packages: Object.keys(normalizedPackageMap).length,
                    }, "Total available courses and packages");

                    // If no match found in either collection, add to reasons
                    if (!matchCourse && !matchPkg) {
                        logger.warn({ originalName, normalized }, "No match found");
                        // Find closest matches for suggestions
                        const allCodes = [
                            ...Object.keys(normalizedCourseMap),
                            ...Object.keys(normalizedPackageMap),
                        ];
                        const suggestions = [];
                        let bestMatch = null;
                        let bestDistance = Infinity;
                        
                        for (const code of allCodes) {
                            const dist = distance(normalized, code);
                            if (dist < bestDistance) {
                                bestDistance = dist;
                                bestMatch = code;
                            }
                            if (dist <= 2 && suggestions.length < 3) {
                                const matchItem = normalizedCourseMap[code] || normalizedPackageMap[code];
                                if (matchItem) {
                                    suggestions.push({
                                        code: matchItem.courseCode || matchItem.coursePackageCode,
                                        name: matchItem.courseName || matchItem.coursePackageName,
                                        distance: dist,
                                    });
                                }
                            }
                        }
                        
                        // Sort suggestions by distance
                        suggestions.sort((a, b) => a.distance - b.distance);
                        
                        const suggestionText = suggestions.length > 0
                            ? ` Föreslagna matchningar: ${suggestions.map(s => `${s.code} (${s.name})`).join(", ")}.`
                            : bestMatch && bestDistance <= 5
                            ? ` Närmaste matchning: ${bestMatch} (avstånd: ${bestDistance}).`
                            : "";
                        
                        reasons.push({
                            type: "no_match",
                            student: studentIdLabel,
                            studentEmail: student.email || "",
                            studentName: student.name || "",
                            courseCode: entry.name,
                            normalizedCode: normalized,
                            message: `Ingen matchande kurs eller kurspaket hittades för koden "${entry.name}" för student ${studentIdLabel}.${suggestionText}`,
                            suggestion: suggestions.length > 0
                                ? `Kontrollera om du menade någon av de föreslagna koderna: ${suggestions.map(s => s.code).join(", ")}.`
                                : "Kontrollera att kurskoden/paketkoden är korrekt stavad. Koder ska matcha exakt (t.ex. MATE2A00X, KVARVO).",
                            suggestions: suggestions,
                        });
                    }
                }
            }

            if (reasons.length > 0) {
                const uniqueCodes = new Set(reasons.map(r => r.courseCode));
                const errorSummary = `Hittade ${reasons.length} omatchade kurser/paket (${uniqueCodes.size} unika koder) i dokumentet.`;
                const error = new Error(errorSummary);
                error.statusCode = 422;
                error.reasons = reasons;
                error.detailedMessage = `Dokumentet innehåller ${reasons.length} kurser/paket som inte kunde matchas mot systemet. Detta kan bero på felstavade kurskoder eller att kurserna/paketen inte finns i systemet. Se detaljerna nedan för varje omatchad kod.`;
                throw error;
            }
        })();

        // Process each student with the new course versioning system
        let zeroEnrollmentErrors = [];
        const createdStudentIds = [];
        for (const studentData of mergedStudents) {
            logger.debug({
                name: studentData.name || studentData.email || "unknown",
                education: studentData.education,
            }, "Processing student");

            // First, create or find the student
            let dbStudent = null;
            let wasStudentCreated = false;
            try {
                // Normalize municipality before any DB operation
                if (
                    studentData.municipality &&
                    typeof studentData.municipality.type === "string"
                ) {
                    studentData.municipality.type = normalizeMunicipalityName(
                        studentData.municipality.type
                    );
                }

                // Check if student already exists
                if (studentData.personalNumber) {
                    dbStudent = await Student.findOne({
                        personalNumber: studentData.personalNumber,
                    });
                }
                if (!dbStudent && studentData.email) {
                    dbStudent = await Student.findOne({
                        email: studentData.email,
                    });
                }

                if (!dbStudent) {
                    // Create new student
                    logger.debug({ studentData }, "Creating student with data");
                    logger.debug({ municipality: studentData.municipality }, "Municipality value before creation");

                    // Allowed municipality types from schema
                    const allowedMunicipalities = [
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

                    // Mapping for common Excel variants
                    const municipalityMap = {
                        "uppl väsby": "Upplands Väsby",
                        "upplands väsby": "Upplands Väsby",
                        privat: "Privat kunder",
                        "privat kunder": "Privat kunder",
                        jarfalla: "Järfälla",
                        sundbyberg: "Sundbyberg",
                        sodertalje: "Södertälje",
                        // Add more mappings as needed
                    };

                    let rawMunicipality =
                        studentData.municipality &&
                        (studentData.municipality.type ||
                            studentData.municipality);
                    let normalizedMunicipality = (rawMunicipality || "")
                        .toString()
                        .trim()
                        .toLowerCase();
                    normalizedMunicipality =
                        municipalityMap[normalizedMunicipality] ||
                        allowedMunicipalities.find(
                            (m) => m.toLowerCase() === normalizedMunicipality
                        ) ||
                        rawMunicipality;

                    // Fuzzy fallback if not found in allowed list
                    if (
                        !allowedMunicipalities.includes(normalizedMunicipality)
                    ) {
                        // Use getClosestMunicipality from studentController.js
                        const { getClosestMunicipality } = await import(
                            "./studentController.js"
                        );
                        const fuzzyMatch =
                            getClosestMunicipality(rawMunicipality);
                        if (fuzzyMatch) {
                            logger.debug({ rawMunicipality, fuzzyMatch }, "Fuzzy matched municipality");
                            normalizedMunicipality = fuzzyMatch;
                        } else {
                            const allowedList = allowedMunicipalities.join(", ");
                            logger.error({ student: studentData.name || studentData.email || "unknown", municipality: rawMunicipality }, "Invalid municipality");
                            const error = new Error(
                                `Ogiltig kommun för student ${studentData.name || studentData.email || "unknown"}: "${rawMunicipality}"`
                            );
                            error.statusCode = 422;
                            error.reasons = [{
                                type: "invalid_municipality",
                                student: studentData.name || studentData.email || "unknown",
                                studentEmail: studentData.email || "",
                                studentName: studentData.name || "",
                                field: "KOMMUN/PRIVAT",
                                fieldValue: rawMunicipality,
                                message: `Ogiltig kommun "${rawMunicipality}" för student ${studentData.name || studentData.email || "unknown"}.`,
                                suggestion: `Kommunen måste vara en av följande: ${allowedList}. Kontrollera stavningen i kolumnen 'KOMMUN/PRIVAT'.`,
                                allowedMunicipalities: allowedMunicipalities,
                            }];
                            throw error;
                        }
                    }

                    // Get the teacher for this specific student from the teacherMap
                    const studentTeacherName = studentData.teacher?.trim() || "";
                    const studentTeacherInfo = studentTeacherName
                        ? teacherMap.get(studentTeacherName)
                        : null;

                    dbStudent = new Student({
                        name: studentData.name,
                        personalNumber: studentData.personalNumber,
                        email: studentData.email,
                        phone: studentData.phone || "",
                        municipality: { type: normalizedMunicipality },
                        startDate: studentData.startDate,
                        endDate: studentData.endDate,
                        finalExamDate: studentData.finalExamDate,
                        examMunicipality: studentData.examMunicipality || "",
                        examLocation: studentData.examLocation || "",
                        examTime: studentData.examTime || "",
                        exam: studentData.exam || "",
                        additionalInfo: studentData.additionalInfo || "",
                        teacher: studentTeacherName,
                        teacherId: studentTeacherInfo?._id || null,
                        dropout: studentData.dropout || false,
                        aplStatus: studentData.aplStatus || "GRAY",
                        education: [],
                    });

                    await dbStudent.save();
                    wasStudentCreated = true;
                    createdStudentIds.push(dbStudent._id.toString());
                    logger.info({ name: dbStudent.name, email: dbStudent.email, teacherId: dbStudent.teacherId || "null" }, "Created new student");
                    // Convert to plain object for easier manipulation
                    try {
                        const studentObj = dbStudent.toObject ? dbStudent.toObject() : (dbStudent.toJSON ? dbStudent.toJSON() : dbStudent);
                        results.students.push(studentObj);
                    } catch (objErr) {
                        logger.error({ err: objErr }, "Error converting student to object");
                        // Fallback: use the student as-is
                        results.students.push(dbStudent);
                    }
                } else {
                    // Update existing student with teacher from document if not already assigned
                    const studentTeacherName = studentData.teacher?.trim() || "";
                    const studentTeacherInfo = studentTeacherName
                        ? teacherMap.get(studentTeacherName)
                        : null;
                    if (studentTeacherInfo && !dbStudent.teacherId) {
                        dbStudent.teacherId = studentTeacherInfo._id;
                        dbStudent.teacher = studentTeacherName;
                        await dbStudent.save();
                    }
                    // Convert to plain object for easier manipulation
                    try {
                        const studentObj = dbStudent.toObject ? dbStudent.toObject() : (dbStudent.toJSON ? dbStudent.toJSON() : dbStudent);
                        results.students.push(studentObj);
                    } catch (objErr) {
                        logger.error({ err: objErr }, "Error converting student to object");
                        // Fallback: use the student as-is
                        results.students.push(dbStudent);
                    }
                }
            } catch (error) {
                logger.error({ err: error, studentName: studentData.name || studentData.email }, "Error creating/finding student");
                const errorDetails = {
                    studentName: studentData.name || "Okänt namn",
                    studentEmail: studentData.email || "Ingen e-post",
                    studentPersonalNumber: studentData.personalNumber || "Inget personnummer",
                    type: "student_creation",
                    error: error.message,
                    message: `Kunde inte skapa eller hitta student ${studentData.name || studentData.email || "okänd"}: ${error.message}`,
                };
                
                // If it's a municipality error, include the reasons
                if (error.reasons && Array.isArray(error.reasons)) {
                    errorDetails.reasons = error.reasons;
                    errorDetails.suggestion = "Kontrollera att kommunen är korrekt angiven i kolumnen 'KOMMUN/PRIVAT'.";
                } else {
                    errorDetails.suggestion = "Kontrollera att alla obligatoriska fält är korrekt ifyllda (NAMN, PERSONNUMMER, EMAIL, KOMMUN/PRIVAT).";
                }
                
                results.errors.push(errorDetails);
                continue; // Skip to next student
            }

            // Now process education entries for this student
            if (
                !studentData.education ||
                !Array.isArray(studentData.education) ||
                studentData.education.length === 0
            ) {
                logger.debug({ name: studentData.name || studentData.email || "unknown" }, "No education entries for student");
                continue;
            }

            // Track enrollments at DB-level and in-memory results
            const dbEnrollmentsBefore = await StudentEnrollment.countDocuments({
                studentId: dbStudent._id,
            });
            const enrollmentsBefore = results.enrollments.length;
            for (const entry of studentData.education) {
                logger.debug({ entry }, "Education entry (raw)");
                // Normalize the code using the same function as database codes
                // (entry.name already has cleanCourseName applied during parsing)
                const originalName = entry.name || "";
                let normalized = normalizeCodeForMatching(originalName);
                
                // Skip if normalization resulted in empty string
                if (!normalized) {
                    logger.warn({ originalName }, "Skipping entry with empty normalized name");
                    continue;
                }
                
                logger.debug({ originalName, normalized }, "Matching entry normalized");
                
                // Check if it's a course (ends with NIVÅ + number, or contains common course keywords)
                // Treat as Course if it ends with common NIVÅ patterns: 1, 1A, 1B, 2A, 1A1, etc.
                // Examples matched: "MATEMATIK NIVÅ 1B", "MATEMATIK NIVÅ 2A", "ANATOMI OCH FYSIOLOGI NIVÅ 1A1"
                const isCourse =
                    /NIVÅ\s*\d+(?:[A-Z](?:\d)?)?$/i.test(normalized) ||
                    /SPRÅK|PEDAGOGIK|SPECIALPEDAGOGIK|KOST|FÖRSKOLAN|GRUNDLÄGGANDE/i.test(
                        normalized
                    );

                // --- Determine type: Try to match against both CoursePackage and Course codes ---
                let type = null;
                const matchesPackage = normalizedPackageMap[normalized];
                const matchesCourse = normalizedCourseMap[normalized];
                
                if (matchesPackage) {
                    type = "CoursePackage";
                    logger.debug({ normalized }, "Name matches a CoursePackage. Forcing type to CoursePackage.");
                } else if (matchesCourse) {
                    type = "Course";
                    logger.debug({ normalized }, "Name matches a Course. Forcing type to Course.");
                } else {
                    // No exact match found, use pattern-based detection
                    type = isCourse ? "Course" : "CoursePackage";
                    logger.debug({ normalized, type }, "No exact match, using pattern-based type");
                }
                logger.debug({ normalized, type }, "Education entry normalized with type");

                if (type === "CoursePackage") {
                    // Only exact match - no fuzzy matching or fallback
                    let pkg = normalizedPackageMap[normalized];
                    if (!pkg) {
                        logger.debug({ normalized }, "No exact package match found");
                    }
                    if (pkg) {
                        logger.debug({ normalized, packageName: pkg.coursePackageName }, "Matched package");

                        // Call courseMatchingService to process the package enrollment
                        try {
                            const result =
                                await CourseMatchingService.processStudentEducation(
                                    dbStudent._id,
                                    [
                                        {
                                            type: "CoursePackage",
                                            refId: pkg._id,
                                            name: pkg.coursePackageName,
                                            startDate: entry.startDate,
                                            endDate: entry.endDate,
                                            slutprovDate: entry.slutprovDate, // <-- PATCH: preserve explicit exam date
                                        },
                                    ],
                                    req.user?.userId || null
                                );
                            logger.debug({ studentName: dbStudent.name || dbStudent.email, result }, "Enrollment result for student");

                            // Aggregate the enrollments from the service result
                            if (
                                result &&
                                result.enrollments &&
                                Array.isArray(result.enrollments)
                            ) {
                                results.enrollments.push(...result.enrollments);
                                logger.debug({ count: result.enrollments.length, studentName: dbStudent.name || dbStudent.email }, "Added enrollments to results for student");
                            }

                            // Also aggregate any warnings or errors
                            if (
                                result &&
                                result.warnings &&
                                Array.isArray(result.warnings)
                            ) {
                                results.warnings.push(...result.warnings);
                            }
                            if (
                                result &&
                                result.errors &&
                                Array.isArray(result.errors)
                            ) {
                                results.errors.push(...result.errors);
                            }
                        } catch (err) {
                            logger.error({ err, studentName: dbStudent.name || dbStudent.email, packageName: pkg.coursePackageName }, "Failed to enroll student in package");
                            results.errors.push({
                                studentName: dbStudent.name || dbStudent.email,
                                studentEmail: dbStudent.email || "",
                                type: "enrollment_error",
                                error: err.message,
                                packageName: pkg.coursePackageName,
                                packageCode: pkg.coursePackageCode,
                                message: `Kunde inte registrera student ${dbStudent.name || dbStudent.email || "okänd"} på kurspaketet ${pkg.coursePackageName} (${pkg.coursePackageCode}): ${err.message}`,
                                suggestion: "Kontrollera att kurspaketet finns i systemet och att studentens start- och slutdatum är korrekt angivna.",
                            });
                        }
                    } else {
                        // Do NOT push a warning for unmatched course packages
                        // Only log for debugging
                        logger.warn({ normalized, availableKeys: Object.keys(normalizedPackageMap) }, "No course package match");
                    }
                } else if (type === "Course") {
                    logger.debug({ normalized }, "Processing individual course");

                    // Call courseMatchingService to process the individual course enrollment
                    try {
                        const result =
                            await CourseMatchingService.processStudentEducation(
                                dbStudent._id,
                                [
                                    {
                                        type: "Course",
                                        name: entry.name,
                                        startDate: entry.startDate,
                                        endDate: entry.endDate,
                                        slutprovDate: entry.slutprovDate, // <-- PATCH: preserve explicit exam date
                                    },
                                ],
                                req.user?.userId || null
                            );
                        logger.debug({ studentName: dbStudent.name || dbStudent.email, result }, "Course enrollment result for student");

                        // Aggregate the enrollments from the service result
                        if (
                            result &&
                            result.enrollments &&
                            Array.isArray(result.enrollments)
                        ) {
                            results.enrollments.push(...result.enrollments);
                            logger.debug({ count: result.enrollments.length, studentName: dbStudent.name || dbStudent.email }, "Added course enrollments to results for student");
                        }

                        // Also aggregate any warnings or errors
                        if (
                            result &&
                            result.warnings &&
                            Array.isArray(result.warnings)
                        ) {
                            results.warnings.push(...result.warnings);
                        }
                        if (
                            result &&
                            result.errors &&
                            Array.isArray(result.errors)
                        ) {
                            results.errors.push(...result.errors);
                        }
                    } catch (err) {
                        logger.error({ err, studentName: dbStudent.name || dbStudent.email, courseCode: entry.name }, "Failed to enroll student in course");
                        results.errors.push({
                            studentName: dbStudent.name || dbStudent.email,
                            studentEmail: dbStudent.email || "",
                            type: "enrollment_error",
                            error: err.message,
                            courseCode: entry.name,
                            message: `Kunde inte registrera student ${dbStudent.name || dbStudent.email || "okänd"} på kursen ${entry.name}: ${err.message}`,
                            suggestion: "Kontrollera att kurskoden är korrekt och att studentens start- och slutdatum är korrekt angivna.",
                        });
                    }
                }
            }

            const enrollmentsAfter = results.enrollments.length;
            const dbEnrollmentsAfter = await StudentEnrollment.countDocuments({
                studentId: dbStudent._id,
            });

            // Consider it a success if either enrollments increased or the student has a CoursePackage in education
            const refreshedStudent = await Student.findById(
                dbStudent._id
            ).lean();
            const hasAnyCoursePackage = Array.isArray(
                refreshedStudent?.education
            )
                ? refreshedStudent.education.some(
                      (e) => e?.type === "CoursePackage"
                  )
                : false;

            // Treat as success if the student has any enrollments at all after processing
            const noNewEnrollments =
                enrollmentsAfter === enrollmentsBefore &&
                dbEnrollmentsAfter === dbEnrollmentsBefore &&
                dbEnrollmentsAfter === 0;

            if (noNewEnrollments && !hasAnyCoursePackage) {
                // No enrollments created for this student → treat as fatal error
                const studentEducationCodes = studentData.education
                    ?.map(e => e.name)
                    .filter(Boolean)
                    .join(", ") || "Inga kurser/paket angivna";
                
                // Find specific unmatched courses for this student from warnings/errors
                // Check both studentId (ObjectId) and studentId as string
                const unmatchedCourses = results.warnings
                    .filter(w => {
                        if (w.type !== "no_match") return false;
                        const warningStudentId = w.studentId?.toString();
                        const dbStudentId = dbStudent._id?.toString();
                        const matches = warningStudentId === dbStudentId;
                        if (!matches && warningStudentId) {
                            logger.debug({ warningStudentId, dbStudentId }, "Warning studentId mismatch");
                        }
                        return matches;
                    })
                    .map(w => w.courseName)
                    .filter(Boolean);
                
                logger.debug({ count: unmatchedCourses.length, studentName: dbStudent.name, unmatchedCourses }, "Found unmatched courses for student");
                logger.debug({ totalWarnings: results.warnings.length, noMatchWarnings: results.warnings.filter(w => w.type === 'no_match').length }, "Warning counts");
                
                // Find similar course suggestions for unmatched courses
                const suggestions = [];
                for (const unmatchedCode of unmatchedCourses) {
                    const normalizedUnmatched = normalizeCodeForMatching(unmatchedCode);
                    const allCodes = [
                        ...Object.keys(normalizedCourseMap),
                        ...Object.keys(normalizedPackageMap),
                    ];
                    
                    // Find closest matches
                    let bestMatches = [];
                    for (const code of allCodes) {
                        const dist = distance(normalizedUnmatched, code);
                        if (dist <= 3 && bestMatches.length < 3) {
                            const matchItem = normalizedCourseMap[code] || normalizedPackageMap[code];
                            if (matchItem) {
                                bestMatches.push({
                                    code: matchItem.courseCode || matchItem.coursePackageCode,
                                    name: matchItem.courseName || matchItem.coursePackageName,
                                    distance: dist,
                                });
                            }
                        }
                    }
                    bestMatches.sort((a, b) => a.distance - b.distance);
                    if (bestMatches.length > 0) {
                        suggestions.push({
                            unmatched: unmatchedCode,
                            suggestions: bestMatches.map(m => `${m.code} (${m.name})`).join(", "),
                        });
                    }
                }
                
                const unmatchedCoursesList = unmatchedCourses.length > 0 
                    ? ` Omatchade kurser: ${unmatchedCourses.join(", ")}.`
                    : "";
                
                let suggestionText = `Kontrollera att kurskoderna/paketkoderna (${studentEducationCodes}) är korrekta och finns i systemet.`;
                if (suggestions.length > 0) {
                    const suggestionDetails = suggestions.map(s => 
                        `"${s.unmatched}" → Förslag: ${s.suggestions}`
                    ).join("; ");
                    suggestionText += ` Liknande kurser i systemet: ${suggestionDetails}.`;
                }
                
                zeroEnrollmentErrors.push({
                    type: "no_enrollments_created",
                    student: dbStudent.name || dbStudent.email || "unknown",
                    studentEmail: dbStudent.email || "",
                    studentName: dbStudent.name || "",
                    educationCodes: studentEducationCodes,
                    unmatchedCourses: unmatchedCourses,
                    suggestions: suggestions,
                    message: `Inga kurser kunde matchas eller skapas för student ${dbStudent.name || dbStudent.email || "okänd"}.${unmatchedCoursesList}`,
                    suggestion: suggestionText,
                });
                // Cleanup newly created student to avoid dangling records
                if (wasStudentCreated && dbStudent?._id) {
                    try {
                        await Student.findByIdAndDelete(dbStudent._id);
                    } catch (e) {
                        logger.error({ err: e }, "Failed to delete student with zero enrollments during cleanup");
                    }
                }
            }
        }

        logger.debug({ studentsProcessed: results.students.length }, "Processing results");
        logger.debug({
            names: results.students.map((s) => s.name || s.email || "unknown"),
        }, "Students created/found");

        // After processing all students, deduplicate missing package errors globally
        const seenPackages = new Set();
        results.errors = results.errors.filter((err) => {
            if (err.type !== "missing_package") return true;
            const norm = (err.packageName || "")
                .toUpperCase()
                .replace(/[,;|]/g, "")
                .replace(/\s+/g, " ")
                .trim();
            if (seenPackages.has(norm)) return false;
            seenPackages.add(norm);
            return true;
        });
        logger.debug({
            deduplicatedErrors: results.errors.filter((e) => e.type === "missing_package"),
        }, "Deduplicated missing package errors");

        // Normalize error shape for frontend (use 'error' property, not 'message')
        results.errors = (results.errors || []).map((e) => ({
            ...e,
            error: e.error || e.message || "",
        }));

        logger.info({
            students: results.students.length,
            enrollments: results.enrollments?.length || 0,
            warnings: results.warnings?.length || 0,
            errors: results.errors?.length || 0,
            createdTeachers: results.createdTeachers.length,
        }, "Final results");

        // If any student ended with zero enrollments, abort entire upload
        if (zeroEnrollmentErrors.length > 0) {
            const errorSummary = `${zeroEnrollmentErrors.length} student(er) kunde inte registreras på några kurser.`;
            const error = new Error(errorSummary);
            error.statusCode = 422;
            error.reasons = zeroEnrollmentErrors;
            error.detailedMessage = `Uppladdningen avbröts eftersom ${zeroEnrollmentErrors.length} student(er) inte kunde registreras på några kurser. Detta beror vanligtvis på att kurskoderna/paketkoderna inte kunde matchas. Se detaljerna nedan för varje student.`;
            throw error;
        }

        // Prepare response message
        let message = `Processed ${results.students.length} students`;
        if (results.createdTeachers.length > 0) {
            message += ` and created ${results.createdTeachers.length} new teacher account(s)`;
        }

        // Filter out 'instance_created' warnings if everything else is fine
        results.warnings = results.warnings.filter(
            (w) => w.type !== "instance_created"
        );

        // Populate education data from enrollments for each student
        if (results.students && Array.isArray(results.students)) {
            try {
                const { default: StudentEnrollment } = await import("../models/StudentEnrollment.js");
                for (const student of results.students) {
                try {
                    // Ensure we have a valid student ID
                    const studentId = student._id || student.id;
                    if (!studentId) {
                        logger.warn({ studentName: student.name || student.email }, "Student missing ID, skipping education population");
                        student.education = Array.isArray(student.education) ? student.education : [];
                        continue;
                    }

                    const enrollments = await StudentEnrollment.find({ studentId: studentId })
                        .populate("mainCourseId", "courseName courseCode")
                        .populate("coursePackageId", "coursePackageName coursePackageCode")
                        .lean();

                    const enrollmentEducation = enrollments.map((enrollment) => {
                        if (enrollment.mainCourseId) {
                            return {
                                type: "Course",
                                refId: enrollment.mainCourseId._id,
                                name: enrollment.mainCourseId.courseName,
                                startDate: enrollment.startDate,
                                endDate: enrollment.endDate,
                                slutprovDate: enrollment.slutprovDate,
                            };
                        } else if (enrollment.coursePackageId) {
                            return {
                                type: "CoursePackage",
                                refId: enrollment.coursePackageId._id,
                                name: enrollment.coursePackageId.coursePackageName,
                                startDate: enrollment.startDate,
                                endDate: enrollment.endDate,
                                slutprovDate: enrollment.slutprovDate,
                            };
                        }
                        return null;
                    }).filter(Boolean);

                    // Merge with existing education entries from student document
                    const existingEducation = Array.isArray(student.education) ? student.education : [];
                    student.education = [...existingEducation, ...enrollmentEducation];
                } catch (err) {
                    logger.error({ err, studentId: student._id || student.id || 'unknown' }, "Error populating education for student");
                    // If enrollment fetch fails, use existing education or empty array
                    student.education = Array.isArray(student.education) ? student.education : [];
                }
            }
            } catch (importErr) {
                logger.error({ err: importErr }, "Error importing StudentEnrollment model");
                // If import fails, just use existing education data
                for (const student of results.students) {
                    student.education = Array.isArray(student.education) ? student.education : [];
                }
            }
        }

        res.json({
            success: true,
            message,
            results,
        });
    } catch (error) {
        logger.error({ err: error }, "Error uploading students for matching");
        const status = error.statusCode || 500;
        if (status === 422) {
            // Build a comprehensive error response
            const errorResponse = {
                success: false,
                error: error.message || "Valideringsfel: uppladdning avbruten.",
                detailedMessage: error.detailedMessage || "Dokumentet innehåller fel som måste åtgärdas innan uppladdning kan fortsätta.",
                reasons: error.reasons || [],
                errorCount: error.reasons?.length || 0,
                errorTypes: {},
            };
            
            // Count error types for summary
            if (error.reasons && Array.isArray(error.reasons)) {
                error.reasons.forEach(reason => {
                    const type = reason.type || "unknown";
                    errorResponse.errorTypes[type] = (errorResponse.errorTypes[type] || 0) + 1;
                });
            }
            
            // Add helpful summary
            const typeSummary = Object.entries(errorResponse.errorTypes)
                .map(([type, count]) => {
                    const typeNames = {
                        "invalid_field": "Ogiltiga fält",
                        "no_match": "Omatchade kurser/paket",
                        "invalid_municipality": "Ogiltiga kommuner",
                        "student_creation": "Student-skapande fel",
                        "enrollment_error": "Registreringsfel",
                        "no_enrollments_created": "Inga registreringar skapade",
                    };
                    return `${typeNames[type] || type}: ${count}`;
                })
                .join(", ");
            
            if (typeSummary) {
                errorResponse.summary = `Feltyper: ${typeSummary}`;
            }
            
            return res.status(422).json(errorResponse);
        }
        res.status(500).json({ 
            success: false,
            error: "Ett internt serverfel uppstod vid bearbetning av filen.",
            message: error.message || "Okänt fel",
            suggestion: "Kontrollera att filen är i korrekt format (Excel .xlsx) och försök igen. Om problemet kvarstår, kontakta systemadministratören.",
        });
    }
};

export const processStudentEducation = async (req, res) => {
    try {
        const { studentId, educationEntries, needsSupport, examMode } = req.body;
        const userId = req.user?.userId;

        if (!studentId || !educationEntries) {
            return res.status(400).json({
                error: "Student ID and education entries are required",
            });
        }

        // Verify student exists
        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // Process education entries
        const results = await CourseMatchingService.processStudentEducation(
            studentId,
            educationEntries,
            userId,
            { needsSupport, examMode }
        );

        res.json({
            success: true,
            message: "Education processing completed",
            results,
        });
    } catch (error) {
        logger.error({ err: error }, "Error processing student education");
        res.status(500).json({ error: "Internal server error" });
    }
};

export const findCourseMatch = async (req, res) => {
    try {
        const { courseName, threshold = 0.7 } = req.query;

        if (!courseName) {
            return res.status(400).json({ error: "Course name is required" });
        }

        const match = await CourseMatchingService.findBestCourseMatch(
            courseName,
            parseFloat(threshold)
        );

        if (!match) {
            return res.json({
                success: false,
                message: "No matching course found",
                suggestions: [],
            });
        }

        res.json({
            success: true,
            match: {
                course: match.course,
                score: match.score,
            },
        });
    } catch (error) {
        logger.error({ err: error }, "Error finding course match");
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getCourseInstances = async (req, res) => {
    try {
        const { courseId, startDate, endDate, isActive } = req.query;

        const query = {};

        if (courseId) query.mainCourseId = courseId;
        if (isActive !== undefined) query.isActive = isActive === "true";
        if (startDate || endDate) {
            query.$and = [];
            if (startDate)
                query.$and.push({ startDate: { $gte: new Date(startDate) } });
            if (endDate)
                query.$and.push({ endDate: { $lte: new Date(endDate) } });
        }

        const instances = await CourseInstance.find(query)
            .populate("mainCourseId")
            .populate("createdBy", "username email")
            .populate({
                path: "responsibleTeacher",
                populate: { path: "userId", select: "username email" },
                select: "userId subject",
            })
            .populate({
                path: "assistantTeacher",
                populate: { path: "userId", select: "username email" },
                select: "userId subject",
            })
            .sort({ startDate: -1 });

        const merged = await mergeDuplicateCourseInstances(instances);
        const finalInstances = merged
            ? await CourseInstance.find(query)
                  .populate("mainCourseId")
                  .populate("createdBy", "username email")
                  .populate({
                      path: "responsibleTeacher",
                      populate: { path: "userId", select: "username email" },
                      select: "userId subject",
                  })
                  .populate({
                      path: "assistantTeacher",
                      populate: { path: "userId", select: "username email" },
                      select: "userId subject",
                  })
                  .sort({ startDate: -1 })
            : instances;

        // For each instance, count enrollments and get slutprov date
        const instancesWithCounts = await Promise.all(
            finalInstances.map(async (instance) => {
                const enrollmentCount = await StudentEnrollment.countDocuments({
                    courseInstanceId: instance._id,
                });

                // Use the slutprovDate from the course instance itself (not from enrollments)
                // If the instance doesn't have one, fall back to the first enrollment's date
                const instanceObj = instance.toObject();
                let slutprovDate = instanceObj.slutprovDate || null;
                
                // Fallback to enrollment date only if instance doesn't have one
                if (!slutprovDate) {
                    const firstEnrollment = await StudentEnrollment.findOne({
                        courseInstanceId: instance._id,
                        slutprovDate: { $ne: null },
                    }).select("slutprovDate");
                    slutprovDate = firstEnrollment?.slutprovDate || null;
                }

                return {
                    ...instanceObj,
                    enrollmentCount,
                    slutprovDate: slutprovDate,
                };
            })
        );

        res.json({
            success: true,
            instances: instancesWithCounts,
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching course instances");
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getMyCourseInstances = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        const { startDate, endDate, isActive } = req.query;

        // For admins/systemadmins, return all course instances (or filter by query params)
        // For teachers, return only their assigned course instances
        let query = {};
        
        if (userRole === "teacher") {
            // Find the teacher document corresponding to the logged-in user
            const Teacher = mongoose.model("Teacher");
            const teacher = await Teacher.findOne({ userId: userId });

            if (!teacher) {
                return res.status(404).json({ error: "Teacher profile not found for the current user." });
            }

            query.responsibleTeacher = teacher._id;
        }
        // For admins/systemadmins, query is empty (will return all instances)

        if (isActive !== undefined) query.isActive = isActive === "true";
        if (startDate || endDate) {
            query.$and = query.$and || [];
            if (startDate)
                query.$and.push({ startDate: { $gte: new Date(startDate) } });
            if (endDate)
                query.$and.push({ endDate: { $lte: new Date(endDate) } });
        }

        const instances = await CourseInstance.find(query)
            .populate("mainCourseId")
            .populate({
                path: "responsibleTeacher",
                populate: { path: "userId", select: "username email" },
                select: "userId subject",
            })
            .populate({
                path: "assistantTeacher",
                populate: { path: "userId", select: "username email" },
                select: "userId subject",
            })
            .sort({ startDate: -1 });

        // Debug: Log first instance to see population
        if (instances.length > 0) {
            logger.debug({ responsibleTeacher: instances[0].responsibleTeacher }, "Sample course instance responsibleTeacher");
            logger.debug({ instance: JSON.stringify(instances[0].toObject(), null, 2) }, "Sample course instance (full)");
        }

        const merged = await mergeDuplicateCourseInstances(instances);
        const finalInstances = merged
            ? await CourseInstance.find(query)
                  .populate("mainCourseId")
                  .populate({
                      path: "responsibleTeacher",
                      populate: { path: "userId", select: "username email" },
                      select: "userId subject",
                  })
                  .sort({ startDate: -1 })
            : instances;

        const instancesWithCounts = await Promise.all(
            finalInstances.map(async (instance) => {
                const enrollmentCount = await StudentEnrollment.countDocuments({
                    courseInstanceId: instance._id,
                });
                const firstEnrollment = await StudentEnrollment.findOne({
                    courseInstanceId: instance._id,
                    slutprovDate: { $ne: null },
                }).select("slutprovDate");

                const instanceObj = instance.toObject();
                
                // Ensure responsibleTeacher is properly structured
                if (instanceObj.responsibleTeacher && typeof instanceObj.responsibleTeacher === 'object') {
                    // If userId is not populated, it might be just an ObjectId
                    if (!instanceObj.responsibleTeacher.userId && instanceObj.responsibleTeacher._id) {
                        logger.debug("responsibleTeacher.userId not populated, attempting manual populate");
                        // This shouldn't happen if populate worked, but handle it gracefully
                    }
                }

                return {
                    ...instanceObj,
                    enrollmentCount,
                    slutprovDate: firstEnrollment?.slutprovDate || null,
                };
            })
        );

        res.json({
            success: true,
            instances: instancesWithCounts,
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching teacher's course instances");
        res.status(500).json({ error: "Internal server error" });
    }
};


export const getStudentEnrollments = async (req, res) => {
    try {
        const { studentId } = req.params;
        const { status, startDate, endDate } = req.query;

        const query = { studentId };

        if (status) query.status = status;
        if (startDate || endDate) {
            query.$and = [];
            if (startDate)
                query.$and.push({ startDate: { $gte: new Date(startDate) } });
            if (endDate)
                query.$and.push({ endDate: { $lte: new Date(endDate) } });
        }

        const enrollments = await StudentEnrollment.find(query)
            .populate("courseInstanceId")
            .populate("mainCourseId")
            .populate("teacherId", "username email")
            .populate("gradeBy", "username email")
            .sort({ startDate: -1 });

        res.json({
            success: true,
            enrollments,
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching student enrollments");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Build course cards for a student from their enrollments.
 * Cards are aggregated from StudentEnrollments grouped by CourseInstance
 * (which is unique per course + dates + responsible teacher), so the same
 * course over the same period shares a single card. Course content (modules)
 * comes from the course instance, which already holds the duplicated template
 * modules created at admission.
 */
const buildCourseCards = async (studentId) => {
    const enrollments = await StudentEnrollment.find({ studentId })
        .populate({
            path: "courseInstanceId",
            populate: [
                {
                    path: "responsibleTeacher",
                    populate: { path: "userId", select: "username" },
                },
                { path: "mainCourseId" },
            ],
        })
        .populate("mainCourseId")
        .sort({ startDate: 1 });

    // Group by course instance so the same course + dates share one card.
    const byInstance = new Map();
    for (const enrollment of enrollments) {
        const instanceId = enrollment.courseInstanceId?._id?.toString();
        if (!instanceId) continue;
        const existing = byInstance.get(instanceId);
        if (!existing || new Date(enrollment.startDate) > new Date(existing.startDate)) {
            byInstance.set(instanceId, enrollment);
        }
    }

    // Every student enrolled on the same course instance shares that card, so
    // collect them per instance (aggregated from StudentEnrollment + Student).
    const sharedStudents = new Map();
    if (byInstance.size > 0) {
        const instanceIds = [...byInstance.keys()];
        const sharedEnrollments = await StudentEnrollment.find({
            courseInstanceId: { $in: instanceIds },
        })
            .populate("studentId", "name email")
            .select("courseInstanceId studentId");
        for (const shared of sharedEnrollments) {
            const rawInstanceId =
                shared.courseInstanceId?._id || shared.courseInstanceId;
            const instanceId = rawInstanceId?.toString();
            if (!instanceId || !byInstance.has(instanceId)) continue;
            const student = shared.studentId;
            if (!student?._id) continue;
            const students = sharedStudents.get(instanceId) || [];
            if (!students.some((s) => s._id.toString() === student._id.toString())) {
                students.push({
                    _id: student._id,
                    name: student.name || "Okänd elev",
                    email: student.email || null,
                });
            }
            sharedStudents.set(instanceId, students);
        }
        for (const students of sharedStudents.values()) {
            students.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        }
    }

    const cards = [...byInstance.values()]
        .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
        .map((enrollment, index) => {
            const instance = enrollment.courseInstanceId;
            const startDate = instance?.startDate || enrollment.startDate;
            const endDate = instance?.endDate || enrollment.endDate;
            const weeks = Math.ceil(
                (new Date(endDate) - new Date(startDate)) / (7 * 24 * 60 * 60 * 1000)
            );
            const instanceId = instance?._id?.toString();

            return {
                courseInstanceId: instance?._id || null,
                enrollmentId: enrollment._id,
                students: sharedStudents.get(instanceId) || [],
                courseName:
                    instance?.courseName ||
                    instance?.mainCourseId?.courseName ||
                    enrollment.mainCourseId?.courseName ||
                    "",
                courseCode:
                    instance?.courseCode ||
                    instance?.mainCourseId?.courseCode ||
                    enrollment.mainCourseId?.courseCode ||
                    "",
                coursePoints:
                    instance?.coursePoints ||
                    instance?.mainCourseId?.coursePoints ||
                    enrollment.mainCourseId?.coursePoints ||
                    "",
                courseExtent:
                    instance?.courseExtent ||
                    instance?.mainCourseId?.courseExtent ||
                    enrollment.mainCourseId?.courseExtent ||
                    "",
                responsibleTeacher:
                    instance?.responsibleTeacher?.userId?.username ||
                    instance?.responsibleTeacher?.name ||
                    instance?.responsibleTeacher?.email ||
                    "",
                startDate,
                endDate,
                weeks: Number.isFinite(weeks) ? Math.max(0, weeks) : 0,
                studyPeriod: index + 1,
                status: enrollment.status,
                isCurrentlyActive:
                    enrollment.status === "active" &&
                    new Date(startDate) <= new Date() &&
                    new Date(endDate) >= new Date(),
                modules: instance?.modules || [],
            };
        });

    // Per-card learning progress: accepted ("godkänd") submissions over the
    // modules that carry an assignment. Cards without any assignment report null.
    const enrollmentIds = cards
        .map((c) => c.enrollmentId)
        .filter((id) => mongoose.isValidObjectId(id));
    const submissionsByEnrollment = new Map();
    if (enrollmentIds.length > 0) {
        const submissions = await AssignmentSubmission.find({
            enrollmentId: { $in: enrollmentIds },
        });
        for (const submission of submissions) {
            const key = String(submission.enrollmentId);
            const list = submissionsByEnrollment.get(key) || [];
            list.push(submission);
            submissionsByEnrollment.set(key, list);
        }
    }

    for (const card of cards) {
        const assignmentModules = (card.modules || []).filter(
            (m) => m.assignment?.title || m.assignment?.description
        );
        const total = assignmentModules.length;
        if (total === 0) {
            card.progress = null;
            continue;
        }
        const moduleNumbers = new Set(assignmentModules.map((m) => m.moduleNumber));
        const accepted = (
            submissionsByEnrollment.get(String(card.enrollmentId)) || []
        ).filter(
            (s) => s.feedback?.status === "godkänd" && moduleNumbers.has(s.moduleNumber)
        ).length;
        card.progress = {
            completed: accepted,
            total,
            percent: Math.round((accepted / total) * 100),
        };
    }

    return cards;
};

/**
 * GET /course-cards/mine
 * Returns course cards for the currently logged-in student.
 * The student login account is linked to a Student record by email.
 */
export const getMyCourseCards = async (req, res) => {
    try {
        const email = req.user?.email;
        if (!email) {
            return res.status(400).json({ error: "Konto saknar e-postadress" });
        }

        const student = await Student.findOne({ email }).select("_id name");
        if (!student) {
            return res.status(404).json({ error: "Ingen elevprofil hittades för kontot" });
        }

        const cards = await buildCourseCards(student._id);
        res.json({ success: true, student: { _id: student._id, name: student.name }, cards });
    } catch (error) {
        logger.error({ err: error }, "Error fetching my course cards");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * GET /students/:studentId/course-cards
 * Returns course cards for a specific student. Staff roles may view any
 * student; a student role may only view their own cards (matched by the
 * login account's email → Student record, the same linkage used elsewhere).
 */
export const getStudentCourseCards = async (req, res) => {
    try {
        const { studentId } = req.params;
        if (!mongoose.isValidObjectId(studentId)) {
            return res.status(400).json({ error: "Invalid student id" });
        }

        const userRoles = req.user?.roles || (req.user?.role ? [req.user.role] : []);
        if (userRoles.includes("student")) {
            const email = req.user?.email;
            if (!email) {
                return res
                    .status(403)
                    .json({ error: "Forbidden: You can only view your own course cards" });
            }
            const ownStudent = await Student.findOne({ email }).select("_id");
            if (!ownStudent || ownStudent._id.toString() !== studentId) {
                return res
                    .status(403)
                    .json({ error: "Forbidden: You can only view your own course cards" });
            }
        }

        const cards = await buildCourseCards(studentId);
        res.json({ success: true, cards });
    } catch (error) {
        logger.error({ err: error }, "Error fetching student course cards");
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getCourseInstanceEnrollments = async (req, res) => {
    try {
        const { instanceId } = req.params;
        const { status } = req.query;

        const query = { courseInstanceId: instanceId };

        if (status) query.status = status;

        const enrollments = await StudentEnrollment.find(query)
            .populate("studentId", "name email dropout")
            .populate("mainCourseId", "courseName courseCode")
            .populate("teacherId", "username email")
            .populate("gradeBy", "username email")
            .sort({ startDate: -1 })
            .lean();

        // Attach the student's last login time (participants "last-access" column).
        // Students and staff are linked to login accounts by email; best-effort lookup.
        try {
            const studentEmails = [
                ...new Set(
                    enrollments
                        .map((e) => e.studentId?.email)
                        .filter((email) => email && typeof email === "string")
                ),
            ];
            if (studentEmails.length > 0) {
                const users = await User.find({ email: { $in: studentEmails } })
                    .select("email lastLoginAt")
                    .lean();
                const lastLoginByEmail = new Map(
                    users.map((u) => [u.email, u.lastLoginAt || null])
                );
                for (const enrollment of enrollments) {
                    const email = enrollment.studentId?.email;
                    if (email && lastLoginByEmail.has(email)) {
                        enrollment.lastLoginAt = lastLoginByEmail.get(email);
                    } else {
                        enrollment.lastLoginAt = null;
                    }
                }
            }
        } catch (lastLoginError) {
            logger.error({ err: lastLoginError }, "Error attaching lastLoginAt to enrollments");
        }

        res.json({
            success: true,
            enrollments,
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching course instance enrollments");
        res.status(500).json({ error: "Internal server error" });
    }
};

export const updateEnrollmentStatus = async (req, res) => {
    try {
        const { enrollmentId } = req.params;
        const { status, reason, notes } = req.body;
        const userId = req.user?.userId;

        logger.debug({ enrollmentId, status }, "Updating enrollment status");

        const enrollment = await StudentEnrollment.findById(enrollmentId);
        if (!enrollment) {
            return res.status(404).json({ error: "Enrollment not found" });
        }

        // Validate status
        const validStatuses = ["enrolled", "active", "completed", "dropped", "inactive", "suspended", "reviderad"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                error: "Invalid status", 
                validStatuses 
            });
        }

        await enrollment.changeStatus(status, reason, notes, userId);

        // Update course instance statistics (wrap in try-catch to not fail if this errors)
        try {
            await CourseMatchingService.updateCourseInstanceStats(
                enrollment.courseInstanceId
            );
        } catch (statsError) {
            logger.error({ err: statsError }, "Error updating course instance stats (non-fatal)");
        }

        // Reload enrollment to get updated data
        const updatedEnrollment = await StudentEnrollment.findById(enrollmentId)
            .populate("teacherId", "name email")
            .populate("mainCourseId", "courseName courseCode");

        res.json({
            success: true,
            message: "Enrollment status updated successfully",
            enrollment: updatedEnrollment,
        });
    } catch (error) {
        logger.error({ err: error }, "Error updating enrollment status");
        res.status(500).json({ 
            error: "Internal server error",
            message: error.message 
        });
    }
};

/**
 * Update enrollment dates
 */
export const updateEnrollmentDates = async (req, res) => {
    try {
        const { enrollmentId } = req.params;
        const { startDate, endDate } = req.body;

        const enrollment = await StudentEnrollment.findById(enrollmentId);
        if (!enrollment) {
            return res.status(404).json({ error: "Enrollment not found" });
        }

        if (startDate !== undefined) {
            enrollment.startDate = new Date(startDate);
        }
        if (endDate !== undefined) {
            enrollment.endDate = new Date(endDate);
        }

        await enrollment.save();

        res.json({
            success: true,
            message: "Enrollment dates updated successfully",
            enrollment,
        });
    } catch (error) {
        logger.error({ err: error }, "Error updating enrollment dates");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Delete a student enrollment and shift subsequent course dates up
 */
export const deleteEnrollmentAndShift = async (req, res) => {
    try {
        const { studentId, enrollmentId } = req.params;
        const userId = req.user?.userId || null;

        const student = await Student.findById(studentId).select("teacherId name");
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const enrollments = await StudentEnrollment.find({
            studentId,
            mainCourseId: { $exists: true, $ne: null },
        }).sort({ startDate: 1, createdAt: 1 });

        const targetIndex = enrollments.findIndex(
            (enrollment) => String(enrollment._id) === String(enrollmentId)
        );
        if (targetIndex === -1) {
            return res.status(404).json({ error: "Enrollment not found for student" });
        }

        const dateSlots = enrollments.map((enrollment) => ({
            startDate: enrollment.startDate ? new Date(enrollment.startDate) : null,
            endDate: enrollment.endDate ? new Date(enrollment.endDate) : null,
        }));

        const targetEnrollment = enrollments[targetIndex];
        await StudentEnrollment.findByIdAndDelete(targetEnrollment._id);

        if (targetEnrollment.courseInstanceId) {
            const remainingForInstance = await StudentEnrollment.countDocuments({
                courseInstanceId: targetEnrollment.courseInstanceId,
            });
            if (remainingForInstance === 0) {
                await CourseInstance.findByIdAndDelete(targetEnrollment.courseInstanceId);
            }
        }

        const remainingEnrollments = enrollments.filter(
            (enrollment) => String(enrollment._id) !== String(enrollmentId)
        );

        const updatedEnrollments = [];
        for (let i = 0; i < remainingEnrollments.length; i += 1) {
            const enrollment = remainingEnrollments[i];
            const slot = dateSlots[i];
            if (!slot?.startDate || !slot?.endDate) continue;

            const sameDates =
                enrollment.startDate &&
                enrollment.endDate &&
                new Date(enrollment.startDate).getTime() === slot.startDate.getTime() &&
                new Date(enrollment.endDate).getTime() === slot.endDate.getTime();

            if (sameDates) continue;

            const { instance } = await CourseMatchingService.findOrCreateCourseInstance(
                enrollment.mainCourseId,
                slot.startDate,
                slot.endDate,
                userId,
                student.teacherId || enrollment.teacherId || null
            );

            const previousInstanceId = enrollment.courseInstanceId;
            enrollment.startDate = slot.startDate;
            enrollment.endDate = slot.endDate;
            if (instance?._id) {
                enrollment.courseInstanceId = instance._id;
            }
            if (!enrollment.teacherId && student.teacherId) {
                enrollment.teacherId = student.teacherId;
            }

            await enrollment.save();
            updatedEnrollments.push(enrollment);

            if (
                previousInstanceId &&
                String(previousInstanceId) !== String(enrollment.courseInstanceId)
            ) {
                const remainingForPrevious = await StudentEnrollment.countDocuments({
                    courseInstanceId: previousInstanceId,
                });
                if (remainingForPrevious === 0) {
                    await CourseInstance.findByIdAndDelete(previousInstanceId);
                }
            }
        }

        res.json({
            success: true,
            message: "Enrollment deleted and study plan updated",
            deletedEnrollmentId: enrollmentId,
            updatedEnrollmentsCount: updatedEnrollments.length,
        });
    } catch (error) {
        logger.error({ err: error }, "Error deleting enrollment and shifting dates");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Update study plan tempo for future courses only
 */
export const updateStudyplanTempo = async (req, res) => {
    try {
        const { studentId } = req.params;
        const { tempoWeeks } = req.body;
        const userId = req.user?.userId || null;

        const validTempoWeeks = [5, 10, 20];
        if (!validTempoWeeks.includes(Number(tempoWeeks))) {
            return res.status(400).json({ error: "Invalid tempoWeeks" });
        }

        const student = await Student.findById(studentId).select("teacherId name");
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const enrollments = await StudentEnrollment.find({
            studentId,
            mainCourseId: { $exists: true, $ne: null },
        }).sort({ startDate: 1, createdAt: 1 });

        const futureEnrollments = enrollments.filter((enrollment) => {
            if (!enrollment.startDate) return false;
            const startDate = new Date(enrollment.startDate);
            return startDate.getTime() > today.getTime();
        });

        if (futureEnrollments.length === 0) {
            return res.json({
                success: true,
                message: "Study plan tempo updated",
                updatedCount: 0,
            });
        }

        let nextStartDate = new Date(futureEnrollments[0].startDate);
        let updatedCount = 0;
        for (const enrollment of futureEnrollments) {
            const startDate = new Date(nextStartDate);
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + Number(tempoWeeks) * 7);

            const { instance } = await CourseMatchingService.findOrCreateCourseInstance(
                enrollment.mainCourseId,
                startDate,
                endDate,
                userId,
                student.teacherId || enrollment.teacherId || null
            );

            const previousInstanceId = enrollment.courseInstanceId;
            const previousEnrollmentId = enrollment._id;

            const newEnrollment = new StudentEnrollment({
                studentId,
                courseInstanceId: instance._id,
                mainCourseId: enrollment.mainCourseId,
                startDate,
                endDate,
                status: enrollment.status || "enrolled",
                teacherId: enrollment.teacherId || student.teacherId || null,
                notes: enrollment.notes || null,
                needsSupport: enrollment.needsSupport || false,
                examMode: enrollment.examMode || "on-site",
                isReEnrollment: true,
                previousEnrollmentId: previousEnrollmentId,
            });

            await newEnrollment.save();

            await StudentEnrollment.findByIdAndDelete(previousEnrollmentId);

            if (previousInstanceId) {
                const remainingForPrevious = await StudentEnrollment.countDocuments({
                    courseInstanceId: previousInstanceId,
                });
                if (remainingForPrevious === 0) {
                    await CourseInstance.findByIdAndDelete(previousInstanceId);
                }
            }

            updatedCount += 1;
            nextStartDate = new Date(endDate);
        }

        res.json({
            success: true,
            message: "Study plan tempo updated",
            updatedCount,
        });
    } catch (error) {
        logger.error({ err: error }, "Error updating study plan tempo");
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getCourseStatistics = async (req, res) => {
    try {
        const { startDate, endDate, courseId } = req.query;

        if (!startDate || !endDate) {
            return res
                .status(400)
                .json({ error: "Start date and end date are required" });
        }

        const stats = await CourseMatchingService.getCourseStatistics(
            new Date(startDate),
            new Date(endDate),
            courseId
        );

        res.json({
            success: true,
            statistics: stats,
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching course statistics");
        res.status(500).json({ error: "Internal server error" });
    }
};

export const createCourseInstance = async (req, res) => {
    try {
        const {
            mainCourseId,
            startDate,
            endDate,
            courseName,
            courseCode,
            coursePoints,
            courseExtent,
            notes,
            slutprovDate,
            responsibleTeacher,
            assistantTeacher,
            templateId,
        } = req.body;
        const userId = req.user?.userId;

        if (!mainCourseId || !startDate || !endDate) {
            return res.status(400).json({
                error: "Main course ID, start date, and end date are required",
            });
        }

        // Get the main course to inherit values if not provided
        const mainCourse = await Course.findById(mainCourseId);
        if (!mainCourse) {
            return res.status(404).json({ error: "Main course not found" });
        }

        // Generate course code if not provided
        let finalCourseCode = courseCode;
        if (!finalCourseCode) {
            const startDateObj = new Date(startDate);
            const year = String(startDateObj.getFullYear()).slice(-2);
            const month = String(startDateObj.getMonth() + 1).padStart(2, '0');
            finalCourseCode = `${mainCourse.courseCode}${year}${month}`;
        }

        // Check for uniqueness and add version suffix if needed
        let uniqueCourseCode = finalCourseCode;
        let version = 1;
        while (await CourseInstance.findOne({ courseCode: uniqueCourseCode })) {
            uniqueCourseCode = `${finalCourseCode}v${version}`;
            version++;
        }

        // Use inherited values if not provided
        const finalCourseName = courseName || mainCourse.courseName;
        const finalCoursePoints = coursePoints || mainCourse.coursePoints;
        const finalCourseExtent = courseExtent || mainCourse.courseExtent;

        // Parse dates correctly - handle date strings in YYYY-MM-DD format
        const parseDate = (dateString) => {
            if (!dateString || dateString.trim() === '') return undefined;
            // If it's already a Date object, return it
            if (dateString instanceof Date) return dateString;
            // Parse YYYY-MM-DD format and create date at local midnight
            const parts = dateString.split('-');
            if (parts.length === 3) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
                const day = parseInt(parts[2], 10);
                return new Date(year, month, day);
            }
            // Fallback to standard Date parsing
            const parsed = new Date(dateString);
            return isNaN(parsed.getTime()) ? undefined : parsed;
        };

        const parsedStartDate = parseDate(startDate);
        const parsedEndDate = parseDate(endDate);
        const responsibleTeacherId = responsibleTeacher || undefined;
        const assistantTeacherId = assistantTeacher || undefined;

        // Prevent duplicate course instances for same course + dates + teacher
        const existingInstance = await CourseInstance.findOne({
            mainCourseId,
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            responsibleTeacher: responsibleTeacherId,
        });
        if (existingInstance) {
            return res.status(409).json({
                error: "Duplicate course instance exists for this course and date range",
                instance: existingInstance,
            });
        }

        // Duplicate the template's module structure into the new course card/instance.
        // Explicit templateId (manual admin flow) ALWAYS wins over auto-resolution;
        // auto-resolution (item #31 Part B) only applies when no templateId is given,
        // which is the admission-time scenario. Both paths copy via cloneModules.
        let duplicatedModules = [];
        if (templateId) {
            const template = await CourseTemplate.findById(templateId);
            if (template) {
                duplicatedModules = cloneModules(template.modules);
            } else {
                logger.warn({ templateId }, "Course template not found for provided templateId — creating instance with empty modules");
            }
        } else {
            const template = await CourseMatchingService.resolveCourseTemplate(mainCourseId);
            if (template) {
                duplicatedModules = cloneModules(template.modules);
                logger.info({ courseName: finalCourseName, templateId: template._id, moduleCount: duplicatedModules.length }, "Auto-generated course card content from course template (no explicit templateId)");
            } else {
                logger.info({ courseName: finalCourseName, mainCourseId }, "course has no template — card created without content");
            }
        }

        // Create the course instance
        const newInstance = new CourseInstance({
            mainCourseId,
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            courseName: finalCourseName,
            courseCode: uniqueCourseCode,
            coursePoints: finalCoursePoints,
            courseExtent: finalCourseExtent,
            createdBy: userId,
            responsibleTeacher: responsibleTeacherId,
            assistantTeacher: assistantTeacherId,
            slutprovDate: parseDate(slutprovDate),
            notes: notes || '',
            isActive: true,
            modules: duplicatedModules,
        });

        await newInstance.save();

        res.json({
            success: true,
            message: "Course instance created successfully",
            instance: newInstance,
            wasCreated: true,
        });
    } catch (error) {
        logger.error({ err: error }, "Error creating course instance");
        res.status(500).json({ error: "Internal server error" });
    }
};

// Update a course instance
export const updateCourseInstance = async (req, res) => {
    try {
        const { instanceId } = req.params;
        const updateData = { ...req.body };

        // Find the instance first
        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        // Get main course to inherit values if fields are empty
        const mainCourse = await Course.findById(instance.mainCourseId);
        if (mainCourse) {
            // Inherit coursePoints if not provided or empty
            if (!updateData.coursePoints || updateData.coursePoints.trim() === '') {
                updateData.coursePoints = mainCourse.coursePoints;
            }
            // Inherit courseExtent if not provided or empty
            if (!updateData.courseExtent || updateData.courseExtent.trim() === '') {
                updateData.courseExtent = mainCourse.courseExtent;
            }
            // Inherit courseName if not provided or empty
            if (!updateData.courseName || updateData.courseName.trim() === '') {
                updateData.courseName = mainCourse.courseName;
            }
        }

        // Handle courseCode uniqueness if it's being updated
        if (updateData.courseCode && updateData.courseCode !== instance.courseCode) {
            let uniqueCourseCode = updateData.courseCode;
            let version = 1;
            while (await CourseInstance.findOne({ 
                courseCode: uniqueCourseCode,
                _id: { $ne: instanceId } // Exclude current instance
            })) {
                uniqueCourseCode = `${updateData.courseCode}v${version}`;
                version++;
            }
            updateData.courseCode = uniqueCourseCode;
        }

        // Parse dates correctly - handle date strings in YYYY-MM-DD or MM/DD/YYYY format
        const parseDate = (dateString) => {
            if (!dateString || dateString.trim() === '' || dateString === null || dateString === undefined) {
                return null;
            }
            // If it's already a Date object, return it
            if (dateString instanceof Date) {
                return isNaN(dateString.getTime()) ? null : dateString;
            }
            // Convert to string and trim
            const dateStr = String(dateString).trim();
            if (dateStr === '' || dateStr === 'null' || dateStr === 'undefined') {
                return null;
            }
            
            logger.debug({ dateStr }, "parseDate input");
            
            // Try YYYY-MM-DD format first (ISO format)
            let parts = dateStr.split('-');
            if (parts.length === 3 && parts[0].length === 4) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
                const day = parseInt(parts[2], 10);
                // Validate the parsed values
                if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                    // Validate reasonable date range
                    if (year >= 1900 && year <= 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
                        const date = new Date(year, month, day);
                        // Double-check the date is valid
                        if (!isNaN(date.getTime())) {
                            logger.debug({ year, month: month + 1, day }, "Parsed as YYYY-MM-DD");
                            return date;
                        }
                    }
                }
            }
            
            // Try MM/DD/YYYY format
            parts = dateStr.split('/');
            if (parts.length === 3) {
                // Check if first part is month (1-12) or year (4 digits)
                const firstPart = parseInt(parts[0], 10);
                const secondPart = parseInt(parts[1], 10);
                const thirdPart = parseInt(parts[2], 10);
                
                let year, month, day;
                if (firstPart > 12 && thirdPart <= 12) {
                    // Format: YYYY/MM/DD (unlikely but possible)
                    year = firstPart;
                    month = thirdPart - 1;
                    day = secondPart;
                } else if (thirdPart > 12 || thirdPart.toString().length === 4) {
                    // Format: MM/DD/YYYY
                    month = firstPart - 1;
                    day = secondPart;
                    year = thirdPart;
                } else {
                    // Format: DD/MM/YYYY (European)
                    day = firstPart;
                    month = secondPart - 1;
                    year = thirdPart;
                }
                
                if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                    // Validate reasonable date range
                    if (year >= 1900 && year <= 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
                        const date = new Date(year, month, day);
                        if (!isNaN(date.getTime())) {
                            logger.debug({ month: month + 1, day, year }, "Parsed as MM/DD/YYYY");
                            return date;
                        }
                    }
                }
            }
            
            // Fallback to standard Date parsing
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
                logger.debug({ parsed }, "Parsed using standard Date constructor");
                return parsed;
            }
            
            logger.warn({ dateStr }, "Failed to parse date");
            return null;
        };

        // Convert date strings to Date objects
        if (updateData.startDate) updateData.startDate = parseDate(updateData.startDate);
        if (updateData.endDate) updateData.endDate = parseDate(updateData.endDate);
        
        // Handle slutprovDate - check if it's being explicitly set (even if null/empty)
        const slutprovDateInRequest = 'slutprovDate' in req.body;
        let slutprovDateExplicitlySet = false;
        
        if (slutprovDateInRequest) {
            logger.debug({ slutprovDate: req.body.slutprovDate, type: typeof req.body.slutprovDate }, "slutprovDate in request");
            const parsedDate = parseDate(req.body.slutprovDate);
            logger.debug({ parsedDate }, "Parsed slutprovDate");
            if (parsedDate) {
                logger.debug({
                    getTime: parsedDate.getTime(),
                    toISOString: parsedDate.toISOString(),
                    toDateString: parsedDate.toDateString(),
                    isValid: !isNaN(parsedDate.getTime()),
                    year: parsedDate.getFullYear()
                }, "Parsed date details");
            }
            
            // Only set it if it's a valid date, or explicitly set to null/empty
            if (parsedDate !== null && !isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1970) {
                updateData.slutprovDate = parsedDate;
                slutprovDateExplicitlySet = true;
                logger.debug({ slutprovDate: parsedDate, isoString: parsedDate.toISOString() }, "Setting slutprovDate");
            } else if (req.body.slutprovDate === '' || req.body.slutprovDate === null) {
                updateData.slutprovDate = null; // Explicitly clear it
                slutprovDateExplicitlySet = true; // User explicitly cleared it
                logger.debug("Clearing slutprovDate (explicitly set to empty)");
            } else {
                logger.warn({ slutprovDate: req.body.slutprovDate, parsedResult: parsedDate }, "Failed to parse slutprovDate");
            }
        } else {
            logger.debug("slutprovDate NOT in request body");
        }

        // Check if we need to recalculate slutprovDate
        const teacherChanged = updateData.responsibleTeacher !== undefined;
        const endDateChanged = updateData.endDate !== undefined;

        // If teacher or endDate is changing, and slutprovDate is not explicitly set in this update,
        // we should recalculate it based on the new teacher/endDate
        if ((teacherChanged || endDateChanged) && !slutprovDateExplicitlySet) {
            const newTeacher = updateData.responsibleTeacher || instance.responsibleTeacher;
            const newEndDate = updateData.endDate || instance.endDate;

            // Auto-calculate if teacher is set
            if (newTeacher && newEndDate) {
                const { calculateSlutprovDate } = await import("../utils/slutprovDateCalculator.js");
                const calculatedDate = await calculateSlutprovDate(newTeacher, newEndDate);
                if (calculatedDate) {
                    updateData.slutprovDate = calculatedDate;
                    logger.info({ courseName: instance.courseName, slutprovDate: calculatedDate.toDateString() }, "Auto-calculated slutprovDate on update");
                }
            }
        }

        // Update the instance - use direct update to bypass pre-save hook issues
        const instanceToUpdate = await CourseInstance.findById(instanceId);
        if (!instanceToUpdate) {
            return res.status(404).json({ error: "Course instance not found" });
        }
        
        // Store the original slutprovDate before applying updates
        const originalSlutprovDate = instanceToUpdate.slutprovDate;
        logger.debug({ originalSlutprovDate }, "Original slutprovDate");
        
        // If we explicitly set slutprovDate, handle it separately to ensure it's preserved
        let finalSlutprovDate = updateData.slutprovDate;
        if (slutprovDateExplicitlySet) {
            finalSlutprovDate = updateData.slutprovDate; // This is already the parsed Date object
            logger.debug({ finalSlutprovDate }, "Will set slutprovDate to");
            // Remove from updateData so we can set it separately
            delete updateData.slutprovDate;
        }
        
        // Apply all other updates first
        Object.keys(updateData).forEach(key => {
            if (updateData[key] !== undefined) {
                logger.debug({ key, value: updateData[key] }, "Setting field value");
                instanceToUpdate[key] = updateData[key];
            }
        });
        
        // Now set slutprovDate explicitly after other updates, and mark it as modified
        if (slutprovDateExplicitlySet) {
            instanceToUpdate.slutprovDate = finalSlutprovDate;
            instanceToUpdate.markModified('slutprovDate');
            // Set a flag to prevent pre-save hook from overriding
            instanceToUpdate._slutprovDateExplicitlySet = true;
            logger.debug({ slutprovDate: instanceToUpdate.slutprovDate }, "Set slutprovDate directly");
            logger.debug({
                value: instanceToUpdate.slutprovDate,
                getTime: instanceToUpdate.slutprovDate?.getTime(),
                toISOString: instanceToUpdate.slutprovDate?.toISOString(),
                isValid: instanceToUpdate.slutprovDate && !isNaN(instanceToUpdate.slutprovDate.getTime()),
                year: instanceToUpdate.slutprovDate?.getFullYear()
            }, "Date object details");
        }
        
        // Save the instance (this will trigger pre-save hooks, but our hook should respect the explicit date)
        let updatedInstance;
        try {
            updatedInstance = await instanceToUpdate.save();
            logger.debug({ slutprovDate: updatedInstance.slutprovDate }, "Saved instance, final slutprovDate");
            if (updatedInstance.slutprovDate) {
                logger.debug({
                    value: updatedInstance.slutprovDate,
                    getTime: updatedInstance.slutprovDate.getTime(),
                    toISOString: updatedInstance.slutprovDate.toISOString(),
                    isValid: !isNaN(updatedInstance.slutprovDate.getTime()),
                    year: updatedInstance.slutprovDate.getFullYear()
                }, "Final date details");
                
                // If the date was changed to 1970-01-01, force update it directly via MongoDB
                if (updatedInstance.slutprovDate.getFullYear() === 1970 && slutprovDateExplicitlySet && finalSlutprovDate) {
                    logger.warn("Date was changed to 1970-01-01, forcing direct MongoDB update");
                    await CourseInstance.updateOne(
                        { _id: instanceId },
                        { $set: { slutprovDate: finalSlutprovDate } }
                    );
                    // Reload the instance
                    updatedInstance = await CourseInstance.findById(instanceId);
                    logger.debug({ slutprovDate: updatedInstance.slutprovDate }, "After force update, slutprovDate");
                }
            } else {
                logger.debug("Final slutprovDate is null/undefined");
            }
        } catch (error) {
            logger.error({ err: error }, "Error saving instance");
            throw error;
        }
        
        // If slutprovDate was updated, sync calendar events for all enrollments
        if (slutprovDateExplicitlySet && finalSlutprovDate) {
            try {
                const { default: StudentEnrollment } = await import("../models/StudentEnrollment.js");
                const { syncCalendarEventFromEnrollment } = await import("../utils/calendarEventSync.js");
                
                // Find all enrollments for this course instance
                const enrollments = await StudentEnrollment.find({
                    courseInstanceId: instanceId
                });
                
                // Update enrollments with the new slutprovDate
                for (const enrollment of enrollments) {
                    enrollment.slutprovDate = finalSlutprovDate;
                    await enrollment.save(); // This will trigger calendar sync via post-save hook
                }
                
                logger.debug({ count: enrollments.length }, "Synced calendar events after course instance update");
            } catch (calendarError) {
                logger.error({ err: calendarError }, "Error syncing calendar events after course instance update");
                // Don't fail the request if calendar sync fails
            }
        }

        res.json({
            success: true,
            message: "Course instance updated successfully",
            instance: updatedInstance,
        });
    } catch (error) {
        logger.error({ err: error }, "Error updating course instance");
        res.status(500).json({ error: "Internal server error" });
    }
};

// Add students to a course instance
export const addStudentsToInstance = async (req, res) => {
    try {
        const { instanceId } = req.params;
        const { studentIds } = req.body;
        const userId = req.user?.userId;

        if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({ error: "Student IDs array is required" });
        }

        // Find the course instance
        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        // Get the main course to get course details
        const mainCourse = await Course.findById(instance.mainCourseId);
        if (!mainCourse) {
            return res.status(404).json({ error: "Main course not found" });
        }

        const enrollments = [];
        const errors = [];

        for (const studentId of studentIds) {
            try {
                // Check if enrollment already exists
                const existingEnrollment = await StudentEnrollment.findOne({
                    studentId,
                    courseInstanceId: instanceId,
                });

                if (existingEnrollment) {
                    logger.debug({ studentId, instanceId }, "Enrollment already exists, skipping");
                    continue;
                }

                // Get student to find teacherId
                const student = await Student.findById(studentId);
                if (!student) {
                    errors.push(`Student ${studentId} not found`);
                    continue;
                }

                // Create enrollment
                const enrollment = new StudentEnrollment({
                    studentId,
                    courseInstanceId: instanceId,
                    mainCourseId: instance.mainCourseId,
                    startDate: instance.startDate,
                    endDate: instance.endDate,
                    status: "enrolled",
                    teacherId: student.teacherId || instance.responsibleTeacher || null,
                    // Copy slutprovDate from course instance if it exists
                    slutprovDate: instance.slutprovDate || null,
                });

                await enrollment.save();
                enrollments.push(enrollment);

                logger.info({ studentName: student.name, courseName: instance.courseName }, "Created enrollment for student in course instance");

                // Sync calendar event if enrollment has a slutprovDate
                if (enrollment.slutprovDate) {
                    try {
                        const { syncCalendarEventFromEnrollment } = await import("../utils/calendarEventSync.js");
                        await syncCalendarEventFromEnrollment(enrollment._id);
                    } catch (calendarError) {
                        logger.error({ err: calendarError, enrollmentId: enrollment._id }, "Error syncing calendar event for enrollment");
                        // Don't fail the enrollment creation if calendar sync fails
                    }
                }
            } catch (error) {
                logger.error({ err: error, studentId }, "Error creating enrollment for student");
                errors.push(`Failed to enroll student ${studentId}: ${error.message}`);
            }
        }

        res.json({
            success: true,
            message: `Added ${enrollments.length} student(s) to course instance`,
            enrollmentsCreated: enrollments.length,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error) {
        logger.error({ err: error }, "Error adding students to course instance");
        res.status(500).json({ error: "Internal server error" });
    }
};

// Delete a course instance and its enrollments
export const deleteCourseInstance = async (req, res) => {
    try {
        const { instanceId } = req.params;
        const instance = await CourseInstance.findByIdAndDelete(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }
        // Delete related enrollments
        await StudentEnrollment.deleteMany({ courseInstanceId: instanceId });
        res.json({
            success: true,
            message: "Course instance and related enrollments deleted",
        });
    } catch (error) {
        logger.error({ err: error }, "Error deleting course instance");
        res.status(500).json({ error: "Internal server error" });
    }
};

// GET /api/course-instances/:instanceId/content - get content for a course instance
// Admins/systemadmin and responsible teacher can see all content;
// students see content that is not hidden.
export const getCourseInstanceContent = async (req, res) => {
    try {
        const { instanceId } = req.params;
        const { userId: callerId, roles } = req.user;
        const isAdmin = roles.includes("systemadmin") || roles.includes("admin");

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        // Check permissions
        const isResponsibleTeacher = instance.responsibleTeacher &&
            instance.responsibleTeacher.toString() === callerId;

        if (!isAdmin && !isResponsibleTeacher) {
            return res.status(403).json({ error: "Saknar behörighet" });
        }

        // Build visible content for the caller
        const visibleContent = new Map();
        for (const [moduleNumber, moduleContent] of instance.content.entries()) {
            const entry = {
                title: moduleContent.title || `Modul ${moduleNumber}`,
                instructions: moduleContent.instructions || '',
            };
            // If the caller is a student and the content is hidden,
            // replace with placeholder
            if (!isAdmin && !isResponsibleTeacher && moduleContent.isHiddenFromStudent) {
                entry.title = 'Innehåll dolt';
                entry.instructions = 'Detta innehåll döljs för studenter.';
            }
            visibleContent.set(Number(moduleNumber), entry);
        }

        res.json({
            success: true,
            content: visibleContent,
            canEdit: isAdmin || isResponsibleTeacher,
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching course instance content");
        res.status(500).json({ error: "Intern servererror" });
    }
};

// PUT /api/course-instances/:instanceId/content - update content
// Admins/systemadmin and responsible teacher can update all content.
export const updateCourseInstanceContent = async (req, res) => {
    try {
        const { instanceId } = req.params;
        const { userId: callerId, roles } = req.user;
        const isAdmin = roles.includes("systemadmin") || roles.includes("admin");

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        // Check permissions
        const isResponsibleTeacher = instance.responsibleTeacher &&
            instance.responsibleTeacher.toString() === callerId;

        if (!isAdmin && !isResponsibleTeacher) {
            return res.status(403).json({ error: "Saknar behörighet" });
        }

        const { content } = req.body;
        if (!content || typeof content !== 'object') {
            return res.status(400).json({ error: "Ogiltig innehållsdata" });
        }

        // Update content map
        if (instance.content) {
            instance.content.clear();
        } else {
            instance.content = new Map();
        }

        for (const [moduleNumber, moduleContent] of Object.entries(content)) {
            const mn = Number(moduleNumber);
            if (!instance.content.has(mn)) {
                instance.content.set(mn, {
                    title: '',
                    instructions: '',
                    isHiddenFromStudent: false,
                });
            }
            instance.content.set(mn, {
                title: moduleContent.title !== undefined ? moduleContent.title : '',
                instructions: moduleContent.instructions !== undefined ? moduleContent.instructions : '',
                isHiddenFromStudent: moduleContent.isHiddenFromStudent !== undefined ? moduleContent.isHiddenFromStudent : false,
            });
        }

        await instance.save();
        res.json({
            success: true,
            message: "Innehåll uppdaterat",
            canEdit: isAdmin || isResponsibleTeacher,
        });
    } catch (error) {
        logger.error({ err: error }, "Error updating course instance content");
        res.status(500).json({ error: "Intern servererror" });
    }
};

// Bulk delete all course instances and related enrollments
export const deleteAllCourseInstances = async (req, res) => {
    try {
        logger.info("DELETE /course-instances/all called");
        const courseResult = await CourseInstance.deleteMany({});
        const enrollmentResult = await StudentEnrollment.deleteMany({});
        logger.info({ courseInstancesDeleted: courseResult.deletedCount, enrollmentsDeleted: enrollmentResult.deletedCount }, "Deleted course instances and enrollments");
        res.json({
            success: true,
            message: `All course instances (${courseResult.deletedCount}) and related enrollments (${enrollmentResult.deletedCount}) deleted`,
        });
    } catch (error) {
        logger.error({ err: error }, "Error deleting all course instances");
        res.status(500).json({ error: "Internal server error" });
    }
};
