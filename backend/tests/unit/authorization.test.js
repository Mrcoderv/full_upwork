import { describe, it, expect, vi } from "vitest";
import {
    getEffectivePermissions,
    hasFeaturePermission,
    canFeature,
    can,
} from "../../src/middleware/authorization.js";
import { hasRole } from "../../src/middleware/auth.js";

const buildCtx = (user, method = "GET", originalUrl = "/api/test") => {
    const next = vi.fn();
    const res = {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    const req = {
        method,
        originalUrl,
        ...(user ? { user } : {}),
    };
    return { req, res, next };
};

describe("getEffectivePermissions", () => {
    it("returns an empty array for a user with no roles or permissions", () => {
        expect(getEffectivePermissions({ roles: [], permissions: [] })).toEqual([]);
    });

    it("combines role and individual array permissions", () => {
        const perms = getEffectivePermissions({
            roles: ["admin"],
            permissions: ["extra:perm"],
        });
        expect(perms).toEqual(expect.arrayContaining(["users:create", "analytics:read", "extra:perm"]));
    });

    it("normalizes object-shaped feature permissions into granted strings", () => {
        const perms = getEffectivePermissions({
            roles: [],
            permissions: { statistics: true, search_users: false, course_templates: true },
        });
        expect(perms).toEqual(["statistics", "course_templates"]);
    });

    it("treats non-array non-object permissions as empty", () => {
        expect(getEffectivePermissions({ roles: [], permissions: undefined })).toEqual([]);
        expect(getEffectivePermissions({ roles: [], permissions: null })).toEqual([]);
    });
});

describe("hasFeaturePermission", () => {
    it("denies when no user is provided", () => {
        expect(hasFeaturePermission(undefined, "statistics")).toBe(false);
    });

    it("uses the role default when no per-user override exists", () => {
        expect(hasFeaturePermission({ roles: ["coordinator"] }, "search_users")).toBe(true);
        expect(hasFeaturePermission({ roles: ["coordinator"] }, "statistics")).toBe(false);
    });

    it("honors an explicit grant for a role without the feature", () => {
        const user = { roles: ["coordinator"], permissions: { statistics: true } };
        expect(hasFeaturePermission(user, "statistics")).toBe(true);
    });

    it("honors an explicit revocation for a role that normally has the feature", () => {
        const user = { roles: ["teacher"], permissions: { statistics: false } };
        expect(hasFeaturePermission(user, "statistics")).toBe(false);
    });

    it("always allows superuser roles regardless of the matrix", () => {
        expect(hasFeaturePermission({ roles: ["tester"] }, "statistics")).toBe(true);
        expect(hasFeaturePermission({ roles: ["systemadmin"] }, "add_municipalities_courses")).toBe(true);
    });
});

describe("canFeature middleware", () => {
    it("returns 401 when unauthenticated", () => {
        const { req, res, next } = buildCtx(null);
        canFeature("statistics")(req, res, next);
        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("allows when the role default grants the feature", () => {
        const { req, res, next } = buildCtx({ roles: ["teacher"] });
        canFeature("statistics")(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it("returns 403 when the role default denies the feature", () => {
        const { req, res, next } = buildCtx({ roles: ["coordinator"] });
        canFeature("statistics")(req, res, next);
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("grants a feature via explicit per-user override", () => {
        const { req, res, next } = buildCtx({ roles: ["coordinator"], permissions: { statistics: true } });
        canFeature("statistics")(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it("revokes a feature via explicit per-user override", () => {
        const { req, res, next } = buildCtx({ roles: ["teacher"], permissions: { statistics: false } });
        canFeature("statistics")(req, res, next);
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });
});

describe("can middleware with per-user overrides", () => {
    it("allows a role-based permission as before", () => {
        const { req, res, next } = buildCtx({ roles: ["teacher"] });
        can("courseTemplates:read")(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it("denies a role-based permission without the role", () => {
        const { req, res, next } = buildCtx({ roles: ["coordinator"] });
        can("courseTemplates:read")(req, res, next);
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("grants a mapped permission via explicit per-user override", () => {
        const { req, res, next } = buildCtx({ roles: ["coordinator"], permissions: { course_templates: true } });
        can("courseTemplates:read")(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it("revokes a mapped permission via explicit per-user override even when the role grants it", () => {
        const { req, res, next } = buildCtx({ roles: ["teacher"], permissions: { course_templates: false } });
        can("courseTemplates:read")(req, res, next);
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("ignores overrides for unmapped permissions", () => {
        const { req, res, next } = buildCtx({ roles: ["admin"] });
        can("teachers:read")(req, res, next);
        expect(next).toHaveBeenCalled();
    });
});

describe("role authorization - all seven required roles", () => {
    const ALL_ROLES = ["systemadmin", "admin", "teacher", "coordinator", "syv", "specped", "student"];

    it("hasRole allows access when user has one of the allowed roles", () => {
        const middleware = hasRole(["admin", "systemadmin"]);

        ALL_ROLES.forEach((role) => {
            const req = { user: { role, roles: [role] } };
            const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json() {} };
            const next = vi.fn();

            if (["admin", "systemadmin"].includes(role)) {
                middleware(req, res, next);
                expect(next).toHaveBeenCalled();
            }
        });
    });

    it("hasRole denies access when user role is not in allowed list", () => {
        const middleware = hasRole(["admin"]);
        const req = { user: { role: "student", roles: ["student"] } };
        const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json() {} };
        const next = vi.fn();

        middleware(req, res, next);
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("hasRole checks roles array for multi-role users", () => {
        const middleware = hasRole(["admin"]);
        const req = { user: { role: "teacher", roles: ["teacher", "admin"] } };
        const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json() {} };
        const next = vi.fn();

        middleware(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it("hasRole returns 401 when no user is present", () => {
        const middleware = hasRole(["admin"]);
        const req = {};
        const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json() {} };
        const next = vi.fn();

        middleware(req, res, next);
        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    it("coordinator does not have courseTemplates:read by default", () => {
        const { req, res, next } = buildCtx({ roles: ["coordinator"] });
        can("courseTemplates:read")(req, res, next);
        expect(res.statusCode).toBe(403);
    });

    it("syv has search_users feature by default", () => {
        expect(hasFeaturePermission({ roles: ["syv"] }, "search_users")).toBe(true);
    });

    it("specped has search_users feature by default", () => {
        expect(hasFeaturePermission({ roles: ["specped"] }, "search_users")).toBe(true);
    });

    it("student does not have search_users feature", () => {
        expect(hasFeaturePermission({ roles: ["student"] }, "search_users")).toBe(false);
    });

    it("student has own_settings feature", () => {
        expect(hasFeaturePermission({ roles: ["student"] }, "own_settings")).toBe(true);
    });

    it("student has viewOwnGrades permission", () => {
        const perms = getEffectivePermissions({ roles: ["student"], permissions: [] });
        expect(perms).toContain("viewOwnGrades");
    });

    it("teacher has assignments:grade permission", () => {
        const perms = getEffectivePermissions({ roles: ["teacher"], permissions: [] });
        expect(perms).toContain("assignments:grade");
    });

    it("systemadmin has all admin permissions plus teacher permissions", () => {
        const perms = getEffectivePermissions({ roles: ["systemadmin"], permissions: [] });
        expect(perms).toContain("users:create");
        expect(perms).toContain("assignments:grade");
        expect(perms).toContain("analytics:read");
    });
});

describe("individual permission overrides - privilege escalation prevention", () => {
    it("cannot escalate student to admin via permission overrides alone", () => {
        const user = { roles: ["student"], permissions: { manage_users_permissions: true } };
        expect(hasFeaturePermission(user, "manage_users_permissions")).toBe(true);
        // But role-based RBAC should still deny admin-level resources
        const perms = getEffectivePermissions(user);
        expect(perms).toContain("manage_users_permissions");
        expect(perms).not.toContain("users:create");
    });

    it("override granting statistics to coordinator works", () => {
        const user = { roles: ["coordinator"], permissions: { statistics: true } };
        expect(hasFeaturePermission(user, "statistics")).toBe(true);
    });

    it("override revoking search_users from admin works", () => {
        const user = { roles: ["admin"], permissions: { search_users: false } };
        expect(hasFeaturePermission(user, "search_users")).toBe(false);
    });

    it("explicit override wins over superuser default in hasFeaturePermission", () => {
        // When an admin/systemadmin explicitly revokes a feature, the override wins
        // This ensures admins can restrict specific features even for superusers
        const user = { roles: ["systemadmin"], permissions: { search_users: false } };
        expect(hasFeaturePermission(user, "search_users")).toBe(false);
        // But statistics was not explicitly overridden, so superuser default applies
        expect(hasFeaturePermission(user, "statistics")).toBe(true);
    });

    it("empty override object does not change defaults", () => {
        const user = { roles: ["teacher"], permissions: {} };
        expect(hasFeaturePermission(user, "statistics")).toBe(true);
        expect(hasFeaturePermission(user, "manage_users_permissions")).toBe(false);
    });

    it("getEffectivePermissions combines role + overrides correctly", () => {
        const user = { roles: ["coordinator"], permissions: { statistics: true, course_templates: true } };
        const perms = getEffectivePermissions(user);
        expect(perms).toContain("statistics");
        expect(perms).toContain("course_templates");
        expect(perms).toContain("analytics:read");
        expect(perms).not.toContain("users:create");
    });

    it("canFeature middleware respects per-user overrides for student role", () => {
        const { req, res, next } = buildCtx({ roles: ["student"], permissions: { search_users: true } });
        canFeature("search_users")(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it("canFeature denies student with no search override", () => {
        const { req, res, next } = buildCtx({ roles: ["student"] });
        canFeature("search_users")(req, res, next);
        expect(res.statusCode).toBe(403);
    });
});

describe("can middleware - privilege escalation prevention", () => {
    it("admin bypasses all permission checks", () => {
        const { req, res, next } = buildCtx({ roles: ["admin"] });
        can("nonexistent:perm")(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it("systemadmin bypasses all permission checks", () => {
        const { req, res, next } = buildCtx({ roles: ["systemadmin"] });
        can("nonexistent:perm")(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it("student cannot access teacher-only permission", () => {
        const { req, res, next } = buildCtx({ roles: ["student"] });
        can("assignments:grade")(req, res, next);
        expect(res.statusCode).toBe(403);
    });

    it("teacher cannot access admin-only permission", () => {
        const { req, res, next } = buildCtx({ roles: ["teacher"] });
        can("users:create")(req, res, next);
        expect(res.statusCode).toBe(403);
    });

    it("coordinator cannot access teacher permission without override", () => {
        const { req, res, next } = buildCtx({ roles: ["coordinator"] });
        can("assignments:create")(req, res, next);
        expect(res.statusCode).toBe(403);
    });
});
