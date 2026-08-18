import express from "express";
import { isAuthenticated } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";
import { getStudyCertificatePdf, generateDiplomaPdf } from "../controllers/studyCertificateController.js";

const router = express.Router();

// One-click study certificate PDF download for a completed enrollment
// GET /api/study-certificate/:enrollmentId/pdf
router.get(
    "/study-certificate/:enrollmentId/pdf",
    isAuthenticated,
    asyncHandler(getStudyCertificatePdf)
);

// Diploma PDF generation for course-package students
// Only generates when all course and APL requirements are met
// GET /api/diploma/:enrollmentId/pdf
router.get(
    "/diploma/:enrollmentId/pdf",
    isAuthenticated,
    asyncHandler(generateDiplomaPdf)
);

export default router;
