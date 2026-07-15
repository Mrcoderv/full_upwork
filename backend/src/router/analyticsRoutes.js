import { Router } from "express";
import { isAuthenticated } from "../middleware/auth.js";
import { can } from "../middleware/authorization.js";
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

// All analytics endpoints are restricted to admin/systemadmin. `can()`
// already treats those two roles as superusers, but the explicit
// "analytics:read" permission (see src/config/roles.js) documents intent
// and keeps this module opt-in for any future role.
router.get("/filters", isAuthenticated, can("analytics:read"), getFilters);
router.get("/revenue", isAuthenticated, can("analytics:read"), getRevenue);
router.get("/forecast", isAuthenticated, can("analytics:read"), getForecast);
router.get("/students", isAuthenticated, can("analytics:read"), getStudents);
router.get("/grades", isAuthenticated, can("analytics:read"), getGrades);
router.get("/popular-courses", isAuthenticated, can("analytics:read"), getPopular);
router.get("/dropouts", isAuthenticated, can("analytics:read"), getDropouts);

export default router;
