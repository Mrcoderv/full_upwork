
import rolesConfig from '../config/roles.js';
import { logger } from '../utils/errorHandler.js';

// This function can be used to compute permissions on the user object at login
export const getEffectivePermissions = (user) => {
  const permissions = new Set(user.permissions);
  const roles = Array.isArray(user.roles) ? user.roles : [];
  roles.forEach(role => {
    const rolePermissions = rolesConfig[role] || [];
    rolePermissions.forEach(p => permissions.add(p));
  });
  return [...permissions];
};

// Middleware to check for a specific permission
export const can = (permission) => {
  return (req, res, next) => {
    // Assuming user object is attached to req by a previous auth middleware
    if (!req.user) {
      logger.warn(`🚫 Authentication required for access to ${req.originalUrl}`);
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const roles = Array.isArray(req.user.roles) ? req.user.roles : [];
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
      `🚫 Authorization DENIED for user ${req.user.userId || req.user.email || 'unknown'} (${roles.join(', ')}) attempting ${req.method} ${req.originalUrl} - Missing permission: "${permission}"`
    );

    return res.status(403).json({ message: 'Forbidden: You do not have the required permission.' });
  };
};
