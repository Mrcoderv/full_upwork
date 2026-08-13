import express from "express";
import { isAuthenticated } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";
import {
    getInstanceModules,
    submitAssignment,
    getInstanceSubmissions,
    setSubmissionFeedback,
    getPendingSubmissions,
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

export default router;
