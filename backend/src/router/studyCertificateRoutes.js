import express from "express";
import { isAuthenticated } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";
import { getStudyCertificatePdf } from "../controllers/studyCertificateController.js";

const router = express.Router();

// One-click study certificate PDF download for a completed enrollment
// GET /api/study-certificate/:enrollmentId/pdf
router.get(
    "/study-certificate/:enrollmentId/pdf",
    isAuthenticated,
    asyncHandler(getStudyCertificatePdf)
);

export default router;
