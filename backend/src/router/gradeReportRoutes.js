import express from 'express';
import { hasRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/errorHandler.js';
import { getGradeReport } from '../controllers/gradeReportController.js';

const router = express.Router();

router.get(
  '/reports/grades',
  hasRole(['admin', 'systemadmin']),
  asyncHandler(getGradeReport)
);

export default router;
