import express from "express";
import mongoose from "mongoose";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";
import logger from "../utils/logger.js";

const router = express.Router();

/**
 * POST /placement/preview
 * Dry-run: calculates dates, slutprov, exam mode without writing to DB.
 * Used by the frontend wizard to show a preview before submitting.
 */
router.post(
    "/placement/preview",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    asyncHandler(async (req, res) => {
        const {
            studentId,
            type,
            courseId,
            courseCode,
            startDate,
            durationWeeks,
            packageId,
            excludeCourseIds = [],
            pace,
            examMode,
            municipality,
        } = req.body;

        if (!studentId) {
            return res.status(400).json({ error: "studentId is required" });
        }

        if (!type || !["course", "package"].includes(type)) {
            return res.status(400).json({ error: "type must be 'course' or 'package'" });
        }

        if (!startDate) {
            return res.status(400).json({ error: "startDate is required" });
        }

        // Dynamically import models
        const { default: Student } = await import("../models/Student.js");
        const { default: Course } = await import("../models/Course.js");
        const { default: CoursePackage } = await import("../models/CoursePackage.js");
        const { default: Teacher } = await import("../models/Teacher.js");
        const { calculateSlutprovDate } = await import("../utils/slutprovDateCalculator.js");
        const { default: CourseMatchingService } = await import("../utils/courseMatchingService.js");

        // Load student for municipality / teacher
        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const resolvedMunicipality = municipality || student.municipality?.type || "";
        const resolvedExamMode =
            examMode || CourseMatchingService.getDefaultExamMode(resolvedMunicipality);

        // Helper: next Monday
        const getNextMonday = (d) => {
            const date = new Date(d);
            const day = date.getDay();
            const diff = day === 1 ? 0 : (8 - day) % 7;
            date.setDate(date.getDate() + diff);
            date.setHours(0, 0, 0, 0);
            return date;
        };

        // Helper: add weeks
        const addWeeks = (d, weeks) => {
            const date = new Date(d);
            date.setDate(date.getDate() + weeks * 7);
            return date;
        };

        // Helper: resolve teacher name for slutprov calculation
        const getTeacherName = async (teacherId) => {
            if (!teacherId) return null;
            try {
                const teacher = await Teacher.findById(teacherId).populate("userId", "username");
                return teacher?.userId?.username || null;
            } catch {
                return null;
            }
        };

        const results = [];

        if (type === "course") {
            // Individual course placement preview
            let course;
            if (courseId) {
                course = await Course.findById(courseId);
            } else if (courseCode) {
                const match = await CourseMatchingService.findBestCourseMatch(courseCode);
                course = match?.course;
            }

            if (!course) {
                return res.status(404).json({ error: "Course not found" });
            }

            const weeks = Number(durationWeeks) || Number(course.courseExtent) || 5;
            const courseStart = getNextMonday(new Date(startDate));
            const courseEnd = addWeeks(courseStart, weeks);

            // Calculate slutprov date via teacher rules
            const teacherName = await getTeacherName(student.teacherId);
            let slutprovDate = null;
            if (teacherName) {
                slutprovDate = await calculateSlutprovDate(
                    { userId: { username: teacherName } },
                    courseEnd
                );
            }
            // Fallback: Wednesday week 4
            if (!slutprovDate) {
                slutprovDate = new Date(courseStart);
                slutprovDate.setDate(slutprovDate.getDate() + 3 * 7 + ((3 - slutprovDate.getDay() + 7) % 7));
                slutprovDate.setHours(0, 0, 0, 0);
            }

            results.push({
                courseId: course._id,
                courseName: course.courseName,
                courseCode: course.courseCode,
                startDate: courseStart,
                endDate: courseEnd,
                slutprovDate,
                examMode: resolvedExamMode,
                weeks,
            });
        } else if (type === "package") {
            // Course package placement preview
            const packageDoc = await CoursePackage.findById(packageId).populate("coursePackageCourses");
            if (!packageDoc) {
                return res.status(404).json({ error: "Course package not found" });
            }

            const excludedSet = new Set(excludeCourseIds.map(String));
            const packageCourses = (packageDoc.coursePackageCourses || []).filter(
                (course) => !excludedSet.has(String(course._id))
            );

            let courseStart = getNextMonday(new Date(startDate));
            let i = 0;

            while (i < packageCourses.length) {
                const course = packageCourses[i];
                const extentWeeks = parseFloat(course.courseExtent) || 5;

                // Check grouping (2.5 + 2.5 = 5)
                let shouldGroup = false;
                let nextCourse = null;
                let nextExtentWeeks = 0;

                if (extentWeeks === 2.5 && i + 1 < packageCourses.length) {
                    nextCourse = packageCourses[i + 1];
                    nextExtentWeeks = parseFloat(nextCourse.courseExtent) || 5;
                    if (nextExtentWeeks === 2.5) {
                        shouldGroup = true;
                    }
                }

                const courseEnd = shouldGroup ? addWeeks(courseStart, 5) : addWeeks(courseStart, extentWeeks);

                // Calculate slutprov
                const teacherName = await getTeacherName(student.teacherId);
                let slutprovDate = null;
                if (teacherName) {
                    slutprovDate = await calculateSlutprovDate(
                        { userId: { username: teacherName } },
                        courseEnd
                    );
                }
                if (!slutprovDate) {
                    slutprovDate = new Date(courseStart);
                    slutprovDate.setDate(slutprovDate.getDate() + 3 * 7 + ((3 - slutprovDate.getDay() + 7) % 7));
                    slutprovDate.setHours(0, 0, 0, 0);
                }

                results.push({
                    courseId: course._id,
                    courseName: course.courseName,
                    courseCode: course.courseCode,
                    startDate: new Date(courseStart),
                    endDate: new Date(courseEnd),
                    slutprovDate,
                    examMode: resolvedExamMode,
                    weeks: shouldGroup ? 5 : extentWeeks,
                    grouped: shouldGroup,
                });

                if (shouldGroup && nextCourse) {
                    // Same dates for grouped course
                    results.push({
                        courseId: nextCourse._id,
                        courseName: nextCourse.courseName,
                        courseCode: nextCourse.courseCode,
                        startDate: new Date(courseStart),
                        endDate: new Date(courseEnd),
                        slutprovDate,
                        examMode: resolvedExamMode,
                        weeks: 5,
                        grouped: true,
                        groupedWith: course._id,
                    });
                    i += 2;
                } else {
                    i++;
                }

                courseStart = getNextMonday(courseEnd);
            }
        }

        res.json({
            courses: results,
            totalWeeks: results.length > 0
                ? Math.round(
                      (new Date(results[results.length - 1].endDate) -
                          new Date(results[0].startDate)) /
                          (7 * 24 * 60 * 60 * 1000)
                  )
                : 0,
            studentName: student.name,
            municipality: resolvedMunicipality,
            examMode: resolvedExamMode,
        });
    })
);

/**
 * POST /enrollments/:enrollmentId/exam-config
 * Update exam configuration on a specific enrollment.
 */
router.put(
    "/enrollment-exam-config/:enrollmentId",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    asyncHandler(async (req, res) => {
        const { enrollmentId } = req.params;
        const { examMode, examMunicipality, examLocation, examTime } = req.body;

        const { default: StudentEnrollment } = await import("../models/StudentEnrollment.js");
        const { default: Student } = await import("../models/Student.js");

        const enrollment = await StudentEnrollment.findById(enrollmentId);
        if (!enrollment) {
            return res.status(404).json({ error: "Enrollment not found" });
        }

        // Update enrollment fields
        if (examMode !== undefined) enrollment.examMode = examMode;
        if (examMunicipality !== undefined) enrollment.examMunicipality = examMunicipality;
        if (examLocation !== undefined) enrollment.examLocation = examLocation;
        if (examTime !== undefined) enrollment.examTime = examTime;

        await enrollment.save();

        // Also update the student-level municipality if provided
        if (examMunicipality !== undefined) {
            const student = await Student.findById(enrollment.studentId);
            if (student) {
                if (!student.municipality) student.municipality = {};
                student.municipality.type = examMunicipality;
                await student.save();
            }
        }

        logger.info(
            { enrollmentId, examMode, examMunicipality, examLocation, examTime },
            "Updated exam config for enrollment"
        );

        res.json({ enrollment });
    })
);

/**
 * GET /enrollments/:enrollmentId/certificate
 * Get certificate info for an enrollment.
 */
router.get(
    "/enrollments/:enrollmentId/certificate",
    isAuthenticated,
    asyncHandler(async (req, res) => {
        const { enrollmentId } = req.params;

        const { default: StudentEnrollment } = await import("../models/StudentEnrollment.js");
        const { default: Document } = await import("../models/Document.js");

        const enrollment = await StudentEnrollment.findById(enrollmentId);
        if (!enrollment) {
            return res.status(404).json({ error: "Enrollment not found" });
        }

        // Look for certificate document
        let doc = null;
        if (enrollment.certificateDocId) {
            doc = await Document.findById(enrollment.certificateDocId);
        }
        // Fallback: look for any COURSE_ARCHIVE document linked to this enrollment
        if (!doc) {
            doc = await Document.findOne({
                enrollmentId: enrollment._id,
                type: "COURSE_ARCHIVE",
            });
        }

        if (!doc) {
            return res.json({ certificate: null });
        }

        res.json({
            certificate: {
                _id: doc._id,
                filename: doc.filename,
                originalName: doc.originalName,
                createdAt: doc.createdAt,
            },
        });
    })
);

export default router;
