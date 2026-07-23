import { normalizeCodeForMatching } from "./parseStudentExcel.js";
import logger from "./logger.js";

class CourseMatchingService {
    /**
     * Helper: get next Monday
     */
    static getNextMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = day === 1 ? 0 : (8 - day) % 7;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    /**
     * Helper: add weeks
     */
    static addWeeks(date, weeks) {
        const d = new Date(date);
        d.setDate(d.getDate() + weeks * 7);
        return d;
    }

    /**
     * Helper: get Wednesday of week X (1-based, relative to start)
     */
    static getWednesdayOfWeek(startDate, weekNum) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + (weekNum - 1) * 7);
        d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7)); // 3 = Wednesday
        d.setHours(0, 0, 0, 0);
        return d;
    }

    /**
     * Clean course name for better matching
     */
    static cleanCourseName(name) {
        return name
            .toUpperCase()
            .replace(/\(.*?\)/g, "") // Remove parentheses
            .replace(/\bmot\b/gi, "") // Remove "mot"
            .replace(/[,;|]/g, "") // Remove separators
            .replace(/\s+/g, " ") // Collapse spaces
            .trim();
    }

    /**
     * Find the best matching course using strict exact code matching only
     */
    static async findBestCourseMatch(courseCodeOrName, threshold = 0.7) {
        const { default: Course } = await import("../models/Course.js");
        // Normalize input: treat as code using the same function as database codes
        const normalizedInput = normalizeCodeForMatching(courseCodeOrName || "");

        if (!normalizedInput) {
            return null;
        }

        // Get all courses (include inactive too to avoid false negatives)
        let allCourses = await Course.find({ isActive: true });
        if (!allCourses || allCourses.length === 0) {
            allCourses = await Course.find({});
        }

        // Only exact code match - no fuzzy matching
        for (const course of allCourses) {
            const normalizedCode = normalizeCodeForMatching(course.courseCode || "");
            if (normalizedCode === normalizedInput) {
                logger.debug({ normalizedInput, courseCode: course.courseCode, courseName: course.courseName }, "Exact code match found");
                return { course, score: 1.0 };
            }
        }

        // No match found - return null (strict matching only)
        logger.debug({ normalizedInput }, "No exact code match found");
        return null;
    }

    /**
     * Find or create course instance for a specific date range
     */
    static async findOrCreateCourseInstance(
        mainCourseId,
        startDate,
        endDate,
        userId = null,
        responsibleTeacherId = null,
        slutprovDate = null
    ) {
        const { default: CourseInstance } = await import(
            "../models/CourseInstance.js"
        );
        const { default: Course } = await import("../models/Course.js");
        // Only match on exact course + startDate + endDate
        const existingInstance = await CourseInstance.findOne({
            mainCourseId,
            startDate,
            endDate,
        });

        if (existingInstance) {
            let needsSave = false;

            // Update responsibleTeacher if provided AND instance doesn't have one, or if explicitly provided
            if (responsibleTeacherId) {
                // If instance doesn't have a responsibleTeacher, set it
                if (!existingInstance.responsibleTeacher) {
                    existingInstance.responsibleTeacher = responsibleTeacherId;
                    needsSave = true;
                    logger.debug({ courseName: existingInstance.courseName, responsibleTeacherId }, "Setting responsibleTeacher for existing course instance");
                }
                // If instance has a different responsibleTeacher and we're explicitly providing one, update it
                else if (existingInstance.responsibleTeacher?.toString() !== responsibleTeacherId.toString()) {
                    existingInstance.responsibleTeacher = responsibleTeacherId;
                    needsSave = true;
                    logger.debug({ courseName: existingInstance.courseName, responsibleTeacherId }, "Updating responsibleTeacher for existing course instance");
                }
            }

            // Only set slutprovDate if explicitly provided AND there's no teacher
            // If there's a teacher, let the pre-save hook calculate it based on teacher rules
            if (slutprovDate && !responsibleTeacherId) {
                existingInstance.slutprovDate = slutprovDate;
                needsSave = true;
                logger.info({ courseName: existingInstance.courseName, slutprovDate }, "Force patched slutprovDate for course instance");
            } else if (responsibleTeacherId && !slutprovDate) {
                // Teacher is set but no explicit date - clear existing date to let pre-save hook recalculate
                if (existingInstance.slutprovDate) {
                    existingInstance.slutprovDate = undefined;
                    needsSave = true;
                    logger.info({ courseName: existingInstance.courseName }, "Cleared slutprovDate for course instance to let pre-save hook recalculate");
                }
            }

            // Save if any changes were made (this will trigger pre-save hook for auto-calculation)
            if (needsSave) {
                await existingInstance.save();
            }

            logger.info({ courseName: existingInstance.courseName, startDate: existingInstance.startDate.toDateString(), endDate: existingInstance.endDate.toDateString() }, "Found existing course instance");
            return { instance: existingInstance, wasCreated: false };
        }

        // If no existing instance, create a new one
        const mainCourse = await Course.findById(mainCourseId);
        if (!mainCourse) {
            throw new Error(`Main course not found: ${mainCourseId}`);
        }

        // Only set slutprovDate if explicitly provided AND there's no teacher
        // If there's a teacher, let the pre-save hook calculate it based on teacher rules
        const shouldSetSlutprovDate = slutprovDate && !responsibleTeacherId;

        // Generate unique courseCode: baseCourseCode + YY (year) + MM (month)
        const startDateObj = new Date(startDate);
        const year = String(startDateObj.getFullYear()).slice(-2); // Last 2 digits of year (e.g., "26" for 2026)
        const month = String(startDateObj.getMonth() + 1).padStart(2, '0'); // Month (01-12)
        const uniqueCourseCode = `${mainCourse.courseCode}${year}${month}`;

        const newInstance = new CourseInstance({
            mainCourseId,
            startDate,
            endDate,
            courseName: mainCourse.courseName,
            courseCode: uniqueCourseCode,
            coursePoints: mainCourse.coursePoints,
            courseExtent: mainCourse.courseExtent,
            createdBy: userId,
            responsibleTeacher: responsibleTeacherId || undefined,
            notes: `Auto-created for student enrollment (${startDate.toDateString()} - ${endDate.toDateString()})`,
            // Only set slutprovDate if explicitly provided and no teacher (let pre-save hook calculate for teachers)
            slutprovDate: shouldSetSlutprovDate ? slutprovDate : undefined,
        });

        await newInstance.save();

        logger.info({ courseName: newInstance.courseName, startDate: newInstance.startDate.toDateString(), endDate: newInstance.endDate.toDateString() }, "Created new course instance");

        return { instance: newInstance, wasCreated: true };
    }

    /**
     * Process student education entries and create enrollments
     */
    static async processStudentEducation(
        studentId,
        educationEntries,
        userId = null,
        options = {}
    ) {
        const { default: StudentEnrollment } = await import(
            "../models/StudentEnrollment.js"
        );
        const results = {
            enrollments: [],
            warnings: [],
            errors: [],
        };

        logger.debug({ educationCount: educationEntries.length, studentId }, "Processing education entries for student");

        // Deduplicate missing package errors
        const missingPackages = new Set();
        for (const entry of educationEntries) {
            try {
                // --- PATCH: Match course packages by code (prioritized) ---
                const { default: CoursePackage } = await import(
                    "../models/CoursePackage.js"
                );
                const allPackages = await CoursePackage.find({}).lean();

                // Normalize entry as code: uppercase, remove spaces
                // Normalize entry code using the same function as database codes
                // (entry.name already has cleanCourseName applied during parsing)
                let normalizedEntryCode = normalizeCodeForMatching(entry.name || "");

                // Only exact code match - no fuzzy matching
                let packageMatch = allPackages.find((pkg) => {
                    const normalizedCode = normalizeCodeForMatching(pkg.coursePackageCode || "");
                    return normalizedCode === normalizedEntryCode;
                });

                if (packageMatch) {
                    logger.debug({ entryName: entry.name, packageCode: packageMatch.coursePackageCode, packageName: packageMatch.coursePackageName }, "Exact package match found");
                } else {
                    logger.debug({ entryName: entry.name, normalizedEntryCode }, "No exact package match found");
                }
                if (packageMatch) {
                    if (entry.type !== "CoursePackage") {
                        logger.debug({ normalizedEntryCode }, "Name matches a CoursePackage. Forcing type to CoursePackage");
                    }
                    entry.type = "CoursePackage";
                    entry.refId = packageMatch._id;
                }
                if (
                    entry.type === "Course" &&
                    entry.startDate &&
                    entry.endDate
                ) {
                    // Find the best course match
                    const match = await this.findBestCourseMatch(entry.name);

                    if (!match) {
                        results.warnings.push({
                            type: "no_match",
                            courseName: entry.name,
                            studentId: studentId,
                            message: `Ingen matchande kurs hittades för "${entry.name}". Kursen kommer inte att skapas automatiskt.`,
                        });
                        continue;
                    }

                    // Get student first to find teacherId for course instance
                    let studentDocA;
                    if (!global._StudentModel) {
                        const studentDocImport = await import(
                            "../models/Student.js"
                        );
                        global._StudentModel = studentDocImport.default;
                    }
                    studentDocA = await global._StudentModel.findById(
                        studentId
                    );

                    // Use student's teacherId as responsibleTeacher for course instance
                    const responsibleTeacherId = studentDocA?.teacherId || entry.teacherId || null;

                    // Determine slutprovDate (will be calculated later after enrollment is created)
                    // For now, pass entry.slutprovDate if available, otherwise null
                    const initialSlutprovDate = entry.slutprovDate ? new Date(entry.slutprovDate) : null;

                    // Find or create course instance, pass responsibleTeacherId from student
                    const { instance, wasCreated } =
                        await this.findOrCreateCourseInstance(
                            match.course._id,
                            new Date(entry.startDate),
                            new Date(entry.endDate),
                            userId,
                            responsibleTeacherId,
                            initialSlutprovDate
                        );
                    logger.debug({ entryName: entry.name, slutprovDate: instance?.slutprovDate }, "CourseInstance created/used for course");
                    logger.debug({ responsibleTeacher: instance?.responsibleTeacher || "none", studentTeacherId: responsibleTeacherId || "none" }, "CourseInstance responsibleTeacher");

                    if (wasCreated) {
                        results.warnings.push({
                            type: "instance_created",
                            courseName: entry.name,
                            instanceId: instance._id,
                            message: `Created new course instance for "${entry.name
                                }" (${instance.startDate.toDateString()} - ${instance.endDate.toDateString()})`,
                        });
                    }

                    // Add this check before creating a new StudentEnrollment
                    const existingEnrollment = await StudentEnrollment.findOne({
                        studentId,
                        courseInstanceId: instance._id,
                        mainCourseId: match.course._id,
                        startDate: new Date(entry.startDate),
                        endDate: new Date(entry.endDate),
                    });
                    if (existingEnrollment) {
                        logger.debug({ studentId, courseId: match.course._id, startDate: entry.startDate, endDate: entry.endDate }, "Skipping duplicate enrollment");
                        continue;
                    }

                    logger.debug({ studentId }, "Loading student document");
                    logger.debug({ exists: !!studentDocA }, "studentDocA exists");
                    if (studentDocA) {
                        logger.debug({ studentName: studentDocA.name }, "Student name");
                        logger.debug({ educationCount: studentDocA.education?.length || 0 }, "Current education entries");
                    }

                    // Create enrollment
                    const enrollment = new StudentEnrollment({
                        studentId,
                        courseInstanceId: instance._id,
                        mainCourseId: match.course._id,
                        startDate: new Date(entry.startDate),
                        endDate: new Date(entry.endDate),
                        status: "enrolled",
                        teacherId:
                            studentDocA?.teacherId || entry.teacherId || null,
                        notes: entry.notes || null,
                        needsSupport: options.needsSupport || false,
                        examMode: options.examMode || 'on-site',
                    });
                    logger.debug({ teacherId: enrollment.teacherId || "null", studentDocTeacherId: studentDocA?.teacherId || "null", entryTeacherId: entry.teacherId || "null" }, "Creating individual course enrollment");

                    await enrollment.save();

                    // Calculate and set slutprov date BEFORE adding to results
                    const courseStart = new Date(entry.startDate);
                    let slutprovDate;
                    if (entry.slutprovDate) {
                        // Use explicit slutprovDate if provided
                        slutprovDate = new Date(entry.slutprovDate);
                        logger.debug({ slutprovDate: slutprovDate.toDateString() }, "Using provided slutprov date for individual course");
                    } else if (!entry.teacherId) {
                        // Only use fallback Wednesday if there's no teacher
                        // If there's a teacher, let the pre-save hook calculate based on teacher rules
                        slutprovDate = this.getWednesdayOfWeek(
                            courseStart,
                            4
                        );
                        logger.debug({ slutprovDate: slutprovDate.toDateString() }, "Calculated slutprov date for individual course (Wednesday week 4)");
                    } else {
                        // Teacher is set but no explicit date - let pre-save hook calculate
                        // Reload enrollment to get the calculated date from the pre-save hook
                        const reloadedEnrollment = await StudentEnrollment.findById(enrollment._id);
                        slutprovDate = reloadedEnrollment?.slutprovDate || null;
                        if (slutprovDate) {
                            logger.debug({ slutprovDate: slutprovDate.toDateString() }, "Using auto-calculated slutprov date from pre-save hook");
                        } else {
                            // Fallback to Wednesday week 4 if pre-save hook didn't set it
                            slutprovDate = this.getWednesdayOfWeek(courseStart, 4);
                            logger.debug({ slutprovDate: slutprovDate.toDateString() }, "Fallback: Calculated slutprov date (Wednesday week 4)");
                        }
                    }

                    // Validate the slutprov date
                    if (isNaN(slutprovDate.getTime())) {
                        logger.error({ slutprovDate: entry.slutprovDate || "calculated" }, "Invalid slutprov date for individual course");
                        continue;
                    }

                    // Normalize to noon UTC to avoid timezone shifts in all-day calendar events
                    slutprovDate.setUTCHours(12, 0, 0, 0);

                    // Set slutprov date on enrollment
                    enrollment.slutprovDate = slutprovDate;
                    await enrollment.save();

                    // Attach student email for frontend display (AFTER slutprovDate is set)
                    // studentDocA is already loaded above
                    results.enrollments.push({
                        ...enrollment.toObject(),
                        studentEmail: studentDocA?.email || "",
                        courseInstanceName: instance.courseName || "",
                    });
                    logger.info({ studentId, entryName: entry.name, courseInstanceId: instance._id }, "Created enrollment for student in course");

                    // DISABLED: Individual calendar event creation to prevent duplicates
                    // Calendar events are now handled by the deduplication system in /calendar-events/syncable
                    // Calendar events are automatically created via calendarEventSync utility

                    // --- PATCH: Update student's education array for ALL types ---
                    logger.debug({ studentId }, "About to update education array for student");
                    logger.debug({ exists: !!studentDocA }, "studentDocA exists");
                    if (studentDocA) {
                        logger.debug({ studentName: studentDocA.name }, "Student name");
                        logger.debug({ educationCount: studentDocA.education?.length || 0 }, "Current education entries");

                        // Remove any existing education entry for this course and date range
                        studentDocA.education = (
                            studentDocA.education || []
                        ).filter((e) => {
                            if (e.type !== "Course") return true;
                            if (!e.refId) return true;
                            return (
                                e.refId.toString() !==
                                match.course._id.toString() ||
                                new Date(e.startDate).getTime() !==
                                new Date(entry.startDate).getTime() ||
                                new Date(e.endDate).getTime() !==
                                new Date(entry.endDate).getTime()
                            );
                        });

                        logger.debug({ count: studentDocA.education.length }, "After filtering, education entries");

                        // Add the new education entry (always, regardless of type)
                        const newEducationEntry = {
                            type: "Course",
                            refId: match.course._id,
                            name: match.course.courseName,
                            startDate: new Date(entry.startDate),
                            endDate: new Date(entry.endDate),
                            grade: null,
                            addedAt: new Date(),
                            addedBy: userId,
                            removedAt: null,
                        };

                        logger.debug({ newEducationEntry }, "Adding education entry");
                        studentDocA.education.push(newEducationEntry);
                        logger.debug({ count: studentDocA.education.length }, "After adding, education entries");

                        logger.debug("Saving student document...");
                        await studentDocA.save();
                        logger.debug("Student document saved successfully");
                    } else {
                        logger.debug("studentDocA is null/undefined, cannot update education array");
                    }
                    // --- END PATCH ---
                }
                // --- PATCH: Handle CoursePackage and Program types as well ---
                else if (entry.type === "CoursePackage" && entry.refId) {
                    // Retrieve the course package and its courses (ordered)
                    const CoursePackageModel = (
                        await import("../models/CoursePackage.js")
                    ).default;
                    const packageDoc = await CoursePackageModel.findById(
                        entry.refId
                    ).populate("coursePackageCourses");
                    if (!packageDoc) {
                        results.errors.push({
                            type: "no_package",
                            packageId: entry.refId,
                            message: `No course package found for id ${entry.refId}`,
                        });
                        continue;
                    }

                    // Get student first to find teacherId for course instances
                    let studentDocPackage;
                    if (!global._StudentModel) {
                        const studentDocImport = await import(
                            "../models/Student.js"
                        );
                        global._StudentModel = studentDocImport.default;
                    }
                    studentDocPackage = await global._StudentModel.findById(
                        studentId
                    );
                    
                    // Use student's teacherId as responsibleTeacher for course instances
                    const packageResponsibleTeacherId = studentDocPackage?.teacherId || entry.teacherId || null;

                    // Start scheduling
                    let courseStart = this.getNextMonday(
                        entry.startDate || new Date()
                    );
                    let i = 0;

                    while (i < packageDoc.coursePackageCourses.length) {
                        // Get current course details
                        const courseId = packageDoc.coursePackageCourses[i];
                        const course =
                            typeof courseId === "object"
                                ? courseId
                                : await import(
                                    "../models/Course.js"
                                ).default.findById(courseId);
                        const extentWeeks =
                            parseFloat(course.courseExtent) || 5; // Use parseFloat to handle 2.5

                        // Check if this course has 2.5 extent and if there's a next course
                        let shouldGroup = false;
                        let nextCourse = null;
                        let nextExtentWeeks = 0;

                        if (
                            extentWeeks === 2.5 &&
                            i + 1 < packageDoc.coursePackageCourses.length
                        ) {
                            const nextCourseId =
                                packageDoc.coursePackageCourses[i + 1];
                            nextCourse =
                                typeof nextCourseId === "object"
                                    ? nextCourseId
                                    : await import(
                                        "../models/Course.js"
                                    ).default.findById(nextCourseId);
                            nextExtentWeeks =
                                parseFloat(nextCourse.courseExtent) || 5;

                            if (nextExtentWeeks === 2.5) {
                                shouldGroup = true;
                                logger.debug({ courseName: course.courseName, nextCourseName: nextCourse.courseName }, "Grouping courses");
                            }
                        }

                        // Calculate course end date
                        let courseEnd;
                        if (shouldGroup) {
                            // For grouped courses, use combined extent (5 weeks total)
                            courseEnd = this.addWeeks(courseStart, 5);
                        } else {
                            courseEnd = this.addWeeks(courseStart, extentWeeks);
                        }

                        // Process current course - use student's teacher as responsibleTeacher
                        const { instance: courseInstance, wasCreated } =
                            await this.findOrCreateCourseInstance(
                                course._id,
                                courseStart,
                                courseEnd,
                                userId,
                                packageResponsibleTeacherId
                            );
                        logger.debug({ responsibleTeacher: courseInstance?.responsibleTeacher || "none", studentTeacherId: packageResponsibleTeacherId || "none" }, "CoursePackage course instance responsibleTeacher");
                        logger.debug({ courseName: course.courseName, courseInstanceId: courseInstance ? courseInstance._id : null }, "Processing course, Found/created CourseInstance");
                        if (!courseInstance || !courseInstance._id) {
                            logger.warn({ courseName: course.courseName }, "No CourseInstance found/created for course. Skipping enrollment");
                            i++;
                            continue;
                        }

                        // Add this check before creating a new StudentEnrollment
                        const existingEnrollment =
                            await StudentEnrollment.findOne({
                                studentId,
                                courseInstanceId: courseInstance._id,
                                mainCourseId: course._id,
                                startDate: courseStart,
                                endDate: courseEnd,
                            });
                        if (existingEnrollment) {
                            logger.debug({ studentId, courseId: course._id, startDate: courseStart, endDate: courseEnd }, "Skipping duplicate enrollment");
                            i++;
                            continue;
                        }

                        // Get student to find teacherId
                        let studentDocB;
                        if (!global._StudentModel) {
                            const studentDocImport = await import(
                                "../models/Student.js"
                            );
                            global._StudentModel = studentDocImport.default;
                        }
                        studentDocB = await global._StudentModel.findById(
                            studentId
                        );

                        // Create enrollment for current course
                        const enrollment = new StudentEnrollment({
                            studentId,
                            courseInstanceId: courseInstance._id,
                            mainCourseId: course._id,
                            coursePackageId: packageDoc._id,
                            startDate: courseStart,
                            endDate: courseEnd,
                            status: "enrolled",
                            teacherId:
                                studentDocB?.teacherId ||
                                entry.teacherId ||
                                null,
                            notes: entry.notes || null,
                            needsSupport: options.needsSupport,
                            examMode: options.examMode,
                            needsSupport: options.needsSupport || false,
                            examMode: options.examMode || 'on-site',
                        });
                        logger.debug({ teacherId: enrollment.teacherId || "null", studentDocTeacherId: studentDocB?.teacherId || "null", entryTeacherId: entry.teacherId || "null" }, "Creating enrollment");
                        logger.debug({ enrollment: enrollment.toObject() }, "StudentEnrollment to be created");
                        await enrollment.save();

                        // Calculate slutprov date - for grouped courses, use the same date for both
                        let slutprovDate;
                        if (entry.slutprovDate) {
                            slutprovDate = new Date(entry.slutprovDate);
                            logger.debug({ slutprovDate: slutprovDate.toDateString() }, "Using provided slutprov date");
                        } else {
                            slutprovDate = this.getWednesdayOfWeek(
                                courseStart,
                                4
                            );
                            logger.debug({ slutprovDate: slutprovDate.toDateString() }, "Calculated slutprov date (Wednesday week 4)");
                        }

                        // Validate the slutprov date
                        if (isNaN(slutprovDate.getTime())) {
                        logger.error({ slutprovDate: entry.slutprovDate || "calculated" }, "Invalid slutprov date for individual course");
                            i++;
                            continue;
                        }

                        enrollment.slutprovDate = slutprovDate;
                        await enrollment.save();

                        // Attach student email for frontend display (AFTER slutprovDate is set)
                        if (enrollment.courseInstanceId) {
                            results.enrollments.push({
                                ...enrollment.toObject(),
                                studentEmail: studentDocB?.email || "",
                                courseInstanceName:
                                    courseInstance.courseName || "",
                            });
                            logger.info({ studentId, courseName: course.courseName, courseInstanceId: courseInstance._id }, "Created enrollment for student in course");
                        } else {
                            logger.warn({ enrollment: enrollment.toObject() }, "Skipping enrollment with missing courseInstanceId");
                        }

                        logger.debug({ studentId, courseName: course.courseName, slutprovDate: slutprovDate.toDateString() }, "Slutprov date set for student in course");

                        // Add to education array
                        let studentDocC;
                        if (!global._StudentModel) {
                            const studentDocImport = await import(
                                "../models/Student.js"
                            );
                            global._StudentModel = studentDocImport.default;
                        }
                        studentDocC = await global._StudentModel.findById(
                            studentId
                        );

                        if (studentDocC) {
                            if (!Array.isArray(studentDocC.education)) {
                                studentDocC.education = [];
                            }
                            const exists = (studentDocC.education || []).some(
                                (e) =>
                                    e.type === "Course" &&
                                    e.refId &&
                                    e.refId.toString() ===
                                    course._id.toString() &&
                                    new Date(e.startDate).getTime() ===
                                    courseStart.getTime() &&
                                    new Date(e.endDate).getTime() ===
                                    courseEnd.getTime()
                            );
                            if (!exists) {
                                studentDocC.education.push({
                                    type: "Course",
                                    refId: course._id,
                                    name: course.courseName,
                                    startDate: courseStart,
                                    endDate: courseEnd,
                                    grade: null,
                                    addedAt: new Date(),
                                    addedBy: userId,
                                    removedAt: null,
                                });
                                await studentDocC.save();
                            }
                        }

                        // If we're grouping courses, process the next course as well
                        if (shouldGroup && nextCourse) {
                            logger.debug({ courseName: nextCourse.courseName }, "Processing grouped course");

                            // Create CourseInstance for next course (same dates as current course)
                            // Use student's teacher as responsibleTeacher
                            const {
                                instance: nextCourseInstance,
                                wasCreated: nextWasCreated,
                            } = await this.findOrCreateCourseInstance(
                                nextCourse._id,
                                courseStart,
                                courseEnd,
                                userId,
                                packageResponsibleTeacherId
                            );

                            if (nextCourseInstance && nextCourseInstance._id) {
                                // Add this check before creating a new StudentEnrollment
                                const existingEnrollment =
                                    await StudentEnrollment.findOne({
                                        studentId,
                                        courseInstanceId:
                                            nextCourseInstance._id,
                                        mainCourseId: nextCourse._id,
                                        startDate: courseStart,
                                        endDate: courseEnd,
                                    });
                                if (existingEnrollment) {
                                    logger.debug({ studentId, courseId: nextCourse._id, startDate: courseStart, endDate: courseEnd }, "Skipping duplicate enrollment for grouped course");
                                    i += 2;
                                    continue;
                                }

                                // Create enrollment for next course
                                const nextEnrollment = new StudentEnrollment({
                                    studentId,
                                    courseInstanceId: nextCourseInstance._id,
                                    mainCourseId: nextCourse._id,
                                    coursePackageId: packageDoc._id,
                                    startDate: courseStart,
                                    endDate: courseEnd,
                                    status: "enrolled",
                                    teacherId:
                                        studentDocB?.teacherId ||
                                        entry.teacherId ||
                                        null,
                                    notes: entry.notes || null,
                                    needsSupport: options.needsSupport,
                                    examMode: options.examMode,
                                });

                                await nextEnrollment.save();

                                // Use the same slutprov date for the grouped course
                                nextEnrollment.slutprovDate = slutprovDate;
                                await nextEnrollment.save();

                                logger.info({ studentId, courseName: nextCourse.courseName, courseInstanceId: nextCourseInstance._id }, "Created grouped enrollment for student");
                                logger.debug({ courseName: nextCourse.courseName, slutprovDate: slutprovDate.toDateString() }, "Same slutprov date for grouped course");

                                // Add to results
                                results.enrollments.push({
                                    ...nextEnrollment.toObject(),
                                    studentEmail: studentDocB?.email || "",
                                    courseInstanceName:
                                        nextCourseInstance.courseName || "",
                                });

                                // Add to education array
                                if (studentDocC) {
                                    const nextExists = (
                                        studentDocC.education || []
                                    ).some(
                                        (e) =>
                                            e.type === "Course" &&
                                            e.refId &&
                                            e.refId.toString() ===
                                            nextCourse._id.toString() &&
                                            new Date(e.startDate).getTime() ===
                                            courseStart.getTime() &&
                                            new Date(e.endDate).getTime() ===
                                            courseEnd.getTime()
                                    );
                                    if (!nextExists) {
                                        studentDocC.education.push({
                                            type: "Course",
                                            refId: nextCourse._id,
                                            name: nextCourse.courseName,
                                            startDate: courseStart,
                                            endDate: courseEnd,
                                            grade: null,
                                            addedAt: new Date(),
                                            addedBy: userId,
                                            removedAt: null,
                                        });
                                        await studentDocC.save();
                                    }
                                }
                            }

                            // Skip the next course in the next iteration since we've already processed it
                            i += 2;
                        } else {
                            // Move to next course
                            i++;
                        }

                        // Prepare for next course (or next group)
                        courseStart = this.getNextMonday(courseEnd);
                    }

                    // Add CoursePackage entry to student's education array for APL filtering
                    let studentDocD;
                    if (!global._StudentModel) {
                        const studentDocImport = await import(
                            "../models/Student.js"
                        );
                        global._StudentModel = studentDocImport.default;
                    }
                    studentDocD = await global._StudentModel.findById(
                        studentId
                    );
                    if (studentDocD) {
                        if (!Array.isArray(studentDocD.education)) {
                            studentDocD.education = [];
                        }
                        const exists = (studentDocD.education || []).some(
                            (e) =>
                                e.type === "CoursePackage" &&
                                e.refId &&
                                e.refId.toString() ===
                                packageDoc._id.toString() &&
                                new Date(e.startDate).getTime() ===
                                new Date(entry.startDate).getTime() &&
                                new Date(e.endDate).getTime() ===
                                new Date(entry.endDate).getTime()
                        );
                        if (!exists) {
                            const packageStartDate = entry.startDate
                                ? new Date(entry.startDate)
                                : undefined;
                            const packageEndDate = entry.endDate
                                ? new Date(entry.endDate)
                                : undefined;

                            logger.debug({ packageName: packageDoc.coursePackageName, startDate: entry.startDate, parsedStartDate: packageStartDate, endDate: entry.endDate, parsedEndDate: packageEndDate }, "Creating CoursePackage education entry");

                            studentDocD.education.push({
                                type: "CoursePackage",
                                refId: packageDoc._id,
                                name: packageDoc.coursePackageName,
                                startDate: packageStartDate,
                                endDate: packageEndDate,
                                grade: null,
                                addedAt: new Date(),
                                addedBy: userId,
                                removedAt: null,
                            });
                            await studentDocD.save();
                            // Surface a non-blocking note so the uploader can see that a package was added
                            const studentName = studentDocD?.name || studentDocD?.email || "Okänd elev";
                            results.warnings.push({
                                type: "package_added",
                                packageName: packageDoc.coursePackageName,
                                studentId,
                                studentName,
                                message: `Kurspaket "${packageDoc.coursePackageName}" har lagts till för elev ${studentName}. Paketet innehåller ${packageDoc.coursePackageCourses?.length || 0} kurser som kommer att skapas automatiskt.`,
                            });
                            logger.info({ studentName: studentDocD.name || studentDocD.email, packageName: packageDoc.coursePackageName }, "Added CoursePackage education entry for student");
                        }
                    }

                    // Skipping package-level StudentEnrollment creation because schema requires courseInstanceId.
                    // APL visibility is handled by adding the CoursePackage to student.education and merging in /api/students.
                    // Add to education array if not already present
                    // if (studentDocD) {
                    //     const exists = (studentDocD.education || []).some(e =>
                    //         e.type === 'CoursePackage' &&
                    //         e.refId && e.refId.toString() === entry.refId.toString()
                    //     );
                    //     if (!exists) {
                    //         studentDocD.education.push({
                    //             type: 'CoursePackage',
                    //             refId: entry.refId,
                    //             name: packageDoc.coursePackageName,
                    //             startDate: entry.startDate ? new Date(entry.startDate) : undefined,
                    //             endDate: entry.endDate ? new Date(entry.endDate) : undefined,
                    //             grade: null,
                    //             addedAt: new Date(),
                    //             addedBy: userId,
                    //             removedAt: null,
                    //         });
                    //         await studentDocD.save();
                    //     }
                    // }
                } else if (entry.type === "Course" && entry.name) {
                    logger.debug({ entryName: entry.name }, "Processing individual course");

                    // Find the best matching course
                    const courseMatch = await this.findBestCourseMatch(
                        entry.name
                    );
                    if (!courseMatch) {
                        results.warnings.push({
                            type: "no_match",
                            courseName: entry.name,
                            studentId: studentId,
                            message: `Ingen matchande kurs hittades för "${entry.name}". Kursen kommer inte att skapas automatiskt.`,
                        });
                        continue;
                    }

                    const course = courseMatch.course;
                    logger.debug({ entryName: entry.name, courseName: course.courseName }, "Matched individual course");

                    // Calculate course dates
                    const courseStart = entry.startDate
                        ? new Date(entry.startDate)
                        : this.getNextMonday(new Date());
                    const extentWeeks = parseInt(course.courseExtent) || 5; // Default to 5 weeks if not set
                    const courseEnd = this.addWeeks(courseStart, extentWeeks);

                    // Get student to find teacherId for course instance
                    let studentDocIndividual;
                    if (!global._StudentModel) {
                        const studentDocImport = await import(
                            "../models/Student.js"
                        );
                        global._StudentModel = studentDocImport.default;
                    }
                    studentDocIndividual = await global._StudentModel.findById(
                        studentId
                    );
                    
                    // Use student's teacherId as responsibleTeacher for course instance
                    const individualResponsibleTeacherId = studentDocIndividual?.teacherId || entry.teacherId || null;

                    // Find or create CourseInstance - use student's teacher as responsibleTeacher
                    const { instance: courseInstance, wasCreated } =
                        await this.findOrCreateCourseInstance(
                            course._id,
                            courseStart,
                            courseEnd,
                            userId,
                            individualResponsibleTeacherId
                        );
                    logger.debug({ responsibleTeacher: courseInstance?.responsibleTeacher || "none", studentTeacherId: individualResponsibleTeacherId || "none" }, "Individual course instance responsibleTeacher");

                    logger.debug({ courseName: course.courseName, courseInstanceId: courseInstance ? courseInstance._id : null }, "Processing individual course, Found/created CourseInstance");
                    if (!courseInstance || !courseInstance._id) {
                        logger.warn({ courseName: course.courseName }, "No CourseInstance found/created for individual course. Skipping enrollment");
                        continue;
                    }

                    // Add this check before creating a new StudentEnrollment
                    const existingEnrollment = await StudentEnrollment.findOne({
                        studentId,
                        courseInstanceId: courseInstance._id,
                        mainCourseId: course._id,
                        startDate: courseStart,
                        endDate: courseEnd,
                    });
                    if (existingEnrollment) {
                        logger.debug({ studentId, courseId: course._id, startDate: courseStart, endDate: courseEnd }, "Skipping duplicate enrollment for individual course");
                        continue;
                    }

                    // Get student to find teacherId
                    let studentDoc;
                    if (!global._StudentModel) {
                        const studentDocImport = await import(
                            "../models/Student.js"
                        );
                        global._StudentModel = studentDocImport.default;
                    }
                    studentDoc = await global._StudentModel.findById(studentId);

                    // Create enrollment
                    const enrollment = new StudentEnrollment({
                        studentId,
                        courseInstanceId: courseInstance._id,
                        mainCourseId: course._id,
                        startDate: courseStart,
                        endDate: courseEnd,
                        status: "enrolled",
                        teacherId:
                            studentDoc?.teacherId || entry.teacherId || null,
                        notes: entry.notes || null,
                        needsSupport: options.needsSupport,
                        examMode: options.examMode,
                    });

                    logger.debug({ enrollment: enrollment.toObject() }, "Individual course StudentEnrollment to be created");
                    await enrollment.save();

                    // Calculate and set slutprov date BEFORE adding to results
                    let slutprovDate;
                    if (entry.slutprovDate) {
                        slutprovDate = new Date(entry.slutprovDate);
                        logger.debug({ slutprovDate: slutprovDate.toDateString() }, "Using provided slutprov date for individual course");
                    } else {
                        slutprovDate = this.getWednesdayOfWeek(courseStart, 4);
                        logger.debug({ slutprovDate: slutprovDate.toDateString() }, "Calculated slutprov date for individual course (Wednesday week 4)");
                    }

                    // Validate the slutprov date
                    if (isNaN(slutprovDate.getTime())) {
                        logger.error({ slutprovDate: entry.slutprovDate || "calculated" }, "Invalid slutprov date for individual course");
                        continue;
                    }

                    enrollment.slutprovDate = slutprovDate;
                    await enrollment.save(); // Save the updated enrollment with slutprovDate

                    // Attach student email for frontend display (AFTER slutprovDate is set)
                    // studentDoc is already loaded above
                    if (enrollment.courseInstanceId) {
                        results.enrollments.push({
                            ...enrollment.toObject(),
                            studentEmail: studentDoc?.email || "",
                            courseInstanceName: courseInstance.courseName || "",
                        });
                        logger.info({ studentId, courseName: course.courseName, courseInstanceId: courseInstance._id }, "Created enrollment for student in individual course");
                    } else {
                        logger.warn({ enrollment: enrollment.toObject() }, "Skipping individual course enrollment with missing courseInstanceId");
                    }

                    // Note: Calendar events are now generated automatically by the /calendar-events/syncable endpoint
                    // based on StudentEnrollment.slutprovDate, so we don't need to create them here
                    logger.debug({ studentId, courseName: course.courseName, slutprovDate: slutprovDate.toDateString() }, "Slutprov date set for student in individual course");

                    // Add to education array if not already present
                    if (studentDoc) {
                        const exists = (studentDoc.education || []).some(
                            (e) =>
                                e.type === "Course" &&
                                e.refId &&
                                e.refId.toString() === course._id.toString() &&
                                new Date(e.startDate).getTime() ===
                                courseStart.getTime() &&
                                new Date(e.endDate).getTime() ===
                                courseEnd.getTime()
                        );
                        if (!exists) {
                            studentDoc.education.push({
                                type: "Course",
                                refId: course._id,
                                name: course.courseName,
                                startDate: courseStart,
                                endDate: courseEnd,
                                grade: null,
                                addedAt: new Date(),
                                addedBy: userId,
                                removedAt: null,
                            });
                            await studentDoc.save();
                            logger.info({ studentName: studentDoc.name || studentDoc.email, courseName: course.courseName }, "Added individual course education entry for student");
                        }
                    }
                } else if (entry.type === "Program" && entry.refId) {
                    // Add to student's education array if not already present
                    let studentDocE;
                    if (!global._StudentModel) {
                        const studentDocImport = await import(
                            "../models/Student.js"
                        );
                        global._StudentModel = studentDocImport.default;
                    }
                    studentDocE = await global._StudentModel.findById(
                        studentId
                    );
                    // Create enrollment for CoursePackage or Program
                    const programEnrollment = new StudentEnrollment({
                        studentId,
                        programId: entry.refId,
                        startDate: entry.startDate
                            ? new Date(entry.startDate)
                            : undefined,
                        endDate: entry.endDate
                            ? new Date(entry.endDate)
                            : undefined,
                        status: "enrolled",
                        teacherId: entry.teacherId || null,
                        notes: entry.notes || null,
                        needsSupport: options.needsSupport,
                        examMode: options.examMode,
                    });
                    await programEnrollment.save();
                    results.enrollments.push({
                        ...programEnrollment.toObject(),
                        studentEmail: studentDocE?.email || "",
                        courseInstanceName: undefined,
                    });
                    // Add to education array if not already present
                    if (studentDocE) {
                        const exists = (studentDocE.education || []).some(
                            (e) =>
                                e.type === "Program" &&
                                e.refId &&
                                e.refId.toString() === entry.refId.toString()
                        );
                        if (!exists) {
                            studentDocE.education.push({
                                type: "Program",
                                refId: entry.refId,
                                name: entry.name,
                                startDate: entry.startDate
                                    ? new Date(entry.startDate)
                                    : undefined,
                                endDate: entry.endDate
                                    ? new Date(entry.endDate)
                                    : undefined,
                                grade: null,
                                addedAt: new Date(),
                                addedBy: userId,
                                removedAt: null,
                            });
                            await studentDocE.save();
                        }
                    }
                }
            } catch (error) {
                results.errors.push({
                    type: "processing_error",
                    courseName: entry.name,
                    message: error.message,
                });
                logger.error({ err: error, studentId }, "Error processing education entry for student");
            }
        }

        logger.debug({ educationCount: educationEntries.length, studentId, enrollmentCount: results.enrollments.length }, "Finished processing education entries for student");

        // Before returning, filter out any enrollments with missing courseInstanceId
        results.enrollments = results.enrollments.filter((enrollment) => {
            if (!enrollment.courseInstanceId) {
                logger.warn({ enrollment }, "Filtering out enrollment with missing courseInstanceId");
                return false;
            }
            return true;
        });

        return results;
    }
}

export default CourseMatchingService;
