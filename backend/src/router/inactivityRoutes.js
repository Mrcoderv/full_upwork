import { Router } from "express";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { can } from "../middleware/authorization.js";
import { asyncHandler } from "../utils/errorHandler.js";
import {
    getInactivityReport,
    sendInactivityWarning,
} from "../controllers/inactivityController.js";

const router = Router();

router.get(
    "/report",
    isAuthenticated,
    can("inactivity:read"),
    asyncHandler(getInactivityReport)
);

router.post(
    "/:studentId/warning-email",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(sendInactivityWarning)
);

export default router;
