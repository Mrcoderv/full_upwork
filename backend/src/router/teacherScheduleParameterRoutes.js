import express from "express";
import { isAuthenticated } from "../middleware/auth.js";
import { can } from "../middleware/authorization.js";
import {
    listTeacherScheduleParameters,
    getTeacherScheduleParameter,
    createTeacherScheduleParameter,
    updateTeacherScheduleParameter,
    deleteTeacherScheduleParameter,
} from "../controllers/teacherScheduleParameterController.js";

const router = express.Router();

// List a teacher's saved schedule parameters
// - Teacher: only their own
// - Admin/systemadmin: any teacher's
router.get(
    "/teacher-schedule-parameters",
    isAuthenticated,
    can("courseTemplates:read"),
    listTeacherScheduleParameters
);

// Get a single teacher's schedule parameters
// - Teacher: only their own
// - Admin/systemadmin: any teacher's
router.get(
    "/teacher-schedule-parameters/:teacherId/:courseId/:lengthWeeks",
    isAuthenticated,
    can("courseTemplates:read"),
    validateIdParams,
    getTeacherScheduleParameter
);

// Create new schedule parameters
// - Teacher: only for their own courses
// - Admin/systemadmin: any teacher/course/length
router.post(
    "/teacher-schedule-parameters",
    isAuthenticated,
    can("courseTemplates:create"),
    createTeacherScheduleParameter
);

// Update schedule parameters
// - Teacher: only their own
// - Admin/systemadmin: any
router.put(
    "/teacher-schedule-parameters/:teacherId/:courseId/:lengthWeeks",
    isAuthenticated,
    can("courseTemplates:update"),
    updateTeacherScheduleParameter
);

// Delete schedule parameters
// - Teacher: only their own
// - Admin/systemadmin: any
router.delete(
    "/teacher-schedule-parameters/:teacherId/:courseId/:lengthWeeks",
    isAuthenticated,
    can("courseTemplates:delete"),
    deleteTeacherScheduleParameter
);

// Helper: validate params for the :teacherId/:courseId/:lengthWeeks pattern
function validateIdParams(req, res, next) {
    // Accept ObjectId or String courseId; lengthWeeks must be 5/10/20
    // We'll just proceed; specific validation happens in the controller
    next();
}

export default router;