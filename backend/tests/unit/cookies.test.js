import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    AUTH_COOKIE_NAME,
    AUTH_COOKIE_OPTIONS,
    setAuthCookie,
    clearAuthCookie,
} from "../../src/config/cookies.js";

const buildRes = () => {
    const res = {
        cookies: {},
        cleared: undefined,
        cookie(name, value, opts) {
            this.cookies[name] = { value, opts };
        },
        clearCookie(name, opts) {
            this.cleared = { name, opts };
        },
    };
    return res;
};

describe("cookies config", () => {
    it("AUTH_COOKIE_NAME is 'token'", () => {
        expect(AUTH_COOKIE_NAME).toBe("token");
    });

    it("AUTH_COOKIE_OPTIONS has httpOnly: true", () => {
        expect(AUTH_COOKIE_OPTIONS.httpOnly).toBe(true);
    });

    it("AUTH_COOKIE_OPTIONS has sameSite: 'strict'", () => {
        expect(AUTH_COOKIE_OPTIONS.sameSite).toBe("strict");
    });

    it("AUTH_COOKIE_OPTIONS has path: '/'", () => {
        expect(AUTH_COOKIE_OPTIONS.path).toBe("/");
    });

    it("AUTH_COOKIE_OPTIONS.secure is false when NODE_ENV is not production", () => {
        const original = process.env.NODE_ENV;
        process.env.NODE_ENV = "test";
        // Re-import to pick up the env change
        // Note: the module-level constant is evaluated at import time,
        // so we assert against the current value directly
        expect(AUTH_COOKIE_OPTIONS.secure).toBe(false);
        process.env.NODE_ENV = original;
    });
});

describe("setAuthCookie", () => {
    it("sets the cookie with AUTH_COOKIE_NAME and shared options plus maxAge", () => {
        const res = buildRes();
        const token = "jwt-token-123";

        setAuthCookie(res, token);

        expect(res.cookies[AUTH_COOKIE_NAME]).toBeDefined();
        expect(res.cookies[AUTH_COOKIE_NAME].value).toBe(token);
        expect(res.cookies[AUTH_COOKIE_NAME].opts).toEqual({
            ...AUTH_COOKIE_OPTIONS,
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
    });

    it("always sets httpOnly: true", () => {
        const res = buildRes();
        setAuthCookie(res, "t");
        expect(res.cookies[AUTH_COOKIE_NAME].opts.httpOnly).toBe(true);
    });

    it("always sets sameSite: 'strict'", () => {
        const res = buildRes();
        setAuthCookie(res, "t");
        expect(res.cookies[AUTH_COOKIE_NAME].opts.sameSite).toBe("strict");
    });
});

describe("clearAuthCookie", () => {
    it("clears the cookie with AUTH_COOKIE_NAME and shared options", () => {
        const res = buildRes();
        clearAuthCookie(res);

        expect(res.cleared).toBeDefined();
        expect(res.cleared.name).toBe(AUTH_COOKIE_NAME);
        expect(res.cleared.opts).toEqual(AUTH_COOKIE_OPTIONS);
    });

    it("always sets httpOnly: true when clearing", () => {
        const res = buildRes();
        clearAuthCookie(res);
        expect(res.cleared.opts.httpOnly).toBe(true);
    });

    it("always sets sameSite: 'strict' when clearing", () => {
        const res = buildRes();
        clearAuthCookie(res);
        expect(res.cleared.opts.sameSite).toBe("strict");
    });
});
