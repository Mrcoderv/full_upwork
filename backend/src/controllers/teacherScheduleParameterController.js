import logger from "../utils/logger.js";
import TeacherScheduleParameters from "../models/TeacherScheduleParameters.js";
import { recordAudit } from "../utils/auditLog.js";

// List a teacher's saved schedule parameters (admin only)
export const listTeacherScheduleParameters = async (req, res) => {
    try {
        const { teacherId } = req.query;

        const query = teacherId ? { teacherId } : {};

        const parameters = await TeacherScheduleParameters.find(query)
            .sort({ courseId: 1, lengthWeeks: 1 })
            .lean();

        res.json(parameters);
    } catch (error) {
        logger.error("Error listing teacher schedule parameters:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Get a single teacher's schedule parameters (admin only)
export const getTeacherScheduleParameter = async (req, res) => {
    try {
        const { teacherId, courseId, lengthWeeks } = req.params;

        const parameter = await TeacherScheduleParameters.findOne({
            teacherId,
            courseId,
            lengthWeeks: Number(lengthWeeks),
        }).lean();

        if (!parameter) {
            return res.status(404).json({ message: "Schedule parameters not found for this teacher/course/length" });
        }

        res.json(parameter);
    } catch (error) {
        logger.error("Error getting teacher schedule parameter:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Create new schedule parameters (admin only)
export const createTeacherScheduleParameter = async (req, res) => {
    try {
        const { teacherId, courseId, lengthWeeks, sectionOffsets } = req.body;

        const existing = await TeacherScheduleParameters.findOne({
            teacherId,
            courseId,
            lengthWeeks,
        }).lean();

        if (existing) {
            return res.status(409).json({ message: "Schedule parameters already exist for this teacher/course/length combination" });
        }

        const parameter = new TeacherScheduleParameters({
            teacherId,
            courseId,
            lengthWeeks,
            sectionOffsets: sectionOffsets || [],
        });

        await parameter.save();

        await recordAudit(req, {
            entityType: "TeacherScheduleParameters",
            entityId: parameter._id,
            action: "create",
            description: `Skapade schemaparametrar för lärare ${teacherId}, kurs ${courseId}, ${lengthWeeks} veckor (offsets: ${JSON.stringify(sectionOffsets || [])})`,
        });

        res.status(201).json(parameter);
    } catch (error) {
        logger.error("Error creating teacher schedule parameter:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Update schedule parameters (admin only)
export const updateTeacherScheduleParameter = async (req, res) => {
    try {
        const { teacherId, courseId, lengthWeeks } = req.params;
        const { sectionOffsets } = req.body;

        const previous = await TeacherScheduleParameters.findOne({
            teacherId,
            courseId,
            lengthWeeks: Number(lengthWeeks),
        }).lean();

        const updateData = {
            sectionOffsets,
            updatedAt: Date.now(),
        };

        const parameter = await TeacherScheduleParameters.findOneAndUpdate(
            { teacherId, courseId, lengthWeeks: Number(lengthWeeks) },
            updateData,
            { new: true, runValidators: true }
        ).lean();

        if (!parameter) {
            return res.status(404).json({ message: "Schedule parameters not found" });
        }

        await recordAudit(req, {
            entityType: "TeacherScheduleParameters",
            entityId: parameter._id,
            action: "update",
            description: `Uppdaterade schemaparametrar för lärare ${teacherId}, kurs ${courseId}, ${lengthWeeks} veckor (offsets: ${JSON.stringify(previous?.sectionOffsets || [])} -> ${JSON.stringify(sectionOffsets)})`,
        });

        res.json(parameter);
    } catch (error) {
        logger.error("Error updating teacher schedule parameter:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Delete schedule parameters (admin only)
export const deleteTeacherScheduleParameter = async (req, res) => {
    try {
        const { teacherId, courseId, lengthWeeks } = req.params;

        const deleted = await TeacherScheduleParameters.findOneAndDelete({
            teacherId,
            courseId,
            lengthWeeks: Number(lengthWeeks),
        }).lean();

        if (!deleted) {
            return res.status(404).json({ message: "Schedule parameters not found" });
        }

        await recordAudit(req, {
            entityType: "TeacherScheduleParameters",
            entityId: deleted._id,
            action: "delete",
            description: `Tog bort schemaparametrar för lärare ${teacherId}, kurs ${courseId}, ${lengthWeeks} veckor`,
        });

        res.json({ message: "Schedule parameters deleted successfully" });
    } catch (error) {
        logger.error("Error deleting teacher schedule parameter:", error);
        res.status(500).json({ message: "Server error" });
    }
};
