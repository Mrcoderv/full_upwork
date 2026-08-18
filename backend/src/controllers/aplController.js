import logger from "../utils/logger.js";
import {
    findEligibleStudents,
    autoCreateRecords,
    updateAplStatus,
    autoTransitionStatuses,
    getAplRecords,
    getAplRecordByStudent,
    updateAplRecordDetails,
    getAplStatistics,
} from "../services/aplService.js";

/**
 * GET /apl/records — List APL records with optional filters
 */
export const listAplRecords = async (req, res) => {
    try {
        const { status, includeCompleted, search } = req.query;
        const records = await getAplRecords({
            status,
            includeCompleted: includeCompleted === "true",
            search,
        });
        res.json(records);
    } catch (error) {
        logger.error({ err: error }, "Error listing APL records");
        res.status(500).json({ error: "Failed to list APL records" });
    }
};

/**
 * GET /apl/records/:studentId — Get APL record for a specific student
 */
export const getAplRecord = async (req, res) => {
    try {
        const record = await getAplRecordByStudent(req.params.studentId);
        if (!record) return res.status(404).json({ error: "APL record not found" });
        res.json(record);
    } catch (error) {
        logger.error({ err: error }, "Error getting APL record");
        res.status(500).json({ error: "Failed to get APL record" });
    }
};

/**
 * PATCH /apl/records/:studentId/status — Update APL status
 */
export const patchAplStatus = async (req, res) => {
    try {
        const { status, reason } = req.body;
        const { userId } = req.user;
        const result = await updateAplStatus({
            studentId: req.params.studentId,
            status,
            reason,
            userId,
        });
        res.json({
            success: true,
            message: `APL status updated to ${status}`,
            student: result.student,
            record: result.record,
        });
    } catch (error) {
        if (error.statusCode === 400) return res.status(400).json({ error: error.message });
        if (error.statusCode === 404) return res.status(404).json({ error: error.message });
        logger.error({ err: error }, "Error updating APL status");
        res.status(500).json({ error: "Failed to update APL status" });
    }
};

/**
 * PUT /apl/records/:studentId — Update APL record details (placement, notes, documents)
 */
export const putAplRecord = async (req, res) => {
    try {
        const record = await updateAplRecordDetails({
            studentId: req.params.studentId,
            updates: req.body,
            userId: req.user.userId,
        });
        res.json({ success: true, record });
    } catch (error) {
        if (error.statusCode === 404) return res.status(404).json({ error: error.message });
        logger.error({ err: error }, "Error updating APL record");
        res.status(500).json({ error: "Failed to update APL record" });
    }
};

/**
 * POST /apl/auto-create — Auto-create APL records for eligible students
 */
export const postAutoCreate = async (req, res) => {
    try {
        const created = await autoCreateRecords(req.user.userId);
        res.json({
            success: true,
            message: `Created ${created.length} new APL record(s)`,
            created: created.length,
        });
    } catch (error) {
        logger.error({ err: error }, "Error auto-creating APL records");
        res.status(500).json({ error: "Failed to auto-create APL records" });
    }
};

/**
 * POST /apl/auto-transition — Run automatic status transitions
 */
export const postAutoTransition = async (req, res) => {
    try {
        const transitions = await autoTransitionStatuses();
        res.json({
            success: true,
            message: `Processed ${transitions.length} automatic transition(s)`,
            transitions,
        });
    } catch (error) {
        logger.error({ err: error }, "Error running auto transitions");
        res.status(500).json({ error: "Failed to run auto transitions" });
    }
};

/**
 * GET /apl/eligible — List students eligible for APL
 */
export const getEligibleStudents = async (req, res) => {
    try {
        const students = await findEligibleStudents();
        res.json(students);
    } catch (error) {
        logger.error({ err: error }, "Error finding eligible students");
        res.status(500).json({ error: "Failed to find eligible students" });
    }
};

/**
 * GET /apl/statistics — Get APL statistics
 */
export const getStatistics = async (req, res) => {
    try {
        const stats = await getAplStatistics();
        res.json(stats);
    } catch (error) {
        logger.error({ err: error }, "Error getting APL statistics");
        res.status(500).json({ error: "Failed to get APL statistics" });
    }
};
