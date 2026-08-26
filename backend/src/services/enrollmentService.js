import mongoose from "mongoose";
import logger from "../utils/logger.js";
import { AppError } from "../utils/errorHandler.js";
import CourseMatchingService from "../utils/courseMatchingService.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import CourseInstance from "../models/CourseInstance.js";
import Course from "../models/Course.js";
import User from "../models/User.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";

export const VALID_ENROLLMENT_STATUSES = [
    "enrolled",
    "active",
    "completed",
    "dropped",
    "inactive",
    "suspended",
    "reviderad",
];

export const VALID_TEMPO_WEEKS = [5, 10, 20];

/**
 * Fetch a student's enrollments with the shared filter shape used by the
 * enrollments endpoints (status + date-range filters).
 */
export const fetchStudentEnrollments = async ({ studentId, status, startDate, endDate }) => {
    const query = { studentId };

    if (status) query.status = status;
    if (startDate || endDate) {
        query.$and = [];
        if (startDate) query.$and.push({ startDate: { $gte: new Date(startDate) } });
        if (endDate) query.$and.push({ endDate: { $lte: new Date(endDate) } });
    }

    return StudentEnrollment.find(query)
        .populate("courseInstanceId")
        .populate("mainCourseId")
        .populate("teacherId", "username email")
        .populate("gradeBy", "username email")
        .sort({ startDate: -1 });
};

/**
 * Build course cards for a student from their enrollments.
 * Cards are aggregated from StudentEnrollments grouped by CourseInstance
 * (which is unique per course + dates + responsible teacher), so the same
 * course over the same period shares a single card. Course content (modules)
 * comes from the course instance, which already holds the duplicated template
 * modules created at admission.
 */
export const buildCourseCards = async (studentId) => {
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

    // Attach lastAccess: most recent of lastLoginAt or last submission per student
    try {
        const studentIds = [...new Set(cards.map((c) => c.students?.map((s) => s._id)).flat().filter(Boolean))];
        if (studentIds.length > 0) {
            const users = await User.find({ _id: { $in: studentIds } }).select("lastLoginAt").lean();
            const loginById = new Map(users.map((u) => [u._id.toString(), u.lastLoginAt || null]));
            const lastSubs = await AssignmentSubmission.aggregate([
                { $match: { studentId: { $in: studentIds } } },
                { $sort: { submittedAt: -1 } },
                { $group: { _id: "$studentId", lastSubmittedAt: { $first: "$submittedAt" } } },
            ]);
            const subById = new Map(lastSubs.map((s) => [s._id.toString(), s.lastSubmittedAt]));
            for (const card of cards) {
                let latestAccess = null;
                for (const student of (card.students || [])) {
                    const sid = student._id?.toString();
                    if (!sid) continue;
                    const loginDate = loginById.get(sid);
                    const subDate = subById.get(sid);
                    const candidate = loginDate && subDate
                        ? (new Date(loginDate) > new Date(subDate) ? loginDate : subDate)
                        : loginDate || subDate || null;
                    if (candidate && (!latestAccess || new Date(candidate) > new Date(latestAccess))) {
                        latestAccess = candidate;
                    }
                }
                card.lastAccess = latestAccess;
            }
        }
    } catch (err) {
        logger.warn({ err }, "Failed to attach lastAccess to course cards");
    }

    return cards;
};

/**
 * Fetch all enrollments for a course instance (participant list). Attaches the
 * student's last login time (best-effort) from the linked user account.
 */
export const fetchCourseInstanceEnrollments = async ({ instanceId, status }) => {
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

    return enrollments;
};

/**
 * Update an enrollment's status, refresh course instance stats, and return the
 * reloaded enrollment. Throws AppError(404) when the enrollment is missing and
 * AppError(400) for unknown statuses (with the valid statuses attached).
 */
export const updateEnrollmentStatus = async ({ enrollmentId, status, reason, notes, userId }) => {
    const enrollment = await StudentEnrollment.findById(enrollmentId);
    if (!enrollment) {
        throw new AppError("Enrollment not found", 404);
    }

    if (!VALID_ENROLLMENT_STATUSES.includes(status)) {
        const error = new AppError("Invalid status", 400);
        error.validStatuses = VALID_ENROLLMENT_STATUSES;
        throw error;
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
    return StudentEnrollment.findById(enrollmentId)
        .populate("teacherId", "name email")
        .populate("mainCourseId", "courseName courseCode");
};

/**
 * Update an enrollment's start/end dates. Throws AppError(404) when the
 * enrollment is missing.
 */
export const updateEnrollmentDates = async ({ enrollmentId, startDate, endDate }) => {
    const enrollment = await StudentEnrollment.findById(enrollmentId);
    if (!enrollment) {
        throw new AppError("Enrollment not found", 404);
    }

    if (startDate !== undefined) {
        enrollment.startDate = new Date(startDate);
    }
    if (endDate !== undefined) {
        enrollment.endDate = new Date(endDate);
    }

    await enrollment.save();

    return enrollment;
};

/**
 * Delete a student enrollment and shift subsequent course dates up.
 * Throws AppError(404) when the student or the enrollment is missing.
 */
export const deleteEnrollmentAndShift = async ({ studentId, enrollmentId, userId }) => {
    const student = await Student.findById(studentId).select("teacherId name");
    if (!student) {
        throw new AppError("Student not found", 404);
    }

    const enrollments = await StudentEnrollment.find({
        studentId,
        mainCourseId: { $exists: true, $ne: null },
    }).sort({ startDate: 1, createdAt: 1 });

    const targetIndex = enrollments.findIndex(
        (enrollment) => String(enrollment._id) === String(enrollmentId)
    );
    if (targetIndex === -1) {
        throw new AppError("Enrollment not found for student", 404);
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

    return {
        deletedEnrollmentId: enrollmentId,
        updatedEnrollmentsCount: updatedEnrollments.length,
    };
};

/**
 * Update study plan tempo for future courses only. Throws AppError(400) for
 * unsupported tempos and AppError(404) when the student is missing.
 */
export const updateStudyplanTempo = async ({ studentId, tempoWeeks, userId }) => {
    if (!VALID_TEMPO_WEEKS.includes(Number(tempoWeeks))) {
        throw new AppError("Invalid tempoWeeks", 400);
    }

    const student = await Student.findById(studentId).select("teacherId name");
    if (!student) {
        throw new AppError("Student not found", 404);
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
        return { updatedCount: 0 };
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

    return { updatedCount };
};

/**
 * Add students to a course instance, skipping students that are already
 * enrolled. Per-student failures are collected and reported without aborting
 * the batch. Throws AppError(400) for a missing/invalid studentIds array and
 * AppError(404) when the instance or its main course is missing.
 */
export const addStudentsToInstance = async ({ instanceId, studentIds }) => {
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
        throw new AppError("Student IDs array is required", 400);
    }

    const instance = await CourseInstance.findById(instanceId);
    if (!instance) {
        throw new AppError("Course instance not found", 404);
    }

    const mainCourse = await Course.findById(instance.mainCourseId);
    if (!mainCourse) {
        throw new AppError("Main course not found", 404);
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

    return { enrollments, errors };
};
