import express from "express";
import Course from "../models/Course.js";
import { isAuthenticated } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";
import logger from "../utils/logger.js";

const router = express.Router();

// GET /course-bank/courses - List courses for the question bank exam generator
router.get(
    "/courses",
    isAuthenticated,
    asyncHandler(async (req, res) => {
        try {
            const courses = await Course.find({ isActive: true })
                .select("courseName courseCode coursePoints")
                .sort({ courseName: 1 })
                .lean();

            res.json({ courses });
        } catch (error) {
            logger.error({ err: error }, "Error fetching courses for course bank");
            res.status(500).json({ message: "Intern servererror" });
        }
    })
);

export default router;
