import Student from "../models/Student.js";
import Course from "../models/Course.js";
import CoursePackage from "../models/CoursePackage.js";
import Program from "../models/Program.js";
import User from "../models/User.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import CourseInstance from "../models/CourseInstance.js";
import ExamAttendance from "../models/ExamAttendance.js";
import Provning from "../models/Provning.js";
import Teacher from "../models/Teacher.js";
import Notification from "../models/Notification.js";
import CalendarEvent from "../models/Event.js";
import mongoose from "mongoose";
import logger from "../utils/logger.js";
import { computeAplPeriod, computeAplEffectiveStatus } from "../utils/aplAutoStatus.js";

/**
 * Student Details Controller
 * Handles fetching and populating student details, including education and enrollments.
 * Uses Student, Course, CoursePackage, Program, User, StudentEnrollment, and CourseInstance models.
 */
/**
 * Get student details with populated references and enrollment statistics.
 * @async
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
export const getStudentDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const student = await Student.findById(id)
            .populate("teacherId", "name email")
            .select("+commentHistory.seenBy");

        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const user = await User.findOne({ email: student.email });

        // Manually populate education references (if present as array)
        const populatedStudent = student.toObject();
        populatedStudent.user = user ? user.toObject() : null;
        
        const existingEducation = Array.isArray(populatedStudent.education)
            ? populatedStudent.education
            : [];

        for (const edu of existingEducation) {
            if (!edu?.refId) continue;

            try {
                let populatedRef = null;

                if (edu.type === "Course") {
                    populatedRef = await Course.findById(edu.refId).select(
                        "courseName courseCode coursePoints courseExtent"
                    );
                } else if (edu.type === "CoursePackage") {
                    populatedRef = await CoursePackage.findById(
                        edu.refId
                    ).select("coursePackageName coursePackageCode");
                } else if (edu.type === "Program") {
                    populatedRef = await Program.findById(edu.refId).select(
                        "programName"
                    );
                }

                if (populatedRef) {
                    edu.refId = populatedRef;
                }
            } catch (populateError) {
                logger.error({ err: populateError, type: edu.type }, "Error populating education ref");
                edu.refId = null;
            }
        }

        // Fetch enrollments from the new course versioning system
        const enrollments = await StudentEnrollment.find({ studentId: id })
            .populate("courseInstanceId")
            .populate("mainCourseId")
            .populate("teacherId", "name email")
            .sort({ startDate: -1 });

        // Convert enrollments to education format for display
        const enrollmentEducation = enrollments.map((enrollment) => ({
            _id: enrollment._id,
            type: "Course",
            refId: enrollment.mainCourseId,
            name: enrollment.mainCourseId?.courseName,
            startDate: enrollment.startDate,
            endDate: enrollment.endDate,
            status: enrollment.status,
            grade: enrollment.grade,
            comments: enrollment.notes,
            enrollmentId: enrollment._id,
            courseInstanceId: enrollment.courseInstanceId?._id,
            courseInstance: enrollment.courseInstanceId,
            teacherId: enrollment.teacherId, // Include teacherId for display
            addedAt: enrollment.createdAt,
            addedBy: enrollment.teacherId?.name || "System",
            isEnrollment: true, // Flag to identify this came from enrollment system
        }));

        // Merge enrollment data with existing CoursePackage entries
        // CoursePackages are not enrollments but should still be shown
        const coursePackages = existingEducation.filter(edu => edu.type === 'CoursePackage');
        
        // Combine CoursePackages with enrollment data
        populatedStudent.education = [...coursePackages, ...enrollmentEducation];

        // Add enrollment statistics
        populatedStudent.enrollmentStats = {
            totalEnrollments: enrollments.length,
            activeEnrollments: enrollments.filter(
                (e) => e.status === "enrolled" || e.status === "active"
            ).length,
            completedEnrollments: enrollments.filter(
                (e) => e.status === "completed"
            ).length,
            droppedEnrollments: enrollments.filter(
                (e) => e.status === "dropped"
            ).length,
        };

        // APL auto-status: derive the APL period and the effective (date-driven)
        // status the same way as GET /students, so the APL-flik matches the board.
        const aplPeriod = computeAplPeriod(populatedStudent.education);
        const aplEffective = computeAplEffectiveStatus(
            populatedStudent.aplStatus,
            aplPeriod.aplEndDate
        );
        populatedStudent.aplStatus = aplEffective.aplStatus;
        populatedStudent.aplStatusStored = aplEffective.aplStatusStored;
        populatedStudent.aplStatusAuto = aplEffective.aplAutoRed;
        populatedStudent.aplWeeksRemaining = aplEffective.aplWeeksRemaining;
        populatedStudent.aplStartDate = aplPeriod.aplStartDate;
        populatedStudent.aplEndDate = aplPeriod.aplEndDate;

        res.json(populatedStudent);
    } catch (error) {
        logger.error({ err: error }, "Error fetching student details");
        res.status(500).json({ error: "Failed to fetch student details" });
    }
};

/**
 * Update student information (admin+ only)
 */
export const updateStudentInfo = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.user;
        const updates = req.body;

        // Check permissions
        if (!["admin", "systemadmin"].includes(role)) {
            return res.status(403).json({
                error: "Insufficient permissions to edit student information",
            });
        }

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // Allowed fields for editing
        const allowedFields = [
            "name",
            "personalNumber",
            "phone",
            "email",
            "exam",
            "additionalInfo",
            "specialNeeds",
            "startDate",
            "endDate",
            "finalExamDate",
            "examMunicipality",
            "examLocation",
            "examTime",
            "municipality",
            "dropout",
        ];

        // Apply updates
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                student[field] = updates[field];
            }
        }

        // Track APL status changes with history
        if (
            typeof updates.aplStatus === "string" &&
            updates.aplStatus !== student.aplStatus
        ) {
            student.aplStatusHistory = student.aplStatusHistory || [];
            student.aplStatusHistory.push({
                status: updates.aplStatus,
                changedAt: new Date(),
                changedBy: req.user?.name || req.user?.userId || "system",
            });
            student.aplStatus = updates.aplStatus;
        }

        // Track if finalExamDate changed
        const finalExamDateChanged = 
            updates.finalExamDate !== undefined && 
            updates.finalExamDate !== student.finalExamDate;

        // Log the changes
        const changeLog = {
            timestamp: new Date(),
            changedBy: req.user.userId,
            changedByRole: req.user.role,
            changes: Object.keys(updates).filter((key) =>
                allowedFields.includes(key)
            ),
            previousValues: {},
            newValues: {},
        };

        // Store previous values for audit
        for (const field of changeLog.changes) {
            changeLog.previousValues[field] = student[field];
            changeLog.newValues[field] = updates[field];
        }

        // Add to change history if not already present
        if (!student.changeHistory) {
            student.changeHistory = [];
        }
        student.changeHistory.push(changeLog);

        await student.save();

        // Sync calendar event if finalExamDate was set or changed
        if (finalExamDateChanged && student.finalExamDate) {
            try {
                const { syncCalendarEventsForStudent } = await import(
                    "../utils/calendarEventSync.js"
                );
                await syncCalendarEventsForStudent(student._id);
            } catch (calendarError) {
                logger.error({ err: calendarError }, "Error syncing calendar event");
                // Don't fail the update if calendar sync fails
            }
        }

        res.json({
            success: true,
            message: "Student information updated successfully",
            student,
            changeLog,
        });
    } catch (error) {
        logger.error({ err: error }, "Error updating student information");
        res.status(500).json({ error: "Failed to update student information" });
    }
};

/**
 * Add comment to student (teacher+ only)
 */
export const addComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;
        const { userId, role, name } = req.user;

        // Check permissions
        if (!["teacher", "admin", "systemadmin"].includes(role)) {
            return res
                .status(403)
                .json({ error: "Insufficient permissions to add comments" });
        }

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const newComment = {
            _id: new mongoose.Types.ObjectId(),
            comment,
            author: name,
            authorId: userId,
            authorRole: role,
            date: new Date(),
            seenBy: [new mongoose.Types.ObjectId(userId)],
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
            deletedByRole: null,
        };

        student.commentHistory.unshift(newComment);
        await student.save();

        res.json({
            success: true,
            message: "Comment added successfully",
            comment: newComment,
            commentHistory: student.commentHistory,
        });
    } catch (error) {
        logger.error({ err: error }, "Error adding comment");
        res.status(500).json({ error: "Failed to add comment" });
    }
};

/**
 * Edit comment (author or admin+ only)
 */
export const editComment = async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const { comment } = req.body;
        const { userId, role } = req.user;

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const commentIndex = student.commentHistory.findIndex(
            (c) => c._id.toString() === commentId && !c.isDeleted
        );

        if (commentIndex === -1) {
            return res.status(404).json({ error: "Comment not found" });
        }

        const targetComment = student.commentHistory[commentIndex];

        // Check permissions: author can edit, admin+ can edit any
        if (
            targetComment.authorId.toString() !== userId &&
            !["admin", "systemadmin"].includes(role)
        ) {
            return res
                .status(403)
                .json({ error: "You can only edit your own comments" });
        }

        // Store previous version for audit
        const previousComment = targetComment.comment;

        // Update comment
        targetComment.comment = comment;
        targetComment.editedAt = new Date();
        targetComment.editedBy = userId;
        targetComment.editedByRole = role;
        targetComment.previousVersion = previousComment;

        await student.save();

        res.json({
            success: true,
            message: "Comment edited successfully",
            comment: targetComment,
        });
    } catch (error) {
        logger.error({ err: error }, "Error editing comment");
        res.status(500).json({ error: "Failed to edit comment" });
    }
};

/**
 * Delete comment (author or admin+ only)
 */
export const deleteComment = async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const { userId, role } = req.user;

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const commentIndex = student.commentHistory.findIndex(
            (c) => c._id.toString() === commentId && !c.isDeleted
        );

        if (commentIndex === -1) {
            return res.status(404).json({ error: "Comment not found" });
        }

        const targetComment = student.commentHistory[commentIndex];

        // Check permissions: author can delete, admin+ can delete any
        if (
            targetComment.authorId.toString() !== userId &&
            !["admin", "systemadmin"].includes(role)
        ) {
            return res
                .status(403)
                .json({ error: "You can only delete your own comments" });
        }

        // Soft delete - mark as deleted but keep for audit
        targetComment.isDeleted = true;
        targetComment.deletedAt = new Date();
        targetComment.deletedBy = userId;
        targetComment.deletedByRole = role;
        targetComment.deletedContent = targetComment.comment; // Store content for audit
        targetComment.comment = "[DELETED]";

        await student.save();

        res.json({
            success: true,
            message: "Comment deleted successfully",
            deletedComment: {
                _id: targetComment._id,
                deletedAt: targetComment.deletedAt,
                deletedBy: targetComment.deletedBy,
                deletedContent: targetComment.deletedContent,
            },
        });
    } catch (error) {
        logger.error({ err: error }, "Error deleting comment");
        res.status(500).json({ error: "Failed to delete comment" });
    }
};

/**
 * Mark comment as seen
 */
export const markCommentSeen = async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const { userId } = req.user;

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const comment = student.commentHistory.find(
            (c) => c._id.toString() === commentId && !c.isDeleted
        );

        if (!comment) {
            return res.status(404).json({ error: "Comment not found" });
        }

        // Add user to seenBy if not already there
        if (!comment.seenBy.some((id) => id.toString() === userId)) {
            comment.seenBy.push(new mongoose.Types.ObjectId(userId));
            await student.save();
        }

        res.json({
            success: true,
            message: "Comment marked as seen",
        });
    } catch (error) {
        logger.error({ err: error }, "Error marking comment as seen");
        res.status(500).json({ error: "Failed to mark comment as seen" });
    }
};

/**
 * Get student change history (admin+ only)
 */
export const getChangeHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.user;

        if (!["admin", "systemadmin"].includes(role)) {
            return res.status(403).json({
                error: "Insufficient permissions to view change history",
            });
        }

        const student = await Student.findById(id).select("changeHistory");
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        res.json({
            success: true,
            changeHistory: student.changeHistory || [],
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching change history");
        res.status(500).json({ error: "Failed to fetch change history" });
    }
};

/**
 * Set student as dropout (Avbrott) - flags student, removes from APL/exams, sends notification
 */
export const setStudentDropout = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, userId, name } = req.user;

        // Check permissions - admin+ only
        if (!["admin", "systemadmin"].includes(role)) {
            return res.status(403).json({
                error: "Insufficient permissions to set student as dropout",
            });
        }

        const student = await Student.findById(id).populate({
            path: "teacherId",
            populate: { path: "userId", select: "_id username email" }
        });
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }
        
        logger.debug({ name: student.name, id }, "Student fetched");
        logger.debug({ teacherId: student.teacherId }, "Student teacherId");
        logger.debug({ teacher: student.teacher }, "Student teacher string");

        // If already dropout, we still need to ensure notification exists
        // (in case it was deleted or teacher changed)
        const wasAlreadyDropout = student.dropout;
        if (wasAlreadyDropout) {
            logger.info({ name: student.name }, "Student already marked as dropout, checking notification");
        }

        // Set dropout flag (only if not already set)
        if (!student.dropout) {
            student.dropout = true;
        }

        // Log the change (only if dropout was actually changed)
        if (!wasAlreadyDropout) {
            const changeLog = {
                timestamp: new Date(),
                changedBy: userId,
                changedByRole: role,
                changes: ["dropout"],
                previousValues: { dropout: false },
                newValues: { dropout: true },
            };

            if (!student.changeHistory) {
                student.changeHistory = [];
            }
            student.changeHistory.push(changeLog);
        }

        // Save student (even if already dropout, to ensure data is fresh)
        await student.save();

        // Remove from APL lists (by excluding from APL queries - handled automatically)
        // The APL board already filters by excluding dropout students

        // Find all ExamAttendance records for this student (all dates, not just future)
        // Convert id to ObjectId to ensure proper matching
        const studentObjectId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
        const allExamAttendance = await ExamAttendance.find({ studentId: studentObjectId });
        logger.debug({ count: allExamAttendance.length, name: student.name, id }, "Found exam attendance records");
        if (allExamAttendance.length > 0) {
            logger.debug({ records: allExamAttendance.map(a => ({
                _id: a._id,
                examDate: a.examDate,
                teacherId: a.teacherId,
                courseId: a.courseId,
                studentId: a.studentId
            })) }, "Exam attendance records details");
        }

        // Group exams by examDate (normalized to start of day) + teacherId + courseId to identify which exams they belong to
        const examGroups = new Map();
        for (const attendance of allExamAttendance) {
            // Normalize examDate to start of day for proper grouping
            const examDateStart = new Date(attendance.examDate);
            examDateStart.setHours(0, 0, 0, 0);
            const examDateEnd = new Date(examDateStart);
            examDateEnd.setHours(23, 59, 59, 999);
            
            const examKey = `${examDateStart.toISOString()}_${attendance.teacherId}_${attendance.courseId || 'null'}`;
            if (!examGroups.has(examKey)) {
                examGroups.set(examKey, {
                    examDateStart,
                    examDateEnd,
                    teacherId: attendance.teacherId,
                    courseId: attendance.courseId,
                    attendanceRecords: []
                });
            }
            examGroups.get(examKey).attendanceRecords.push(attendance._id);
        }

        // Delete all ExamAttendance records for this student
        const deletedExamAttendance = await ExamAttendance.deleteMany({
            studentId: studentObjectId,
        });
        logger.info({ count: deletedExamAttendance.deletedCount, name: student.name, id }, "Deleted exam attendance records");
        // Verify deletion by checking if any records remain
        const remainingRecords = await ExamAttendance.countDocuments({ studentId: studentObjectId });
        if (remainingRecords > 0) {
            logger.warn({ remainingRecords, name: student.name }, "Exam attendance records still exist after deletion");
        } else {
            logger.info({ name: student.name }, "Verified: No exam attendance records remain");
        }

        // Check each exam group - if no students remain, delete the entire exam
        let deletedEmptyExams = 0;
        for (const [examKey, examGroup] of examGroups.entries()) {
            // Build query for this exam group (using date range to match all records on the same day)
            const examQuery = {
                $and: [
                    {
                        examDate: {
                            $gte: examGroup.examDateStart,
                            $lte: examGroup.examDateEnd
                        }
                    },
                    { teacherId: examGroup.teacherId }
                ]
            };
            
            // Handle courseId - if it's null/undefined, match records where courseId is null or doesn't exist
            if (examGroup.courseId) {
                examQuery.$and.push({ courseId: examGroup.courseId });
            } else {
                examQuery.$and.push({
                    $or: [
                        { courseId: null },
                        { courseId: { $exists: false } }
                    ]
                });
            }

            // Check if there are any remaining students in this exam
            const remainingStudents = await ExamAttendance.countDocuments(examQuery);

            if (remainingStudents === 0) {
                // No students left in this exam, delete all records (should already be deleted, but double-check)
                const deleted = await ExamAttendance.deleteMany(examQuery);
                deletedEmptyExams++;
                logger.info({ examKey, count: deleted.deletedCount }, "Deleted empty exam group");
            }
        }

        // Remove from Provning (exam registrations) - delete ALL records regardless of status
        const deletedProvning = await Provning.deleteMany({
            studentId: studentObjectId,
        });
        logger.info({ count: deletedProvning.deletedCount, name: student.name }, "Deleted exam registrations (Provning)");

        // Remove the student from persisted calendar slutprov events and delete now-empty events.
        // This makes the removal durable so the student no longer appears on the slutprov list
        // even in stored calendar events (the read endpoints also filter by dropout as a safety net).
        let removedFromEvents = 0;
        let deletedEmptyEvents = 0;
        try {
            const pullResult = await CalendarEvent.updateMany(
                {
                    "extendedProps.type": "slutprov",
                    "extendedProps.students._id": studentObjectId,
                },
                { $pull: { "extendedProps.students": { _id: studentObjectId } } }
            );
            removedFromEvents = pullResult.modifiedCount || 0;
            logger.info({ count: removedFromEvents, name: student.name }, "Removed dropout student from persisted calendar events");

            const emptyEvents = await CalendarEvent.find({
                "extendedProps.type": "slutprov",
                $or: [
                    { "extendedProps.students": { $size: 0 } },
                    { "extendedProps.students": { $exists: false } },
                    { "extendedProps.students": null },
                ],
            }).select("_id");

            if (emptyEvents.length > 0) {
                const deleteResult = await CalendarEvent.deleteMany({
                    _id: { $in: emptyEvents.map((e) => e._id) },
                });
                deletedEmptyEvents = deleteResult.deletedCount || 0;
                logger.info({ count: deletedEmptyEvents, name: student.name }, "Deleted empty calendar events after dropout");
            }
        } catch (eventError) {
            logger.error({ err: eventError, name: student.name }, "Error cleaning up calendar events for dropout student");
        }

        // Send notification to responsible teacher
        let teacherRecord = null;
        let teacherUserId = null;
        
        logger.debug({ name: student.name, id }, "Looking for teacher for student");
        logger.debug({ teacherId: student.teacherId }, "Student teacherId");
        logger.debug({ teacher: student.teacher }, "Student teacher string");
        
        if (student.teacherId) {
            // If teacherId is populated (as object), use it directly
            if (student.teacherId._id) {
                teacherRecord = student.teacherId;
                logger.debug({ teacherRecordId: teacherRecord._id }, "Found populated teacherId");
            } else {
                // If teacherId is just an ObjectId, fetch the teacher
                teacherRecord = await Teacher.findById(student.teacherId);
                logger.debug({ teacherRecordId: teacherRecord ? teacherRecord._id : 'NOT FOUND' }, "Fetched teacher by ID");
            }
            
            if (teacherRecord) {
                // Get the userId from the teacher record
                if (teacherRecord.userId) {
                    // userId might be ObjectId or populated object
                    teacherUserId = teacherRecord.userId._id || teacherRecord.userId;
                    logger.debug({ teacherUserId }, "Found userId from teacher record");
                } else {
                    // If userId is not populated, fetch it
                    const populatedTeacher = await Teacher.findById(teacherRecord._id).populate("userId");
                    if (populatedTeacher && populatedTeacher.userId) {
                        teacherUserId = populatedTeacher.userId._id || populatedTeacher.userId;
                        logger.debug({ teacherUserId }, "Found userId after populate");
                    } else {
                        logger.warn({ teacherRecordId: teacherRecord._id }, "Could not find userId for teacher");
                    }
                }
            }
        } else if (student.teacher && typeof student.teacher === "string") {
            // Try to find teacher by name string
            logger.debug({ name: student.teacher }, "Looking for teacher by name");
            const teacherUser = await User.findOne({ name: student.teacher });
            if (teacherUser) {
                logger.debug({ userId: teacherUser._id }, "Found user by name");
                // Find the Teacher record for this user
                teacherRecord = await Teacher.findOne({ userId: teacherUser._id });
                if (teacherRecord) {
                    teacherUserId = teacherUser._id;
                    logger.debug({ teacherRecordId: teacherRecord._id }, "Found Teacher record for user");
                } else {
                    logger.warn({ userId: teacherUser._id }, "No Teacher record found for user");
                }
            } else {
                logger.warn({ name: student.teacher }, "No user found with name");
            }
        } else {
            logger.warn({ name: student.name }, "No teacherId or teacher name found for student");
        }

        if (teacherRecord && teacherRecord._id) {
            logger.debug({ teacherRecordId: teacherRecord._id, teacherUserId }, "Creating notification for teacher");
            logger.debug({
                teacherRecordId: teacherRecord._id.toString(),
                teacherUserId: teacherUserId ? teacherUserId.toString() : 'MISSING',
                studentId: id,
            }, "Notification details");
            
            // Check if notification already exists (regardless of resolution status)
            // We want to prevent duplicates, not check if it's resolved
            const existingNotification = await Notification.findOne({
                type: "dropout",
                teacher: teacherRecord._id,
                "meta.studentId": id,
            });

            logger.debug("Checking for existing notification");
            logger.debug({
                teacher: teacherRecord._id.toString(),
                studentId: id,
                existingNotificationId: existingNotification ? existingNotification._id : 'NONE',
            }, "Notification query details");

            if (!existingNotification) {
                // Ensure teacher._id is properly converted to ObjectId
                const teacherObjectId = mongoose.Types.ObjectId.isValid(teacherRecord._id)
                    ? new mongoose.Types.ObjectId(teacherRecord._id)
                    : teacherRecord._id;
                
                const notification = new Notification({
                    type: "dropout",
                    teacher: teacherObjectId, // Store Teacher._id for query matching
                    createdByAdmin: userId, // Store the admin who created this notification
                    message: `Eleven ${student.name} har markerats som avbrott (inaktiv).`,
                    meta: {
                        teacherId: teacherUserId, // Store User._id for reference
                        studentId: id,
                        url: `/student/${id}`,
                    },
                    resolved: false,
                    resolvedByUsers: [], // Initialize empty array for per-user resolution
                });
                await notification.save();
                logger.info({ notificationId: notification._id }, "Created dropout notification");
                logger.debug({
                    notificationTeacher: notification.teacher ? notification.teacher.toString() : 'MISSING',
                    notificationMetaTeacherId: notification.meta.teacherId ? notification.meta.teacherId.toString() : 'MISSING',
                    notificationMetaStudentId: notification.meta.studentId ? notification.meta.studentId.toString() : 'MISSING',
                    notificationType: notification.type,
                    notificationResolved: notification.resolved,
                }, "Notification details");
                
                // Verify the notification was saved correctly
                const verifyNotification = await Notification.findById(notification._id);
                logger.debug({
                    _id: verifyNotification._id.toString(),
                    type: verifyNotification.type,
                    teacher: verifyNotification.teacher ? verifyNotification.teacher.toString() : 'MISSING',
                    metaTeacherId: verifyNotification.meta?.teacherId ? verifyNotification.meta.teacherId.toString() : 'MISSING',
                    metaStudentId: verifyNotification.meta?.studentId ? verifyNotification.meta.studentId.toString() : 'MISSING',
                    resolved: verifyNotification.resolved,
                }, "Verification - Saved notification");
            } else {
                // Notification already exists - reset resolvedByUsers so all users see it again
                logger.info({ notificationId: existingNotification._id }, "Dropout notification already exists");
                logger.debug({
                    existingTeacher: existingNotification.teacher ? existingNotification.teacher.toString() : 'MISSING',
                    existingMetaTeacherId: existingNotification.meta?.teacherId ? existingNotification.meta.teacherId.toString() : 'MISSING',
                    resolvedByUsers: existingNotification.resolvedByUsers ? existingNotification.resolvedByUsers.map(id => id.toString()) : 'MISSING',
                }, "Existing notification details");
                
                // Reset resolvedByUsers so all users see the notification again
                // Also update createdByAdmin to the current admin
                existingNotification.resolvedByUsers = [];
                existingNotification.resolved = false; // Also reset legacy field
                existingNotification.createdByAdmin = userId; // Update to current admin
                await existingNotification.save();
                logger.info({ notificationId: existingNotification._id, userId }, "Reset notification - cleared resolvedByUsers and updated createdByAdmin");
            }
        } else {
            logger.warn({ name: student.name }, "No teacher found for student, skipping notification");
            logger.debug({ teacherRecord, teacherUserId }, "Teacher lookup details");
        }

        res.json({
            success: true,
            message: "Student marked as dropout successfully",
            student,
            deletedExamAttendance: deletedExamAttendance.deletedCount,
            deletedProvning: deletedProvning.deletedCount,
            deletedEmptyExams: deletedEmptyExams,
            removedFromEvents,
            deletedEmptyEvents,
        });
    } catch (error) {
        logger.error({ err: error }, "Error setting student as dropout");
        res.status(500).json({ error: "Failed to set student as dropout" });
    }
};

/**
 * Remove dropout status from student (admin+ only)
 */
export const removeStudentDropout = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, userId, name } = req.user;

        // Check permissions - admin+ only
        if (!["admin", "systemadmin"].includes(role)) {
            return res.status(403).json({
                error: "Insufficient permissions to remove dropout status",
            });
        }

        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const wasDropout = student.dropout;
        if (!wasDropout) {
            return res.json({
                success: true,
                message: "Student is not marked as dropout",
                student,
            });
        }

        // Remove dropout flag
        student.dropout = false;

        // Log the change
        const changeLog = {
            timestamp: new Date(),
            changedBy: userId,
            changedByRole: role,
            changes: ["dropout"],
            previousValues: { dropout: true },
            newValues: { dropout: false },
        };

        if (!student.changeHistory) {
            student.changeHistory = [];
        }
        student.changeHistory.push(changeLog);

        await student.save();

        // Resolve any existing dropout notifications for this student
        const resolvedNotifications = await Notification.updateMany(
            {
                type: "dropout",
                "meta.studentId": id,
                resolved: false,
            },
            {
                $set: {
                    resolved: true,
                    resolvedBy: userId,
                    resolvedAt: new Date(),
                },
            }
        );

        logger.info({ name: student.name }, "Removed dropout status for student");
        logger.debug({ count: resolvedNotifications.modifiedCount }, "Resolved dropout notifications");

        // Re-add the student to calendar slutprov events (enrollment-based and manual finalExamDate).
        // The sync functions skip dropout students, so this must run after dropout has been cleared.
        let reSyncedEnrollments = 0;
        try {
            const { syncCalendarEventFromEnrollment, syncCalendarEventsForStudent } = await import(
                "../utils/calendarEventSync.js"
            );

            const enrollments = await StudentEnrollment.find({
                studentId: student._id,
                slutprovDate: { $ne: null },
            }).select("_id");

            for (const enrollment of enrollments) {
                await syncCalendarEventFromEnrollment(enrollment._id);
                reSyncedEnrollments++;
            }

            if (student.finalExamDate) {
                await syncCalendarEventsForStudent(student._id);
            }

            logger.info({ name: student.name, reSyncedEnrollments }, "Re-synced calendar events after dropout removal");
        } catch (syncError) {
            logger.error({ err: syncError, name: student.name }, "Error re-syncing calendar events after dropout removal");
        }

        res.json({
            success: true,
            message: "Dropout status removed successfully",
            student,
            resolvedNotifications: resolvedNotifications.modifiedCount,
            reSyncedEnrollments,
        });
    } catch (error) {
        logger.error({ err: error }, "Error removing dropout status");
        res.status(500).json({ error: "Failed to remove dropout status" });
    }
};
