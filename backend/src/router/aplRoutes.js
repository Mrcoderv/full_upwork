import { Router } from "express";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";
import {
    listAplRecords,
    getAplRecord,
    patchAplStatus,
    putAplRecord,
    postAutoCreate,
    postAutoTransition,
    getEligibleStudents,
    getStatistics,
} from "../controllers/aplController.js";

const router = Router();
const APL_ROLES = ["admin", "systemadmin", "teacher", "coordinator"];

router.get("/apl/records", isAuthenticated, hasRole(APL_ROLES), asyncHandler(listAplRecords));
router.get("/apl/records/:studentId", isAuthenticated, hasRole(APL_ROLES), asyncHandler(getAplRecord));
router.patch("/apl/records/:studentId/status", isAuthenticated, hasRole(APL_ROLES), asyncHandler(patchAplStatus));
router.put("/apl/records/:studentId", isAuthenticated, hasRole(APL_ROLES), asyncHandler(putAplRecord));
router.post("/apl/auto-create", isAuthenticated, hasRole(["admin", "systemadmin"]), asyncHandler(postAutoCreate));
router.post("/apl/auto-transition", isAuthenticated, hasRole(["admin", "systemadmin"]), asyncHandler(postAutoTransition));
router.get("/apl/eligible", isAuthenticated, hasRole(APL_ROLES), asyncHandler(getEligibleStudents));
router.get("/apl/statistics", isAuthenticated, hasRole(APL_ROLES), asyncHandler(getStatistics));

// Student can view their own APL record
router.get("/apl/my", isAuthenticated, async (req, res) => {
    try {
        const Student = (await import("../models/Student.js")).default;
        const student = await Student.findOne({ email: req.user.email }).lean();
        if (!student) return res.status(404).json({ error: "Ingen elevprofil hittad." });
        const AplRecord = (await import("../models/AplRecord.js")).default;
        const record = await AplRecord.findOne({ studentId: student._id }).lean();
        if (!record) return res.json(null);
        res.json({
            color: record.color || "GRAY",
            period: record.period || null,
            workplace: record.workplace || null,
            supervisor: record.supervisor || null,
            hasLogbook: Boolean(record.logbook && record.logbook.length > 0),
            hasCv: Boolean(record.cvUrl),
        });
    } catch (err) {
        res.status(500).json({ error: "Kunde inte hämta APL-status." });
    }
});

export default router;
