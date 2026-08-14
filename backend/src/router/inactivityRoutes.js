import { Router } from "express";
import { isAuthenticated } from "../middleware/auth.js";
import { can } from "../middleware/authorization.js";
import { asyncHandler } from "../utils/errorHandler.js";
import { getInactivityReport } from "../controllers/inactivityController.js";

const router = Router();

router.get(
    "/report",
    isAuthenticated,
    can("inactivity:read"),
    asyncHandler(getInactivityReport)
);

export default router;
