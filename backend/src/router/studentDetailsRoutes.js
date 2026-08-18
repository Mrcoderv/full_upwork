import express from "express";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";
import {
    getStudentDetails,
    updateStudentInfo,
    addComment,
    editComment,
    deleteComment,
    markCommentSeen,
    getChangeHistory,
    setStudentDropout,
    removeStudentDropout,
    reactivateStudentWithCourses,
    getRevisionReasons,
    reviseStudyPlan,
    getStudyplanRevisionHistory,
    getSupportInfo,
    updateSupportInfo,
    getDeviations,
    createDeviation,
    updateDeviation,
} from "../controllers/studentDetailsController.js";

const router = express.Router();

// Get student details with populated references
router.get("/student-details/:id", isAuthenticated, hasRole(["systemadmin", "admin", "teacher", "coordinator", "syv", "specped"]), asyncHandler(getStudentDetails));

// Update student information (admin+ only)
router.put(
    "/student-details/:id",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(updateStudentInfo)
);

// Comment management routes
router.post(
    "/student-details/:id/comments",
    isAuthenticated,
    hasRole(["teacher", "admin", "systemadmin"]),
    asyncHandler(addComment)
);
router.put(
    "/student-details/:id/comments/:commentId",
    isAuthenticated,
    hasRole(["teacher", "admin", "systemadmin"]),
    asyncHandler(editComment)
);
router.delete(
    "/student-details/:id/comments/:commentId",
    isAuthenticated,
    hasRole(["teacher", "admin", "systemadmin"]),
    asyncHandler(deleteComment)
);
router.put(
    "/student-details/:id/comments/:commentId/seen",
    isAuthenticated,
    hasRole(["teacher", "admin", "systemadmin", "coordinator", "syv", "specped"]),
    asyncHandler(markCommentSeen)
);

// Change history (admin+ only)
router.get(
    "/student-details/:id/history",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(getChangeHistory)
);

// Set student as dropout (Avbrott) - admin+ only
router.post(
    "/student-details/:id/dropout",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(setStudentDropout)
);

// Remove dropout status from student - admin+ only
router.delete(
    "/student-details/:id/dropout",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(removeStudentDropout)
);

// Reactivate student with optional course re-enrollment - admin+ only
router.post(
    "/student-details/:id/reactivate",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(reactivateStudentWithCourses)
);

// ─── Study-Plan Revision Endpoints ──────────────────────────────────────────

// Get available revision reasons
router.get(
    "/student-details/:id/revision-reasons",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    asyncHandler(getRevisionReasons)
);

// Perform a study-plan revision - admin+ only
router.post(
    "/student-details/:id/revise-studyplan",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(reviseStudyPlan)
);

// Get revision history for a student
router.get(
    "/student-details/:id/revision-history",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    asyncHandler(getStudyplanRevisionHistory)
);

// ─── Support Info Endpoints ─────────────────────────────────────────────────

// Get support contacts for a student
router.get(
    "/student-details/:id/support",
    isAuthenticated,
    hasRole(["systemadmin", "admin", "teacher", "coordinator", "syv", "specped"]),
    asyncHandler(getSupportInfo)
);

// Update support contacts for a student (admin+ only)
router.put(
    "/student-details/:id/support",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(updateSupportInfo)
);

// ─── Deviation Endpoints ────────────────────────────────────────────────────

// Get all deviations for a student
router.get(
    "/student-details/:id/deviations",
    isAuthenticated,
    hasRole(["systemadmin", "admin", "teacher", "coordinator", "syv", "specped"]),
    asyncHandler(getDeviations)
);

// Create a new deviation (teacher+ only)
router.post(
    "/student-details/:id/deviations",
    isAuthenticated,
    hasRole(["teacher", "admin", "systemadmin"]),
    asyncHandler(createDeviation)
);

// Update a deviation status (admin+ only)
router.put(
    "/student-details/:id/deviations/:deviationId",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(updateDeviation)
);

export default router;
