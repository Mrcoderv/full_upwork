import express from "express";
import Program from "../models/Program.js";
import logger from "../utils/logger.js";

const router = express.Router();

// ✅ Get all programs with populated courses and course packages
router.get("/programs", async (req, res) => {
    try {
        const programs = await Program.find()
            .populate({
                path: "programCourses.courseId",
                select: "courseName courseCode coursePoints courseExtent",
            })
            .populate({
                path: "programCoursePackages",
                model: "CoursePackage",
                populate: {
                    path: "coursePackageCourses",
                    model: "Course",
                    select: "courseName courseCode courseExtent",
                },
            })
            .lean();

        // Optional: Sort by order if present
        programs.forEach((p) => {
            if (Array.isArray(p.programCourses)) {
                p.programCourses.sort(
                    (a, b) => (a.order ?? 0) - (b.order ?? 0)
                );
            }
        });

        const formattedPrograms = programs.map((program) => ({
            _id: program._id,
            programName: program.programName,

            programCourses: (program.programCourses || []).map((pc) => {
                const c = pc.courseId || {};
                return {
                    _id: c._id,
                    courseName: c.courseName || "N/A",
                    courseCode: c.courseCode || "N/A",
                    coursePoints: c.coursePoints || "N/A",
                    courseExtent: c.courseExtent || "N/A",
                    order: pc.order ?? null,
                };
            }),

            programCoursePackages: (program.programCoursePackages || []).map(
                (pkg) => ({
                    _id: pkg._id,
                    coursePackageName: pkg.coursePackageName,
                    coursePackageCode: pkg.coursePackageCode,
                    coursePackageExtent: pkg.coursePackageExtent,
                    coursePackageCourses: (pkg.coursePackageCourses || []).map(
                        (course) => ({
                            _id: course._id,
                            courseName: course.courseName,
                            courseCode: course.courseCode,
                            courseExtent: course.courseExtent,
                        })
                    ),
                })
            ),
        }));

        res.json(formattedPrograms);
    } catch (error) {
        logger.error({ err: error }, "Error fetching programs")
        res.status(500).json({ error: "Server error" });
    }
});

// ✅ Get only the programCourses for a given program ID
router.get("/program/:programId/courses", async (req, res) => {
    try {
        const program = await Program.findById(req.params.programId)
            .populate({
                path: "programCourses.courseId",
                select: "courseName courseCode coursePoints courseExtent",
            })
            .lean();

        if (!program) {
            return res.status(404).json({ error: "Program not found" });
        }

        const courses = (program.programCourses || []).map((pc) => {
            const c = pc.courseId || {};
            return {
                _id: c._id,
                courseName: c.courseName || "N/A",
                courseCode: c.courseCode || "N/A",
                coursePoints: c.coursePoints || "N/A",
                courseExtent: c.courseExtent || "N/A",
                order: pc.order ?? null,
            };
        });

        res.json(courses);
    } catch (error) {
        logger.error({ err: error }, "Error fetching program courses")
        res.status(500).json({ error: "Server error" });
    }
});

export default router;
