import { describe, it, expect, vi } from "vitest";
import {
    getEffectivePermissions,
    hasFeaturePermission,
    canFeature,
    can,
} from "../../src/middleware/authorization.js";

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
