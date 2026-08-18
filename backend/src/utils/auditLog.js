import AuditLog from '../models/AuditLog.js'
import logger from './logger.js'

/**
 * Record an auditable action, attributed to the authenticated user.
 * Failures are logged but never block the primary request.
 *
 * @param {object} req Express request (uses req.user / req.userId)
 * @param {{entityType: string, entityId?: string, action: string, description?: string}} entry
 */
export async function recordAudit(req, { entityType, entityId, action, description }) {
    const user = req?.user || {};
    try {
        await AuditLog.create({
            entityType,
            entityId,
            action,
            description,
            performedBy: {
                userId: user.userId || req?.userId,
                role: user.role || user.roles?.[0],
                email: user.email,
            },
        });
    } catch (err) {
        logger.error({ err }, `Failed to write audit log for ${entityType} ${action}`);
    }
}
