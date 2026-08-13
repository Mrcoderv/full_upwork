import logger from "../utils/logger.js";
import TeacherScheduleParameters from "../models/TeacherScheduleParameters.js";

// List a teacher's saved schedule parameters
// - Teacher: only their own
// - Admin/systemadmin: any teacher's
export const listTeacherScheduleParameters = async (req, res) => {
    try {
        const { teacherId: callerId, roles } = req.user;
        const targetTeacherId = req.params.targetTeacherId || null;

        // If caller is admin/systemadmin, they can see any teacher's parameters
        const isAdmin = roles.includes("systemadmin") || roles.includes("admin");

        let query = {};
        if (!isAdmin && callerId) {
            query.teacherId = callerId;
        } else if (targetTeacherId) {
            query.teacherId = targetTeacherId;
        } else {
            // Admin with no targetTeacherId: return all (might be many; keep it simple)
            query = {};
        }

        const parameters = await TeacherScheduleParameters.find(query)
            .sort({ courseId: 1, lengthWeeks: 1 })
            .lean();

        res.json(parameters);
    } catch (error) {
        logger.error("Error listing teacher schedule parameters:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Get a single teacher's schedule parameters
export const getTeacherScheduleParameter = async (req, res) => {
    try {
        const { teacherId: callerId, roles } = req.user;
        const targetTeacherId = req.params.targetTeacherId || null;
        const { courseId, lengthWeeks } = req.query;

        const isAdmin = roles.includes("systemadmin") || roles.includes("admin");

        let query = { teacherId: targetTeacherId || callerId };
        if (courseId) query.courseId = courseId;
        if (lengthWeeks) query.lengthWeeks = Number(lengthWeeks);

        if (!isAdmin && callerId) {
            query.teacherId = callerId;
        }

        const parameter = await TeacherScheduleParameters.findOne(query).lean();

        if (!parameter) {
            return res.status(404).json({ message: "Schedule parameters not found for this teacher/course/length" });
        }

        // Non-admin callers can only access their own
        if (!isAdmin && parameter.teacherId.toString() !== callerId) {
            return res.status(403).json({ message: "Forbidden: You can only access your own schedule parameters" });
        }

        res.json(parameter);
    } catch (error) {
        logger.error("Error getting teacher schedule parameter:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Create new schedule parameters
// - Teacher: only for their own courses (courseId from body must match or be own course)
// - Admin/systemadmin: any teacher/course/length
export const createTeacherScheduleParameter = async (req, res) => {
    try {
        const { teacherId: callerId, roles } = req.user;
        const { courseId, lengthWeeks, sectionOffsets } = req.body;

        const isAdmin = roles.includes("systemadmin") || roles.includes("admin");

        // If not admin, teacher can only create for themselves, and courseId should match or be sensible
        let effectiveTeacherId = isAdmin ? (req.body.teacherId || callerId) : callerId;

        if (!isAdmin) {
            // Teacher creating their own: courseId from body is optional/suggested, but we trust it
            // We'll just use the caller's ID as the teacher
        }

        const existing = await TeacherScheduleParameters.findOne({
            teacherId: effectiveTeacherId,
            courseId: courseId,
            lengthWeeks: lengthWeeks,
        }).lean();

        if (existing) {
            return res.status(409).json({ message: "Schedule parameters already exist for this teacher/course/length combination" });
        }

        const parameter = new TeacherScheduleParameters({
            teacherId: effectiveTeacherId,
            courseId: courseId,
            lengthWeeks: lengthWeeks,
            sectionOffsets: sectionOffsets || [],
        });

        await parameter.save();
        res.status(201).json(parameter);
    } catch (error) {
        logger.error("Error creating teacher schedule parameter:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Update schedule parameters
// - Teacher: only their own
// - Admin/systemadmin: any
export const updateTeacherScheduleParameter = async (req, res) => {
    try {
        const { teacherId: callerId, roles } = req.user;
        const { courseId, lengthWeeks } = req.query;
        const { sectionOffsets } = req.body;

        const isAdmin = roles.includes("systemadmin") || roles.includes("admin");

        let query = {};
        if (courseId) query.courseId = courseId;
        if (lengthWeeks) query.lengthWeeks = Number(lengthWeeks);

        if (!isAdmin && callerId) {
            query.teacherId = callerId;
        } else if (!callerId) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const updateData = {};
        if (sectionOffsets !== undefined) updateData.sectionOffsets = sectionOffsets;
        updateData.updatedAt = Date.now();

        const parameter = await TeacherScheduleParameters.findOneAndUpdate(
            { ...query, teacherId: isAdmin ? (req.body.teacherId || callerId) : callerId },
            updateData,
            { new: true, runValidators: true }
        ).lean();

        if (!parameter) {
            return res.status(404).json({ message: "Schedule parameters not found" });
        }

        res.json(parameter);
    } catch (error) {
        logger.error("Error updating teacher schedule parameter:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// Delete schedule parameters
// - Teacher: only their own
// - Admin/systemadmin: any
export const deleteTeacherScheduleParameter = async (req, res) => {
    try {
        const { teacherId: callerId, roles } = req.user;
        const { courseId, lengthWeeks } = req.query;

        const isAdmin = roles.includes("systemadmin") || roles.includes("admin");

        let query = {};
        if (courseId) query.courseId = courseId;
        if (lengthWeeks) query.lengthWeeks = Number(lengthWeeks);

        if (!isAdmin && callerId) {
            query.teacherId = callerId;
        } else if (!callerId) {
            return res.status(401).json({ message: "Authentication required" });
        }

        const result = await TeacherScheduleParameters.deleteOne(query);

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Schedule parameters not found" });
        }

        res.json({ message: "Schedule parameters deleted successfully" });
    } catch (error) {
        logger.error("Error deleting teacher schedule parameter:", error);
        res.status(500).json({ message: "Server error" });
    }
};