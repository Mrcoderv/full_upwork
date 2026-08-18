import express from "express";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";
import {
    getInstanceModules,
    submitAssignment,
    getInstanceSubmissions,
    setSubmissionFeedback,
    getPendingSubmissions,
    getSubmissionComments,
    addSubmissionComment,
    getCourseInstanceReport,
    getCourseInstanceReports,
    getCourseInstanceParticipants,
    addCourseInstanceParticipant,
    removeCourseInstanceParticipant,
    getStudentLastAccess,
} from "../controllers/learningController.js";
import {
    calculateActivityStatus,
    calculateBatchActivityStatus,
} from "../services/activityStatusService.js";

const router = express.Router();
const STAFF_ROLES = ["systemadmin", "admin", "teacher", "coordinator", "syv", "specped"];

// Lesson content + assignment for a course instance (student sees own submissions)
router.get(
    "/learning/instances/:instanceId/modules",
    isAuthenticated,
    asyncHandler(getInstanceModules)
);

// Submit (or resubmit) an assignment for one module
router.post(
    "/learning/instances/:instanceId/modules/:moduleNumber/submissions",
    isAuthenticated,
    asyncHandler(submitAssignment)
);

// All submissions for one instance (teacher/staff)
router.get(
    "/learning/instances/:instanceId/submissions",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(getInstanceSubmissions)
);

// Pending (unreviewed) submissions for the teacher's own instances (teacher/staff)
router.get(
    "/learning/submissions/pending",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(getPendingSubmissions)
);

// Teacher feedback on one submission
router.put(
    "/learning/submissions/:submissionId/feedback",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(setSubmissionFeedback)
);

// Assignment-tied comments / discussion thread per submission
router.get(
    "/learning/submissions/:submissionId/comments",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(getSubmissionComments)
);
router.post(
    "/learning/submissions/:submissionId/comments",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(addSubmissionComment)
);

// Per-component completion report for a student
// GET /learning/instances/:instanceId/report/:studentId
router.get(
    "/learning/instances/:instanceId/report/:studentId",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(getCourseInstanceReport)
);

// Get participants for a course instance
router.get(
    "/learning/instances/:instanceId/participants",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(getCourseInstanceParticipants)
);

// Add a participant (student or staff) to a course instance
router.post(
    "/learning/instances/:instanceId/participants",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(addCourseInstanceParticipant)
);

// Remove a participant from a course instance
router.delete(
    "/learning/instances/:instanceId/participants/:participantId",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(removeCourseInstanceParticipant)
);

// Get last access time for a student in a course instance
router.get(
    "/learning/instances/:instanceId/access-last/:studentId",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(getStudentLastAccess)
);

// Calculate activity status for a student in a course instance
// GET /learning/instances/:instanceId/activity-status/:studentId
router.get(
    "/learning/instances/:instanceId/activity-status/:studentId",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(calculateActivityStatus)
);

// Calculate activity status for multiple students in a course instance
// POST /learning/instances/:instanceId/activity-status/batch
router.post(
    "/learning/instances/:instanceId/activity-status/batch",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(calculateBatchActivityStatus)
);

// Macro reports for a course instance (multiple students)
// GET /learning/instances/:instanceId/reports
router.get(
    "/learning/instances/:instanceId/reports",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(getCourseInstanceReports)
);

export default router;
