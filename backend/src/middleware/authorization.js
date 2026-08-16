
import rolesConfig from '../config/roles.js';
import { PERMISSION_FEATURES, hasPermission as roleHasPermission } from '../config/permissions.js';
import { logger } from '../utils/errorHandler.js';

const SUPERUSER_ROLES = ['systemadmin', 'admin', 'tester'];

const getUserRoles = (user) => {
    const roles = Array.isArray(user?.roles) && user.roles.length > 0 ? user.roles : user?.role ? [user.role] : [];
    return roles;
};

const getOverrideObject = (user) =>
    user?.permissions && typeof user.permissions === 'object' && user.permissions !== null ? user.permissions : {};

const hasExplicitOverride = (overrides, feature) =>
    Object.prototype.hasOwnProperty.call(overrides, feature) && overrides[feature] !== undefined && overrides[feature] !== null;

const normalizePermissions = (permissions) => {
    if (Array.isArray(permissions)) return permissions;
    if (permissions && typeof permissions === 'object') {
        return Object.entries(permissions)
            .filter(([, enabled]) => enabled === true)
            .map(([feature]) => feature);
    }
    return [];
};

// This function can be used to compute permissions on the user object at login
export const getEffectivePermissions = (user) => {
    const permissions = new Set(normalizePermissions(user.permissions));
    const roles = Array.isArray(user.roles) ? user.roles : [];
    roles.forEach(role => {
        const rolePermissions = rolesConfig[role] || [];
        rolePermissions.forEach(p => permissions.add(p));
    });
    return [...permissions];
};

// Maps a role-based permission string to its per-user feature flag so
// overrides configured in the admin PermissionsTab can grant or revoke it.
const PERMISSION_TO_FEATURE = {
    'courseTemplates:read': PERMISSION_FEATURES.COURSE_TEMPLATES,
    'courseTemplates:create': PERMISSION_FEATURES.COURSE_TEMPLATES,
    'courseTemplates:update': PERMISSION_FEATURES.COURSE_TEMPLATES,
    'courseTemplates:delete': PERMISSION_FEATURES.COURSE_TEMPLATES,
    'analytics:read': PERMISSION_FEATURES.STATISTICS,
};

// Effective feature access for a user: an explicit per-user override wins,
// otherwise the role default from the permission matrix is used.
export const hasFeaturePermission = (user, feature) => {
    if (!user) return false;

    const overrides = getOverrideObject(user);
    if (hasExplicitOverride(overrides, feature)) {
        return overrides[feature] === true;
    }

    const roles = getUserRoles(user);
    if (roles.some((r) => SUPERUSER_ROLES.includes(r))) return true;
    return roles.some((r) => roleHasPermission(r, feature));
};

// Middleware to check for a specific feature flag (with per-user override support)
export const canFeature = (feature) => {
    return (req, res, next) => {
        if (!req.user) {
            logger.warn(`Authentication required for access to ${req.originalUrl}`);
            return res.status(401).json({ message: 'Authentication required.' });
        }

        if (hasFeaturePermission(req.user, feature)) {
            return next();
        }

        logger.warn(
            ` Authorization DENIED for user ${req.user.userId || req.user.email || 'unknown'} (${getUserRoles(req.user).join(', ')}) attempting ${req.method} ${req.originalUrl} - Missing feature: "${feature}"`
        );

        return res.status(403).json({ message: 'Forbidden: You do not have the required permission.' });
    };
};

// Middleware to check for a specific permission (role-based, with per-user override support)
export const can = (permission) => {
    return (req, res, next) => {
        // Assuming user object is attached to req by a previous auth middleware
        if (!req.user) {
            logger.warn(`Authentication required for access to ${req.originalUrl}`);
            return res.status(401).json({ message: 'Authentication required.' });
        }

        const roles = Array.isArray(req.user.roles) ? req.user.roles : [];

        const feature = PERMISSION_TO_FEATURE[permission];
        if (feature) {
            const overrides = getOverrideObject(req.user);
            if (hasExplicitOverride(overrides, feature)) {
                if (overrides[feature] === true) {
                    return next();
                }
                logger.warn(
                    ` Authorization DENIED for user ${req.user.userId || req.user.email || 'unknown'} (${roles.join(', ')}) attempting ${req.method} ${req.originalUrl} - Feature revoked: "${feature}"`
                );
                return res.status(403).json({ message: 'Forbidden: You do not have the required permission.' });
            }
        }

        const userForPerms = { roles, permissions: req.user.permissions || [] };
        const effectivePermissions = getEffectivePermissions(userForPerms);

        if (effectivePermissions.includes(permission)) {
            return next();
        }

        // Also check for admin role as a superuser
        if (roles.includes('systemadmin') || roles.includes('admin')) {
            return next();
        }

        logger.warn(
            ` Authorization DENIED for user ${req.user.userId || req.user.email || 'unknown'} (${roles.join(', ')}) attempting ${req.method} ${req.originalUrl} - Missing permission: "${permission}"`
        );

        return res.status(403).json({ message: 'Forbidden: You do not have the required permission.' });
    };
};
