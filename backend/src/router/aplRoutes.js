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

export default router;
