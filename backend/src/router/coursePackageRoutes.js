import express from "express";
import mongoose from "mongoose";
import CoursePackage from "../models/CoursePackage.js";
import logger from "../utils/logger.js";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { validate, validateId } from "../middleware/validation.js";
import { recordAudit } from "../utils/auditLog.js";

const router = express.Router();

const ADMIN_ROLES = ["systemadmin", "admin"];

const objectIdArray = (value) => {
    if (!Array.isArray(value)) return "måste vara en lista av kurs-ID:n";
    const invalid = value.find(
        (id) => typeof id !== "string" || !/^[0-9a-fA-F]{24}$/.test(id)
    );
    if (invalid) return "innehåller ett ogiltigt kurs-ID";
    return null;
};

const createPackageSchema = {
    coursePackageName: { type: "string", required: true, min: 1, max: 200, sanitize: true },
    coursePackageCode: { type: "string", required: true, min: 1, max: 50, sanitize: true },
    coursePackagePoints: { type: "string", required: true, min: 1, max: 50, sanitize: true },
    coursePackageExtent: { type: "string", required: true, min: 1, max: 100, sanitize: true },
    coursePackageCourses: { custom: objectIdArray },
};

const updatePackageSchema = {
    coursePackageName: { type: "string", min: 1, max: 200, sanitize: true },
    coursePackageCode: { type: "string", min: 1, max: 50, sanitize: true },
    coursePackagePoints: { type: "string", min: 1, max: 50, sanitize: true },
    coursePackageExtent: { type: "string", min: 1, max: 100, sanitize: true },
    coursePackageCourses: { custom: objectIdArray },
};

/**
 * GET all course packages with courses populated
 * Route: GET /api/coursepackages
 */
router.get("/coursepackages", async (req, res) => {
    try {
        const coursePackages = await CoursePackage.find()
            .populate("coursePackageCourses")
            .lean();
        res.json(coursePackages);
    } catch (error) {
        logger.error({ err: error }, "Error fetching course packages");
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * GET a single course package by ID (includes courses)
 * Route: GET /api/coursepackages/:id
 */
router.get(
    "/coursepackages/:id",
    validateId(),
    async (req, res) => {
        try {
            const coursePackage = await CoursePackage.findById(req.params.id)
                .populate("coursePackageCourses")
                .lean();
            if (!coursePackage) {
                return res
                    .status(404)
                    .json({ error: "Course Package not found" });
            }
            res.json(coursePackage);
        } catch (error) {
            logger.error({ err: error }, "Error fetching course package");
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
);

/**
 * GET all courses belonging to a specific course package
 * Route: GET /api/coursepackages/:id/courses
 */
router.get("/coursepackages/:id/courses", validateId(), async (req, res) => {
    try {
        const coursePackage = await CoursePackage.findById(req.params.id)
            .populate("coursePackageCourses")
            .lean();
        if (!coursePackage) {
            return res.status(404).json({ error: "Course Package not found" });
        }
        res.json(coursePackage.coursePackageCourses);
    } catch (error) {
        logger.error({ err: error }, "Error fetching courses for course package");
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * Create a course package (admin only)
 * Route: POST /api/coursepackages
 */
router.post(
    "/coursepackages",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    validate(createPackageSchema),
    async (req, res) => {
        try {
            const {
                coursePackageName,
                coursePackageCode,
                coursePackagePoints,
                coursePackageExtent,
                coursePackageCourses,
            } = req.body;

            const created = await CoursePackage.create({
                coursePackageName,
                coursePackageCode,
                coursePackagePoints,
                coursePackageExtent,
                coursePackageCourses: (coursePackageCourses || []).map((id) =>
                    mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
                ),
            });

            await recordAudit(req, {
                entityType: "CoursePackage",
                entityId: created._id,
                action: "create",
                description: `Skapade kursförpackning ${created.coursePackageCode} – ${created.coursePackageName}`,
            });

            res.status(201).json(created);
        } catch (error) {
            logger.error({ err: error }, "Error creating course package");
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
);

/**
 * Update a course package (admin only)
 * Route: PUT /api/coursepackages/:id
 */
router.put(
    "/coursepackages/:id",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    validateId(),
    validate(updatePackageSchema),
    async (req, res) => {
        try {
            const coursePackage = await CoursePackage.findById(req.params.id);
            if (!coursePackage) {
                return res.status(404).json({ error: "Course Package not found" });
            }

            const updates = {};
            const changed = [];
            for (const field of [
                "coursePackageName",
                "coursePackageCode",
                "coursePackagePoints",
                "coursePackageExtent",
            ]) {
                if (req.body[field] !== undefined) {
                    updates[field] = req.body[field];
                    changed.push(`${field}: ${coursePackage[field]} -> ${req.body[field]}`);
                }
            }
            if (Array.isArray(req.body.coursePackageCourses)) {
                updates.coursePackageCourses = req.body.coursePackageCourses.map((id) =>
                    mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
                );
                changed.push("coursePackageCourses uppdaterade");
            }

            Object.assign(coursePackage, updates);
            await coursePackage.save();

            await recordAudit(req, {
                entityType: "CoursePackage",
                entityId: coursePackage._id,
                action: "update",
                description: `Uppdaterade kursförpackning ${coursePackage.coursePackageCode} (${changed.join(", ")})`,
            });

            res.json(coursePackage);
        } catch (error) {
            logger.error({ err: error }, "Error updating course package");
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
);

/**
 * Delete a course package (admin only)
 * Route: DELETE /api/coursepackages/:id
 */
router.delete(
    "/coursepackages/:id",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    validateId(),
    async (req, res) => {
        try {
            const coursePackage = await CoursePackage.findByIdAndDelete(req.params.id);
            if (!coursePackage) {
                return res.status(404).json({ error: "Course Package not found" });
            }

            await recordAudit(req, {
                entityType: "CoursePackage",
                entityId: coursePackage._id,
                action: "delete",
                description: `Tog bort kursförpackning ${coursePackage.coursePackageCode} – ${coursePackage.coursePackageName}`,
            });

            res.json({ message: "Course Package deleted", id: coursePackage._id });
        } catch (error) {
            logger.error({ err: error }, "Error deleting course package");
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
);

export default router;
