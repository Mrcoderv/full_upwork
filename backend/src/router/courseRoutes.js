import express from "express";
import Course from "../models/Course.js";
import logger from "../utils/logger.js";
import { validate, validateId } from "../middleware/validation.js";
import { courseDetailRateLimiter } from "../middleware/security.js";

const router = express.Router();

const createCourseSchema = {
    courseName: { type: "string", required: true, min: 1, max: 200, sanitize: true },
    courseCode: { type: "string", required: true, min: 1, max: 50, sanitize: true },
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

// Create a new course
router.post("/course", validate(createCourseSchema), async (req, res) => {
    try {
        const { courseName, courseCode, coursePoints, courseExtent } = req.body;

        const created = await Course.create({
            courseName,
            courseCode,
            coursePoints,
            courseExtent,
        });

        res.status(201).json(created);
    } catch (error) {
        logger.error({ err: error }, "Error creating course");
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;
