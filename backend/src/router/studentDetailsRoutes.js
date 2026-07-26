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
} from "../controllers/studentDetailsController.js";

const router = express.Router();

// Get student details with populated references
router.get("/student-details/:id", isAuthenticated, asyncHandler(getStudentDetails));

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
    asyncHandler(editComment)
);
router.delete(
    "/student-details/:id/comments/:commentId",
    isAuthenticated,
    asyncHandler(deleteComment)
);
router.put(
    "/student-details/:id/comments/:commentId/seen",
    isAuthenticated,
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

export default router;
