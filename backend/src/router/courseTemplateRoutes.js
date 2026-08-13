import express from "express";
import { isAuthenticated } from "../middleware/auth.js";
import { can } from "../middleware/authorization.js";
import { validateId } from "../middleware/validation.js";
import {
    getCourseTemplates,
    getCourseTemplateById,
    createCourseTemplate,
    updateCourseTemplate,
    deleteCourseTemplate,
} from "../controllers/courseTemplateController.js";

const router = express.Router();

// List templates (teachers: own + shared; admins: all)
router.get("/course-templates", isAuthenticated, can("courseTemplates:read"), getCourseTemplates);

// Single template
router.get(
    "/course-templates/:templateId",
    isAuthenticated,
    can("courseTemplates:read"),
    validateId("templateId"),
    getCourseTemplateById
);

// Create a template
router.post("/course-templates", isAuthenticated, can("courseTemplates:create"), createCourseTemplate);

// Update a template
router.put(
    "/course-templates/:templateId",
    isAuthenticated,
    can("courseTemplates:update"),
    validateId("templateId"),
    updateCourseTemplate
);

// Delete a template
router.delete(
    "/course-templates/:templateId",
    isAuthenticated,
    can("courseTemplates:delete"),
    validateId("templateId"),
    deleteCourseTemplate
);

export default router;
