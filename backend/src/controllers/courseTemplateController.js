import CourseTemplate from "../models/CourseTemplate.js";
import Course from "../models/Course.js";
import logger from "../utils/logger.js";
import mongoose from "mongoose";
import { buildDefaultModules, cloneModules } from "../models/courseModuleSchema.js";

// List templates. Teachers see their own + all templates; admins/systemadmins see all.
export const getCourseTemplates = async (req, res) => {
    try {
        const { courseId, includeInactive } = req.query;
        const query = {};
        if (courseId) query.courseId = courseId;
        if (includeInactive !== "true") query.isActive = true;

        const role = req.user?.role || req.user?.roles?.[0];
        if (role === "teacher") {
            query.$or = [{ createdBy: req.user.userId }, { createdBy: { $exists: false } }];
        }

        const templates = await CourseTemplate.find(query)
            .populate("courseId", "courseName courseCode")
            .populate("createdBy", "username email")
            .sort({ createdAt: -1 })
            .lean();

        res.json({ success: true, templates });
    } catch (error) {
        logger.error({ err: error }, "Error fetching course templates");
        res.status(500).json({ error: "Internal server error" });
    }
};

// Get a single template
export const getCourseTemplateById = async (req, res) => {
    try {
        const template = await CourseTemplate.findById(req.params.templateId)
            .populate("courseId", "courseName courseCode")
            .populate("createdBy", "username email")
            .lean();

        if (!template) {
            return res.status(404).json({ error: "Course template not found" });
        }

        res.json({ success: true, template });
    } catch (error) {
        logger.error({ err: error }, "Error fetching course template");
        res.status(500).json({ error: "Internal server error" });
    }
};

// Create a template. Defaults to 5 modules × 2 sections when modules are not provided.
export const createCourseTemplate = async (req, res) => {
    try {
        const { templateName, courseId, modules } = req.body;

        if (!templateName || !String(templateName).trim()) {
            return res.status(400).json({ error: "Template name is required" });
        }

        if (courseId) {
            const course = await Course.findById(courseId);
            if (!course) {
                return res.status(404).json({ error: "Course not found" });
            }
        }

        const templateModules =
            Array.isArray(modules) && modules.length > 0
                ? modules.map((m, index) => ({
                      moduleNumber: m.moduleNumber ?? index + 1,
                      title: m.title ?? `Modul ${index + 1}`,
                      isPartialExam: !!m.isPartialExam,
                      isCaseStudy: !!m.isCaseStudy,
                      sections: Array.isArray(m.sections)
                          ? m.sections.map((s) => ({
                                title: s.title ?? "",
                                description: s.description ?? "",
                                instructions: s.instructions ?? "",
                            }))
                          : [],
                      assignment:
                          m.assignment?.title || m.assignment?.description
                              ? {
                                    title: m.assignment.title ?? "",
                                    description: m.assignment.description ?? "",
                                }
                              : undefined,
                  }))
                : buildDefaultModules();

        const template = await CourseTemplate.create({
            templateName: String(templateName).trim(),
            courseId: courseId || undefined,
            modules: templateModules,
            createdBy: mongoose.isValidObjectId(req.user?.userId) ? req.user.userId : undefined,
            isActive: true,
        });

        res.status(201).json({ success: true, template });
    } catch (error) {
        logger.error({ err: error }, "Error creating course template");
        res.status(500).json({ error: "Internal server error" });
    }
};

// Update a template (name, linked course, and module structure)
export const updateCourseTemplate = async (req, res) => {
    try {
        const { templateId } = req.params;
        const { templateName, courseId, modules, isActive } = req.body;

        const template = await CourseTemplate.findById(templateId);
        if (!template) {
            return res.status(404).json({ error: "Course template not found" });
        }

        if (templateName !== undefined) {
            if (!String(templateName).trim()) {
                return res.status(400).json({ error: "Template name is required" });
            }
            template.templateName = String(templateName).trim();
        }

        if (courseId !== undefined) {
            if (!courseId) {
                template.courseId = undefined;
            } else {
                const course = await Course.findById(courseId);
                if (!course) {
                    return res.status(404).json({ error: "Course not found" });
                }
                template.courseId = courseId;
            }
        }

        if (Array.isArray(modules) && modules.length > 0) {
            template.modules = modules.map((m, index) => ({
                moduleNumber: m.moduleNumber ?? index + 1,
                title: m.title ?? `Modul ${index + 1}`,
                isPartialExam: !!m.isPartialExam,
                isCaseStudy: !!m.isCaseStudy,
                sections: Array.isArray(m.sections)
                    ? m.sections.map((s) => ({
                          title: s.title ?? "",
                          description: s.description ?? "",
                          instructions: s.instructions ?? "",
                      }))
                    : [],
                assignment:
                    m.assignment?.title || m.assignment?.description
                        ? {
                              title: m.assignment.title ?? "",
                              description: m.assignment.description ?? "",
                          }
                        : undefined,
            }));
        }

        if (isActive !== undefined) {
            template.isActive = !!isActive;
        }

        await template.save();

        res.json({ success: true, template });
    } catch (error) {
        logger.error({ err: error }, "Error updating course template");
        res.status(500).json({ error: "Internal server error" });
    }
};

// Delete a template
export const deleteCourseTemplate = async (req, res) => {
    try {
        const { templateId } = req.params;

        const template = await CourseTemplate.findByIdAndDelete(templateId);
        if (!template) {
            return res.status(404).json({ error: "Course template not found" });
        }

        res.json({ success: true, message: "Course template deleted" });
    } catch (error) {
        logger.error({ err: error }, "Error deleting course template");
        res.status(500).json({ error: "Internal server error" });
    }
};

// Duplicate a template's module structure into a target collection (e.g. a course card / instance)
export const duplicateTemplateIntoCourseInstance = async (templateId) => {
    if (!templateId) return [];
    const template = await CourseTemplate.findById(templateId);
    if (!template) return [];
    return cloneModules(template.modules);
};
