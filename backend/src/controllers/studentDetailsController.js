import Student from "../models/Student.js";
import Course from "../models/Course.js";
import CoursePackage from "../models/CoursePackage.js";
import Program from "../models/Program.js";
import User from "../models/User.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import mongoose from "mongoose";
import logger from "../utils/logger.js";
import { computeAplPeriod, computeAplEffectiveStatus } from "../utils/aplAutoStatus.js";
import {
    performStudentDropout,
    removeStudentDropoutRecord,
} from "../services/dropoutService.js";

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
            completedAt: enrollment.completedAt,
            completionCertificate: enrollment.completionCertificate,
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
        const { role, userId } = req.user;

        // Check permissions - admin+ only
        if (!["admin", "systemadmin"].includes(role)) {
            return res.status(403).json({
                error: "Insufficient permissions to set student as dropout",
            });
        }

        const result = await performStudentDropout({
            studentId: id,
            userId,
            role,
            reason: "Student marked as dropout (Avbrott)",
        });

        res.json({
            success: result.success,
            message: "Student marked as dropout successfully",
            student: result.student,
            conversationId: result.conversationId,
            deletedExamAttendance: result.deletedExamAttendance,
            deletedProvning: result.deletedProvning,
            deletedEmptyExams: result.deletedEmptyExams,
            removedFromEvents: result.removedFromEvents,
            deletedEmptyEvents: result.deletedEmptyEvents,
            droppedEnrollments: result.droppedEnrollments,
        });
    } catch (error) {
        logger.error({ err: error }, "Error setting student as dropout");
        if (error.statusCode === 404) {
            return res.status(404).json({ error: "Student not found" });
        }
        res.status(500).json({ error: "Failed to set student as dropout" });
    }
};

/**
 * Remove dropout status from student (admin+ only)
 */
export const removeStudentDropout = async (req, res) => {
    try {
        const { id } = req.params;
        const { role, userId } = req.user;

        // Check permissions - admin+ only
        if (!["admin", "systemadmin"].includes(role)) {
            return res.status(403).json({
                error: "Insufficient permissions to remove dropout status",
            });
        }

        const result = await removeStudentDropoutRecord({ studentId: id, userId, role });

        res.json({
            success: result.success,
            message: result.wasDropout
                ? "Dropout status removed successfully"
                : "Student is not marked as dropout",
            student: result.student,
            resolvedNotifications: result.resolvedNotifications,
            reSyncedEnrollments: result.reSyncedEnrollments,
        });
    } catch (error) {
        logger.error({ err: error }, "Error removing dropout status");
        if (error.statusCode === 404) {
            return res.status(404).json({ error: "Student not found" });
        }
        res.status(500).json({ error: "Failed to remove dropout status" });
    }
};

