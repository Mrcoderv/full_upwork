import express from "express";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { validate, validateId } from "../middleware/validation.js";
import {
    listTeacherScheduleParameters,
    getTeacherScheduleParameter,
    createTeacherScheduleParameter,
    updateTeacherScheduleParameter,
    deleteTeacherScheduleParameter,
} from "../controllers/teacherScheduleParameterController.js";

const router = express.Router();

const ADMIN_ROLES = ["systemadmin", "admin"];
const VALID_LENGTHS = [5, 10, 20];

// sectionOffsets: 5 numbers (weeks-from-course-start, one per module/section)
const sectionOffsetsRule = {
    custom: (value) => {
        if (value === undefined || value === null) return null;
        if (!Array.isArray(value)) return "måste vara en lista med 5 tal";
        if (value.length !== 5) return "måste ha exakt 5 värden (en per modul)";
        if (value.some((n) => typeof n !== "number" || Number.isNaN(n) || n < 0)) {
            return "måste vara icke-negativa tal";
        }
        return null;
    },
};

const createSchema = {
    teacherId: { type: "string", required: true, objectId: true },
    courseId: { type: "string", required: true, min: 1, max: 50 },
    lengthWeeks: {
        type: "number",
        required: true,
        custom: (value) => (VALID_LENGTHS.includes(value) ? null : "måste vara 5, 10 eller 20"),
    },
    sectionOffsets: sectionOffsetsRule,
};

const updateSchema = {
    sectionOffsets: { ...sectionOffsetsRule, required: true },
};

// List a teacher's saved schedule parameters (admin only)
router.get(
    "/teacher-schedule-parameters",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    listTeacherScheduleParameters
);

// Get a single teacher's schedule parameters (admin only)
router.get(
    "/teacher-schedule-parameters/:teacherId/:courseId/:lengthWeeks",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    validateId("teacherId"),
    getTeacherScheduleParameter
);

// Create new schedule parameters (admin only)
router.post(
    "/teacher-schedule-parameters",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    validate(createSchema),
    createTeacherScheduleParameter
);

// Update schedule parameters (admin only)
router.put(
    "/teacher-schedule-parameters/:teacherId/:courseId/:lengthWeeks",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    validateId("teacherId"),
    validate(updateSchema),
    updateTeacherScheduleParameter
);

// Delete schedule parameters (admin only)
router.delete(
    "/teacher-schedule-parameters/:teacherId/:courseId/:lengthWeeks",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    validateId("teacherId"),
    deleteTeacherScheduleParameter
);

export default router;
