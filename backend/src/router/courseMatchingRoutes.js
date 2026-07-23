import express from "express";
import multer from "multer";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
// Rate limiting disabled
// import { exemptAdminsFromRateLimit } from "../middleware/security.js";
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
} from "../controllers/courseMatchingController.js";
import logger from "../utils/logger.js";

const router = express.Router();

// Multer setup for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Course matching routes
router.get(
    "/course-match",
    isAuthenticated,
    findCourseMatch
);
router.post(
    "/upload-students",
    upload.single("file"),
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    uploadStudentsForMatching
);
router.post(
    "/process-education",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    processStudentEducation
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
    getMyCourseInstances
);
router.get("/course-instances", isAuthenticated, getCourseInstances);
router.post(
    "/course-instances",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    createCourseInstance
);
router.put(
    "/course-instances/:instanceId",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    updateCourseInstance
);

// Bulk delete all course instances
router.delete(
    "/course-instances/all",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    deleteAllCourseInstances
);
// Delete a course instance
router.delete(
    "/course-instances/:instanceId",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    deleteCourseInstance
);

// Student enrollment routes
router.get(
    "/students/:studentId/enrollments",
    isAuthenticated,
    getStudentEnrollments
);

// Course instance enrollment routes
router.get(
    "/course-instances/:instanceId/enrollments",
    isAuthenticated,
    getCourseInstanceEnrollments
);
router.post(
    "/course-instances/:instanceId/add-students",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    addStudentsToInstance
);
router.put(
    "/enrollments/:enrollmentId/status",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    updateEnrollmentStatus
);
router.put(
    "/enrollments/:enrollmentId",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    updateEnrollmentDates
);
router.delete(
    "/students/:studentId/enrollments/:enrollmentId",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    deleteEnrollmentAndShift
);
router.put(
    "/students/:studentId/studyplan-tempo",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    updateStudyplanTempo
);

// Statistics routes
router.get(
    "/course-statistics",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    getCourseStatistics
);

export default router;
