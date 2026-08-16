import express from "express";
import mongoose from "mongoose";
import Course from "../models/Course.js";
import logger from "../utils/logger.js";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { validate, validateId } from "../middleware/validation.js";
import { courseDetailRateLimiter } from "../middleware/security.js";
import { recordAudit } from "../utils/auditLog.js";

const router = express.Router();

const ADMIN_ROLES = ["systemadmin", "admin"];

const objectIdArray = (value) => {
    if (!Array.isArray(value)) return "måste vara en lista av ID:n";
    const invalid = value.find(
        (id) => typeof id !== "string" || !/^[0-9a-fA-F]{24}$/.test(id)
    );
    if (invalid) return "innehåller ett ogiltigt ID";
    return null;
};

const createCourseSchema = {
    courseName: { type: "string", required: true, min: 1, max: 200, sanitize: true },
    courseCode: { type: "string", required: true, min: 1, max: 50, sanitize: true },
    programs: { custom: objectIdArray },
};

const updateCourseSchema = {
    courseName: { type: "string", min: 1, max: 200, sanitize: true },
    courseCode: { type: "string", min: 1, max: 50, sanitize: true },
    coursePoints: { type: "string", max: 50, sanitize: true },
    courseExtent: { type: "string", max: 100, sanitize: true },
    programs: { custom: objectIdArray },
    isActive: { type: "boolean" },
};

// Fetch all courses
router.get("/courses", async (req, res) => {
    try {
        const courses = await Course.find();
        res.json(courses);
    } catch (error) {
        logger.error({ err: error }, "Error fetching courses");
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Fetch a single course by ID
router.get(
    "/courses/:courseId",
    validateId("courseId"),
    courseDetailRateLimiter,
    async (req, res) => {
        try {
            const course = await Course.findById(req.params.courseId);
            if (!course)
                return res.status(404).json({ error: "Course not found" });
            res.json(course);
        } catch (error) {
            logger.error({ err: error }, "Error fetching course");
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
);

// Fetch a course ID by name
router.get("/courses/id", async (req, res) => {
    const { name } = req.query;
    try {
        const course = await Course.findOne({ courseName: name });

        if (!course) {
            return res.status(404).json({ error: "Course not found." });
        }

        res.json({ courseId: course._id });
    } catch (error) {
        logger.error({ err: error }, "Error fetching course ID");
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get(
    "/course/:id",
    validateId(),
    async (req, res) => {
        try {
            const course = await Course.findById(req.params.id);
            if (!course)
                return res.status(404).json({ message: "Course not found" });
            res.json(course);
        } catch (err) {
            res.status(500).json({ message: "Server error" });
        }
    }
);

// Create a new course (admin only)
router.post(
    "/course",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    validate(createCourseSchema),
    async (req, res) => {
        try {
            const { courseName, courseCode, coursePoints, courseExtent, programs, isActive } = req.body;

            const created = await Course.create({
                courseName,
                courseCode,
                coursePoints,
                courseExtent,
                isActive: isActive === undefined ? true : isActive,
                programs: (programs || []).map((id) =>
                    mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
                ),
            });

            await recordAudit(req, {
                entityType: "Course",
                entityId: created._id,
                action: "create",
                description: `Skapade kurs ${created.courseCode} – ${created.courseName}`,
            });

            res.status(201).json(created);
        } catch (error) {
            logger.error({ err: error }, "Error creating course");
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
);

// Update a course (admin only)
router.put(
    "/course/:id",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    validateId(),
    validate(updateCourseSchema),
    async (req, res) => {
        try {
            const course = await Course.findById(req.params.id);
            if (!course) {
                return res.status(404).json({ error: "Course not found" });
            }

            const updates = {};
            const changed = [];
            for (const field of ["courseName", "courseCode", "coursePoints", "courseExtent"]) {
                if (req.body[field] !== undefined) {
                    updates[field] = req.body[field];
                    changed.push(`${field}: ${course[field]} -> ${req.body[field]}`);
                }
            }
            if (Array.isArray(req.body.programs)) {
                updates.programs = req.body.programs.map((id) =>
                    mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
                );
                changed.push("programs uppdaterade");
            }
            if (req.body.isActive !== undefined) {
                updates.isActive = req.body.isActive;
                changed.push(`isActive: ${course.isActive} -> ${req.body.isActive}`);
            }

            Object.assign(course, updates);
            await course.save();

            await recordAudit(req, {
                entityType: "Course",
                entityId: course._id,
                action: "update",
                description: `Uppdaterade kurs ${course.courseCode} (${changed.join(", ")})`,
            });

            res.json(course);
        } catch (error) {
            logger.error({ err: error }, "Error updating course");
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
);

// Delete a course (admin only)
router.delete(
    "/course/:id",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    validateId(),
    async (req, res) => {
        try {
            const course = await Course.findByIdAndDelete(req.params.id);
            if (!course) {
                return res.status(404).json({ error: "Course not found" });
            }

            await recordAudit(req, {
                entityType: "Course",
                entityId: course._id,
                action: "delete",
                description: `Tog bort kurs ${course.courseCode} – ${course.courseName}`,
            });

            res.json({ message: "Course deleted", id: course._id });
        } catch (error) {
            logger.error({ err: error }, "Error deleting course");
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
);

export default router;
