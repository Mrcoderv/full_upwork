import express from "express";
import Course from "../models/Course.js";
import logger from "../utils/logger.js";
// Rate limiting disabled
// import {
//     courseDetailRateLimiter,
//     exemptAdminsFromRateLimit,
// } from "../middleware/security.js";

const router = express.Router();

// 🔹 Fetch all courses
router.get("/courses", async (req, res) => {
    try {
        const courses = await Course.find();
        res.json(courses);
    } catch (error) {
        logger.error({ err: error }, "Error fetching courses");
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 🔹 Fetch a single course by ID
router.get(
    "/courses/:courseId",
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

// 🔹 Fetch a course ID by name
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

// 🔹 Create a new course
router.post("/course", async (req, res) => {
    try {
        const { courseName, courseCode, coursePoints, courseExtent } = req.body;

        if (!courseName || !courseCode) {
            return res.status(400).json({ error: "Missing required fields" });
        }

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
