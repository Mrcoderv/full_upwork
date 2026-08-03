import express from "express";
import CoursePackage from "../models/CoursePackage.js";
import logger from "../utils/logger.js";
import { validateId } from "../middleware/validation.js";

const router = express.Router();

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

export default router;
