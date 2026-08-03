import { Router } from "express";
import { isAuthenticated } from "../middleware/auth.js";
import { can } from "../middleware/authorization.js";
import { asyncHandler } from "../utils/errorHandler.js";
import {
    getRevenue,
    getForecast,
    getStudents,
    getGrades,
    getPopular,
    getDropouts,
    getFilters,
} from "../controllers/analyticsController.js";

const router = Router();

router.get("/filters", isAuthenticated, can("analytics:read"), asyncHandler(getFilters));
router.get("/revenue", isAuthenticated, can("analytics:read"), asyncHandler(getRevenue));
router.get("/forecast", isAuthenticated, can("analytics:read"), asyncHandler(getForecast));
router.get("/students", isAuthenticated, can("analytics:read"), asyncHandler(getStudents));
router.get("/grades", isAuthenticated, can("analytics:read"), asyncHandler(getGrades));
router.get("/popular-courses", isAuthenticated, can("analytics:read"), asyncHandler(getPopular));
router.get("/dropouts", isAuthenticated, can("analytics:read"), asyncHandler(getDropouts));

export default router;
