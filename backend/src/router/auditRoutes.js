// File: backend/src/router/auditRoutes.js

import { Router } from 'express'
import FileAuditLog from '../models/FileAuditLog.js'
import { isAuthenticated, hasRole } from '../middleware/auth.js'
import logger from "../utils/logger.js";

const router = Router()

// GET audit logs for a student with pagination and optional filtering by action
router.get('/:studentId', isAuthenticated, hasRole(['admin', 'teacher', 'coordinator']), async (req, res) => {
  try {
    const { studentId } = req.params
    const { page = 1, limit = 10, action } = req.query

    const query = { studentId }
    if (action && ['upload', 'delete'].includes(action)) {
      query.action = action
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10)

    const total = await FileAuditLog.countDocuments(query)
    const logs = await FileAuditLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean()

    res.json({
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      logs,
    })
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch audit logs")
    res.status(500).json({ error: 'Failed to fetch audit logs' })
  }
})

export default router
