// middleware/auth.js

import { authenticateUser } from "../controllers/authController.js";

// Middleware to ensure user is authenticated
export function isAuthenticated(req, res, next) {
    authenticateUser(req, res, next);
}

// Middleware to check user role (expects req.user.role from authenticateUser)
export function hasRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Check both singular role (virtual) and roles array for multi-role users
    const userRoles = req.user.roles || [];
    const hasRequiredRole = allowedRoles.includes(req.user.role) || userRoles.some(r => allowedRoles.includes(r));
    
    if (!hasRequiredRole) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
