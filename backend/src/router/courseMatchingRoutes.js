import express from "express";
import multer from "multer";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";
import {
    uploadStudentsForMatching,
    processStudentEducation,
    findCourseMatch,
    getCourseInstances,
    getStudentEnrollments,
    getCourseInstanceEnrollments,
    updateEnrollmentStatus,
    updateEnrollmentDates,
    deleteEnrollmentAndShift,
    updateStudyplanTempo,
    getCourseStatistics,
    createCourseInstance,
    updateCourseInstance,
    deleteCourseInstance,
    deleteAllCourseInstances,
    getMyCourseInstances,
    addStudentsToInstance,
    getMyCourseCards,
    getStudentCourseCards,
    getCourseInstanceContent,
    updateCourseInstanceContent,
} from "../controllers/courseMatchingController.js";
import logger from "../utils/logger.js";

const router = express.Router();

// Multer setup for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Course matching routes
router.get(
    "/course-match",
    isAuthenticated,
    asyncHandler(findCourseMatch)
);
router.post(
    "/upload-students",
    upload.single("file"),
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(uploadStudentsForMatching)
);
router.post(
    "/process-education",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    asyncHandler(processStudentEducation)
);

// Course instances routes
// IMPORTANT: More specific routes must come before general ones
router.get(
    "/course-instances/mine",
    (req, res, next) => {
        logger.debug("course-instances/mine route hit");
        next();
    },
    isAuthenticated,
    hasRole(["teacher", "admin", "systemadmin"]),
    asyncHandler(getMyCourseInstances)
);
router.get("/course-instances", isAuthenticated, asyncHandler(getCourseInstances));
router.post(
    "/course-instances",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(createCourseInstance)
);
router.put(
    "/course-instances/:instanceId",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(updateCourseInstance)
);

// Bulk delete all course instances
router.delete(
    "/course-instances/all",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(deleteAllCourseInstances)
);
// Delete a course instance
router.delete(
    "/course-instances/:instanceId",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(deleteCourseInstance)
);

// Student enrollment routes
router.get(
    "/students/:studentId/enrollments",
    isAuthenticated,
    asyncHandler(getStudentEnrollments)
);

// Course instance enrollment routes
router.get(
    "/course-instances/:instanceId/enrollments",
    isAuthenticated,
    asyncHandler(getCourseInstanceEnrollments)
);
router.post(
    "/course-instances/:instanceId/add-students",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(addStudentsToInstance)
);
router.put(
    "/enrollments/:enrollmentId/status",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    asyncHandler(updateEnrollmentStatus)
);
router.put(
    "/enrollments/:enrollmentId",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    asyncHandler(updateEnrollmentDates)
);
router.delete(
    "/students/:studentId/enrollments/:enrollmentId",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    asyncHandler(deleteEnrollmentAndShift)
);
router.put(
    "/students/:studentId/studyplan-tempo",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    asyncHandler(updateStudyplanTempo)
);

// Course cards routes
router.get(
    "/course-cards/mine",
    isAuthenticated,
    hasRole(["student"]),
    asyncHandler(getMyCourseCards)
);
router.get(
    "/students/:studentId/course-cards",
    isAuthenticated,
    asyncHandler(getStudentCourseCards)
);
router.get(
    "/course-instances/:instanceId/content",
    isAuthenticated,
    asyncHandler(getCourseInstanceContent)
);
router.put(
    "/course-instances/:instanceId/content",
    isAuthenticated,
    asyncHandler(updateCourseInstanceContent)
);

// Statistics routes
router.get(
    "/course-statistics",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(getCourseStatistics)
);

export default router;
