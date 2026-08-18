import mongoose from "mongoose";
import CourseInstance from "../models/CourseInstance.js";
import TeacherScheduleParameters from "../models/TeacherScheduleParameters.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import User from "../models/User.js";

/**
 * Calculate activity status for a student in a course instance.
 * Statuses: on schedule, behind, completed
 * 
 * @param {Object} params
 * @param {string} params.studentId - Student ID
 * @param {string} params.courseInstanceId - Course instance ID
 * @returns {Object} Activity status result
 */
export const calculateActivityStatus = async (params) => {
    try {
        const { studentId, courseInstanceId } = params;

        if (!mongoose.isValidObjectId(studentId) || !mongoose.isValidObjectId(courseInstanceId)) {
            return { error: "Invalid IDs" };
        }

        // Find the course instance
        const instance = await CourseInstance.findById(courseInstanceId);
        if (!instance) {
            return { error: "Course instance not found" };
        }

        // Find the student's enrollment for this instance
        const enrollment = await StudentEnrollment.findOne({
            studentId,
            courseInstanceId,
        }).populate("studentId", "name personalNumber");

        if (!enrollment) {
            return { error: "Student not enrolled in this course instance" };
        }

        // Get module information from the instance
        const modules = instance.modules || [];

        // Get teacher schedule parameters for section offsets
        let sectionOffsets = [];
        try {
            const tp = await TeacherScheduleParameters.findOne({
                teacherId: instance.responsibleTeacher,
                courseId: instance.mainCourseId,
                lengthWeeks: instance.version ? parseInt(instance.version.split(".")[0]) : 5,
            });
            if (tp && tp.sectionOffsets && tp.sectionOffsets.length > 0) {
                sectionOffsets = tp.sectionOffsets;
            }
        } catch (e) {
            // Teacher schedule parameters not found, will use defaults
        }

        // Use defaults if no saved parameters
        if (sectionOffsets.length === 0) {
            const lengthWeeks = instance.modules ? instance.modules.length : 5;
            const defaults = {
                5: [0, 1, 2, 3, 4],
                10: [0, 2, 4, 6, 8],
                20: [0, 4, 8, 12, 16],
            };
            sectionOffsets = defaults[lengthWeeks] || [0, 1, 2, 3, 4];
        }

        // Calculate section dates based on course start date
        const courseStart = new Date(instance.startDate);
        const sectionDates = sectionOffsets.map(offsetWeeks => {
            const date = new Date(courseStart);
            date.setDate(date.getDate() + offsetWeeks * 7);
            return date;
        });

        // Compute completion status from enrollment
        let completedComponents = {};
        let totalModules = modules.length;
        let completedModules = 0;

        if (enrollment.completedComponents) {
            completedComponents = Object.fromEntries(enrollment.completedComponents);
            completedModules = Object.values(completedComponents).filter(
                c => c === "✓"
            ).length;
        }

        // Calculate days since course start
        const now = new Date();
        const courseStartMs = courseStart.getTime();
        const totalCourseMs = instance.endDate ? new Date(instance.endDate).getTime() - courseStartMs : null;
        const daysSinceStart = totalCourseMs ? Math.floor((now - courseStartMs) / 86400000) : null;
        const daysUntilEnd = totalCourseMs ? Math.floor((instance.endDate - now) / 86400000) : null;

        // Determine status for each module
        const moduleStatuses = [];
        let overallStatus = "on schedule"; // on schedule, behind, completed

        for (let i = 0; i < modules.length; i++) {
            const module = modules[i];
            const moduleNumber = module.moduleNumber;
            const sectionDate = sectionDates[i] || null;
            const isCompleted = completedComponents[moduleNumber] === "✓";

            // Check if module is behind schedule
            // A module is "behind" if:
            // 1. The section date has passed (sectionDate < now)
            // 2. The module is not completed
            const sectionDatePassed = sectionDate && new Date(sectionDate) < now;
            const moduleBehind = !isCompleted && sectionDatePassed;

            moduleStatuses.push({
                moduleNumber,
                title: module.title,
                isPartialExam: module.isPartialExam || false,
                isCaseStudy: module.isCaseStudy || false,
                completed: isCompleted,
                behind: moduleBehind,
                sectionDate: sectionDate ? sectionDate.toISOString().split("T")[0] : null,
                daysUntilSectionDate: sectionDate ? Math.floor((new Date(sectionDate) - now) / 86400000) : null,
            });

            if (moduleBehind) {
                overallStatus = "behind";
            }
        }

        // Check if all modules are completed
        if (completedModules >= totalModules && moduleStatuses.every(m => m.completed)) {
            overallStatus = "completed";
        }

        // If some modules are behind, status is "behind"
        // Otherwise "on schedule"

        // Get student's last activity
        let lastActivity = null;
        let daysSinceLastActivity = 0;

        // Check user last login
        const user = await User.findById(enrollment.studentId._id).select("lastLoginAt");
        if (user && user.lastLoginAt) {
            daysSinceLastActivity = Math.floor((now - user.lastLoginAt) / 86400000);
            lastActivity = {
                type: "login",
                date: user.lastLoginAt,
                daysAgo: daysSinceLastActivity,
            };
        }

        // Check last submission
        if (!lastActivity) {
            const lastSub = await AssignmentSubmission.findOne({
                studentId: enrollment.studentId._id,
                enrollmentId: enrollment._id,
            }).sort({ submittedAt: -1 });
            if (lastSub && lastSub.submittedAt) {
                daysSinceLastActivity = Math.floor((now - lastSub.submittedAt) / 86400000);
                // Only update if we don't have a login-based activity yet, or if submission is more recent
                if (!lastActivity || daysSinceLastActivity < (lastActivity.daysAgo || 999)) {
                    lastActivity = {
                        type: "submission",
                        date: lastSub.submittedAt,
                        daysAgo: daysSinceLastActivity,
                    };
                }
            }
        }

        return {
            success: true,
            studentId,
            courseInstanceId,
            instanceName: instance.courseName,
            totalModules,
            completedModules,
            completionRate: totalModules > 0 ? (completedModules / totalModules * 100).toFixed(1) : 0,
            overallStatus, // "on schedule", "behind", or "completed"
            moduleStatuses,
            sectionDates: sectionDates.map(d => d.toISOString().split("T")[0]),
            studentActivity: {
                lastActivity,
                daysSinceLastActivity,
            },
            courseTimeline: {
                courseStart: courseStart.toISOString().split("T")[0],
                courseEnd: instance.endDate ? instance.endDate.toISOString().split("T")[0] : null,
                daysSinceStart,
                daysUntilEnd,
            },
        };
    } catch (error) {
        logger.error({ err: error, studentId, courseInstanceId }, "Error calculating activity status");
        return { error: "Internal server error" };
    }
};

/**
 * Get activity status for multiple students in a course instance
 * @param {Object} params - courseInstanceId and optional studentIds
 * @returns {Object} Activity status for all or specified students
 */
export const calculateBatchActivityStatus = async (params) => {
    try {
        const { courseInstanceId, studentIds } = params;

        if (!mongoose.isValidObjectId(courseInstanceId)) {
            return { error: "Invalid course instance ID" };
        }

        const instance = await CourseInstance.findById(courseInstanceId);
        if (!instance) {
            return { error: "Course instance not found" };
        }

        // Get all enrollments for this instance
        const filter = { courseInstanceId };
        if (studentIds && studentIds.length > 0) {
            filter.studentId = { $in: studentIds };
        }

        const enrollments = await StudentEnrollment.find(filter)
            .populate("studentId", "name personalNumber")
            .lean();

        // Calculate status for each student
        const results = await Promise.all(
            enrollments.map(enrollment =>
                calculateActivityStatus({
                    studentId: enrollment.studentId._id,
                    courseInstanceId,
                })
            )
        );

        return {
            success: true,
            courseInstanceId,
            instanceName: instance.courseName,
            totalStudents: enrollments.length,
            activityResults: results,
        };
    } catch (error) {
        logger.error({ err: error, courseInstanceId }, "Error calculating batch activity status");
        return { error: "Internal server error" };
    }
};
