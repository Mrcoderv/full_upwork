import express from "express";
import { isAuthenticated } from "../middleware/auth.js";
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
} from "../controllers/learningController.js";

const router = express.Router();

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
    asyncHandler(getInstanceSubmissions)
);

// Pending (unreviewed) submissions for the teacher's own instances (teacher/staff)
router.get(
    "/learning/submissions/pending",
    isAuthenticated,
    asyncHandler(getPendingSubmissions)
);

// Teacher feedback on one submission
router.put(
    "/learning/submissions/:submissionId/feedback",
    isAuthenticated,
    asyncHandler(setSubmissionFeedback)
);

// Assignment-tied comments / discussion thread per submission
router.get(
    "/learning/submissions/:submissionId/comments",
    isAuthenticated,
    asyncHandler(getSubmissionComments)
);
router.post(
    "/learning/submissions/:submissionId/comments",
    isAuthenticated,
    asyncHandler(addSubmissionComment)
);

// Per-component completion report for a student
// GET /learning/instances/:instanceId/report/:studentId
router.get(
    "/learning/instances/:instanceId/report/:studentId",
    isAuthenticated,
    asyncHandler(getCourseInstanceReport)
);

// Macro reports for a course instance (multiple students)
// GET /learning/instances/:instanceId/reports
router.get(
    "/learning/instances/:instanceId/reports",
    isAuthenticated,
    asyncHandler(getCourseInstanceReports)
);

export default router;
