import CalendarEvent from "../models/Event.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
// Ensure Course schema is registered for populate lookups
import "../models/Course.js";
// Ensure CourseInstance schema is registered for populate lookups
import "../models/CourseInstance.js";
// Ensure User schema is registered for populate lookups (teacher.userId)
import "../models/User.js";
import logger from "./logger.js";

/**
 * Syncs calendar events for students with finalExamDate
 * Groups students by date and teacherId (if available)
 * Creates or updates calendar events accordingly
 */
export async function syncCalendarEventsForStudent(studentId) {
    try {
        const student = await Student.findById(studentId)
            .populate({
                path: "teacherId",
                populate: { path: "userId", select: "username" },
            })
            .populate({
                path: "education.refId",
                model: "Course",
                select: "courseName courseCode",
            });

        if (!student || !student.finalExamDate) {
            logger.debug({ studentId }, "Student has no finalExamDate, skipping calendar sync");
            return;
        }

        // Skip if student is a dropout
        if (student.dropout) {
            logger.debug({ studentId }, "Student is a dropout, skipping calendar sync");
            return;
        }

        const examDate = new Date(student.finalExamDate);
        const dateKey = examDate.toISOString().split("T")[0]; // YYYY-MM-DD

        // Find course name from education
        let courseName = null;
        if (Array.isArray(student.education)) {
            const edu = student.education.find((e) => {
                if (e.type !== "Course" || !e.startDate || !e.endDate) return false;
                const start = new Date(e.startDate).setHours(0, 0, 0, 0);
                const end = new Date(e.endDate).setHours(0, 0, 0, 0);
                const exam = new Date(dateKey).setHours(0, 0, 0, 0);
                return exam >= start && exam <= end && e.refId && typeof e.refId === "object" && e.refId.courseName;
            });
            if (edu && edu.refId && typeof edu.refId === "object" && edu.refId.courseName) {
                courseName = edu.refId.courseName;
            }
        }

        // If no course found, try to find from enrollments
        if (!courseName) {
            const { default: StudentEnrollment } = await import("../models/StudentEnrollment.js");
            const enrollment = await StudentEnrollment.findOne({
                studentId: student._id,
                endDate: {
                    $gte: new Date(dateKey),
                    $lt: new Date(new Date(dateKey).getTime() + 24 * 60 * 60 * 1000),
                },
            }).populate("mainCourseId");
            if (enrollment && enrollment.mainCourseId && enrollment.mainCourseId.courseName) {
                courseName = enrollment.mainCourseId.courseName;
            }
        }

        // Determine teacher info
        let teacherId = null;
        let teacherName = "Okänd lärare";
        let teacherColor = "#999999";

        if (student.teacherId) {
            teacherId = student.teacherId._id;
            if (student.teacherId.userId) {
                teacherName = student.teacherId.userId.username || teacherName;
            }
            teacherColor = student.teacherId.colorCode || teacherColor;
        }

        // Create a key for grouping: teacherId_date or just date if no teacher
        const groupKey = teacherId ? `${teacherId}_${dateKey}` : `no_teacher_${dateKey}`;

        // Find or create calendar event for this group
        const existingEvent = await CalendarEvent.findOne({
            start: {
                $gte: new Date(dateKey + "T00:00:00.000Z"),
                $lt: new Date(dateKey + "T23:59:59.999Z"),
            },
            "extendedProps.type": "slutprov",
            ...(teacherId ? { "extendedProps.teacherId": teacherId } : { "extendedProps.teacherId": { $exists: false } }),
        });

        const studentData = {
            _id: student._id,
            name: student.name,
            personalNumber: student.personalNumber,
            additionalInfo: student.additionalInfo || "",
            attended: student.attendedExam || false,
            courseName: courseName || "Okänd kurs",
        };

        if (existingEvent) {
            // Update existing event - add student if not already present
            const students = existingEvent.extendedProps?.students || [];
            const studentExists = students.some((s) => s._id.toString() === student._id.toString());

            if (!studentExists) {
                students.push(studentData);
                existingEvent.extendedProps.students = students;
                // Use teacher name as title, not course name - all events for same teacher/date should have same title
                existingEvent.title = teacherName || "Okänd lärare";
                await existingEvent.save();
                logger.info({ studentName: student.name, dateKey }, "Added student to existing calendar event");
            } else {
                logger.debug({ studentName: student.name, dateKey }, "Student already in calendar event");
            }
        } else {
            // Create new event - use teacher name as title, not course name
            const newEvent = new CalendarEvent({
                title: teacherName || "Okänd lärare",
                start: new Date(dateKey + "T00:00:00.000Z"),
                color: "#ff6b6b", // Red color for exams
                extendedProps: {
                    teacher: teacherName,
                    teacherId: teacherId,
                    type: "slutprov",
                    examMunicipality: student.examMunicipality || "",
                    examLocation: student.examLocation || "",
                    examTime: student.examTime || "",
                    students: [studentData],
                },
            });

            await newEvent.save();
            logger.info({ studentName: student.name, dateKey }, "Created new calendar event");
        }
    } catch (error) {
        logger.error({ err: error, studentId }, "Error syncing calendar event for student");
        // Don't throw - this is a background sync operation
    }
}

/**
 * Syncs calendar events for all enrollments that have a slutprovDate.
 * Uses enrollment-based sync to avoid date drift and to leverage course/teacher context.
 */
export async function syncAllCalendarEvents() {
    try {
        const { default: StudentEnrollment } = await import("../models/StudentEnrollment.js");

        const enrollments = await StudentEnrollment.find({
            slutprovDate: { $ne: null },
        })
            .populate("studentId", "dropout")
            .select("_id studentId slutprovDate");

        logger.info({ count: enrollments.length }, "Syncing calendar events for enrollments with slutprov");

        for (const enrollment of enrollments) {
            // Skip if the student is a dropout
            if (enrollment.studentId?.dropout) {
                continue;
            }
            await syncCalendarEventFromEnrollment(enrollment._id);
        }

        logger.info("Finished syncing calendar events");
    } catch (error) {
        logger.error({ err: error }, "Error syncing all calendar events");
        throw error;
    }
}

/**
 * Syncs calendar events from a StudentEnrollment with slutprovDate
 * Groups students by date and teacherId (if available)
 * Creates or updates calendar events accordingly
 */
export async function syncCalendarEventFromEnrollment(enrollmentId) {
    try {
        const { default: StudentEnrollment } = await import("../models/StudentEnrollment.js");
        const enrollment = await StudentEnrollment.findById(enrollmentId)
            .populate("studentId")
            .populate("mainCourseId")
            .populate({
                path: "teacherId",
                populate: { path: "userId", select: "username" },
            })
            .populate({
                path: "courseInstanceId",
                populate: { path: "responsibleTeacher", populate: { path: "userId", select: "username" } },
            });

        if (!enrollment || !enrollment.slutprovDate) {
            logger.debug({ enrollmentId }, "Enrollment has no slutprovDate, skipping calendar sync");
            return;
        }

        if (!enrollment.studentId) {
            logger.debug({ enrollmentId }, "Enrollment has no student, skipping calendar sync");
            return;
        }

        const student = enrollment.studentId;

        // Skip if student is a dropout
        if (student.dropout) {
            logger.debug({ studentId: student._id }, "Student is a dropout, skipping calendar sync");
            return;
        }

        // Create date at a fixed UTC noon to avoid timezone shifts in calendar
        const examDate = new Date(enrollment.slutprovDate);
        const year = examDate.getUTCFullYear();
        const month = examDate.getUTCMonth();
        const day = examDate.getUTCDate();
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; // YYYY-MM-DD

        // Use noon UTC for start to prevent +1/-1 day shifts when rendered as all-day
        const eventStartDate = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
        const eventEndDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

        // Get course name from mainCourseId or courseInstanceId
        let courseName = null;
        if (enrollment.mainCourseId && enrollment.mainCourseId.courseName) {
            courseName = enrollment.mainCourseId.courseName;
        } else if (enrollment.courseInstanceId && enrollment.courseInstanceId.courseName) {
            courseName = enrollment.courseInstanceId.courseName;
        }

        // Determine teacher info - ALWAYS prefer course instance responsibleTeacher if it exists
        // This ensures students in the same course instance are grouped together
        let teacherId = null;
        let teacherName = "Okänd lärare";
        let teacherColor = "#999999";

        if (enrollment.courseInstanceId?.responsibleTeacher) {
            // Course instance's responsible teacher takes priority
            const responsibleTeacher = enrollment.courseInstanceId.responsibleTeacher;
            teacherId = responsibleTeacher._id;
            if (responsibleTeacher.userId) {
                teacherName = responsibleTeacher.userId.username || teacherName;
            }
            teacherColor = responsibleTeacher.colorCode || teacherColor;
        } else if (enrollment.teacherId) {
            // Fallback to enrollment's teacherId if no course instance
            teacherId = enrollment.teacherId._id;
            if (enrollment.teacherId.userId) {
                teacherName = enrollment.teacherId.userId.username || teacherName;
            }
            teacherColor = enrollment.teacherId.colorCode || teacherColor;
        } else if (student.teacherId) {
            // Last resort: student's teacherId
            const studentTeacher = await Teacher.findById(student.teacherId).populate("userId", "username");
            if (studentTeacher) {
                teacherId = studentTeacher._id;
                if (studentTeacher.userId) {
                    teacherName = studentTeacher.userId.username || teacherName;
                }
                teacherColor = studentTeacher.colorCode || teacherColor;
            }
        }

        // Find or create calendar event for this group
        // Also check for courseInstanceId to group by course instance
        const courseInstanceId = enrollment.courseInstanceId?._id?.toString();
        const existingEvent = await CalendarEvent.findOne({
            start: {
                $gte: eventStartDate,
                $lte: eventEndDate,
            },
            "extendedProps.type": "slutprov",
            ...(teacherId ? { "extendedProps.teacherId": teacherId } : { "extendedProps.teacherId": { $exists: false } }),
            ...(courseInstanceId ? { "extendedProps.courseInstanceIds": courseInstanceId } : {}),
        });

        const studentData = {
            _id: student._id,
            name: student.name,
            personalNumber: student.personalNumber,
            additionalInfo: student.additionalInfo || "",
            attended: student.attendedExam || false,
            courseName: courseName || "Okänd kurs",
        };

        if (existingEvent) {
            // Update existing event - add student if not already present
            const students = existingEvent.extendedProps?.students || [];
            const studentExists = students.some((s) => s._id.toString() === student._id.toString());

            if (!studentExists) {
                students.push(studentData);
                existingEvent.extendedProps.students = students;
                // Use teacher name as title, not course name - all events for same teacher/date should have same title
                existingEvent.title = teacherName || "Okänd lärare";
                
                // Also update courseInstanceIds if missing
                if (courseInstanceId) {
                    const courseInstanceIds = existingEvent.extendedProps?.courseInstanceIds || [];
                    if (!courseInstanceIds.includes(courseInstanceId)) {
                        courseInstanceIds.push(courseInstanceId);
                        existingEvent.extendedProps.courseInstanceIds = courseInstanceIds;
                    }
                }
                
                await existingEvent.save();
                logger.info({ studentName: student.name, dateKey }, "Added student to existing calendar event from enrollment");
            } else {
                logger.debug({ studentName: student.name, dateKey }, "Student already in calendar event from enrollment");
            }
        } else {
            // Create new event with courseInstanceId in extendedProps for linking
            const extendedProps = {
                teacher: teacherName,
                teacherId: teacherId,
                type: "slutprov",
                examMunicipality: student.examMunicipality || "",
                examLocation: student.examLocation || "",
                examTime: student.examTime || "",
                students: [studentData],
            };
            
            // Add courseInstanceId to link the event to the course instance
            if (courseInstanceId) {
                extendedProps.courseInstanceIds = [courseInstanceId];
            }
            
            // Use teacher name as title, not course name - all events for same teacher/date should have same title
            const newEvent = new CalendarEvent({
                title: teacherName || "Okänd lärare",
                start: eventStartDate, // Use local midnight, not UTC
                color: "#ff6b6b", // Red color for exams
                extendedProps: extendedProps,
            });

            await newEvent.save();
            logger.info({ studentName: student.name, dateKey, courseInstanceId: courseInstanceId || "none" }, "Created new calendar event from enrollment");
        }
    } catch (error) {
        logger.error({ err: error, enrollmentId }, "Error syncing calendar event for enrollment");
        // Don't throw - this is a background sync operation
    }
}