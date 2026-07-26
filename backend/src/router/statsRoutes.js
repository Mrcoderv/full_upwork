// /routes/statsRoutes.js
import express from "express";
import Student from "../models/Student.js";
import Course from "../models/Course.js";
import { authenticateUser } from "../controllers/authController.js";
import logger from "../utils/logger.js";

const router = express.Router();

router.get("/courses-per-month", authenticateUser, async (req, res) => {
  try {
    const students = await Student.find();

    const stats = {};

    for (const student of students) {
      const municipality = student.municipality?.type || "UNKNOWN";

      for (const edu of student.education || []) {
        if (edu.type !== "Course" || !edu.addedAt || !edu.refId) continue;

        const date = new Date(edu.addedAt);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

        // Look up course name by ID
        const courseDoc = await Course.findById(edu.refId);
        if (!courseDoc?.courseName) continue;

        const course = courseDoc.courseName;
        const grade = (edu.grade || "UNKNOWN").toUpperCase();

        stats[month] ??= {};
        stats[month][course] ??= {};

        // Add grade count
        stats[month][course][grade] ??= 0;
        stats[month][course][grade]++;

        // Add municipality info
        stats[month][course]._municipality ??= [];
        if (!stats[month][course]._municipality.includes(municipality)) {
          stats[month][course]._municipality.push(municipality);
        }
      }
    }

    res.json(stats);
  } catch (err) {
    logger.error({ err }, "Error generating course stats")
    res.status(500).json({ error: "Failed to generate stats" });
  }
});

export default router;
