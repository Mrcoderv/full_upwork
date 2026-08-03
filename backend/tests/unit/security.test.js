import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    vi,
    beforeAll,
    afterAll,
} from "vitest";
import { AUTH_COOKIE_NAME } from "../../src/config/cookies.js";

vi.mock("express-rate-limit", () => ({
    __esModule: true,
    default: vi.fn((opts) => ({
        options: opts,
        handler: opts.handler,
        skip: opts.skip,
        resetKey: vi.fn(),
        getKey: vi.fn(),
    })),
}));

let enhancedRBAC;
let enhancedAuth;
let requestLogger;
let corsConfig;
let securityAudit;
let createRateLimiter;
let rateLimiter;
let inputValidator;

const originalNodeEnv = process.env.NODE_ENV;
const securityModuleBaseUrl = new URL(
    "../../src/middleware/security.js",
    import.meta.url
);

const loadSecurityModule = async (env, tag) => {
    process.env.NODE_ENV = env;
    const url = new URL(securityModuleBaseUrl.href);
    url.searchParams.set("env", `${env}-${tag}`);
    return import(url.href);
};

beforeAll(async () => {
    await loadSecurityModule("development", "dev");
    const module = await loadSecurityModule("test", "test");
    enhancedRBAC = module.enhancedRBAC;
    enhancedAuth = module.enhancedAuth;
    requestLogger = module.requestLogger;
    corsConfig = module.corsConfig;
    securityAudit = module.securityAudit;
    createRateLimiter = module.createRateLimiter;
    rateLimiter = module.rateLimiter;
    inputValidator = module.inputValidator;
});

afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
});
import { logger, AppError, AuthorizationError } from "../../src/utils/errorHandler.js";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const buildReq = (overrides = {}) => ({
    method: "POST",
    url: "/api/test",
    path: "/api/test",
    ip: "127.0.0.1",
    headers: {},
    body: {},
    params: {},
    cookies: {},
    get(key) {
        return this.headers[key] || "";
    },
    ...overrides,
});

const buildRes = () => {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        on() {},
    };
    return res;
};

describe("security middleware helpers", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("enhanced RBAC respects role hierarchy and permissions", () => {
        expect(enhancedRBAC.hasRole("admin", "teacher")).toBe(true);
        expect(enhancedRBAC.hasRole("teacher", "admin")).toBe(false);
        expect(enhancedRBAC.hasPermission("systemadmin", "any", "anything")).toBe(true);
        expect(enhancedRBAC.hasPermission("student", "write", "own_profile")).toBe(true);
        expect(enhancedRBAC.hasPermission("student", "write", "grades")).toBe(false);
        expect(enhancedRBAC.hasPermission("teacher", "write", "grades")).toBe(true);
        expect(
            enhancedRBAC.canAccess(
                { userId: "123", role: "student" },
                "write",
                "own_profile",
                "123"
            )
        ).toBe(true);
        expect(
            enhancedRBAC.canAccess(
                { userId: "123", role: "teacher" },
                "write",
                "grades"
            )
        ).toBe(true);
    });

    it("enhancedAuth throws when token is missing", () => {
        const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
        expect(() => enhancedAuth.verifyToken()).toThrow(AppError);
        expect(loggerSpy).toHaveBeenCalled();
    });

    it("enhancedAuth verifies presence of token", () => {
        expect(enhancedAuth.verifyToken("token")).toBe(true);
    });

    it("isAuthenticated errors when user missing", () => {
        const next = vi.fn();
        const req = buildReq();
        enhancedAuth.isAuthenticated(req, buildRes(), next);
        expect(next).toHaveBeenCalled();
        const error = next.mock.calls[0][0];
        expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("isAuthenticated forwards when user present", () => {
        const next = vi.fn();
        enhancedAuth.isAuthenticated(
            buildReq({ user: { userId: "1", role: "student" } }),
            buildRes(),
            next
        );
        expect(next).toHaveBeenCalledWith();
    });

    it("hasRole enforces required role", () => {
        const next = vi.fn();
        const middleware = enhancedAuth.hasRole("admin");
        middleware(
            buildReq({ user: { userId: "1", role: "teacher" }, path: "/test" }),
            buildRes(),
            next
        );
        expect(next.mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
    });

    it("hasRole allows matching role", () => {
        const next = vi.fn();
        const middleware = enhancedAuth.hasRole("teacher");
        middleware(
            buildReq({ user: { userId: "1", role: "teacher" } }),
            buildRes(),
            next
        );
        expect(next).toHaveBeenCalledWith();
    });

    it("hasRole requires authentication before role check", () => {
        const next = vi.fn();
        const middleware = enhancedAuth.hasRole("teacher");
        middleware(buildReq(), buildRes(), next);
        expect(next.mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
        expect(next.mock.calls[0][0].message).toContain("Authentication required");
    });

    it("hasPermission errors when not allowed", () => {
        const next = vi.fn();
        const middleware = enhancedAuth.hasPermission("write", "grades");
        middleware(
            buildReq({ user: { userId: "1", role: "student" } }),
            buildRes(),
            next
        );
        expect(next.mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
    });

    it("hasPermission respects ownership", () => {
        const next = vi.fn();
        const middleware = enhancedAuth.hasPermission("write", "own_profile");
        middleware(
            buildReq({
                user: { userId: "42", role: "student" },
                params: { userId: "42" },
            }),
            buildRes(),
            next
        );
        expect(next).toHaveBeenCalledWith();
    });

    it("hasPermission requires authentication", () => {
        const next = vi.fn();
        const middleware = enhancedAuth.hasPermission("read", "grades");
        middleware(buildReq(), buildRes(), next);
        expect(next.mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
    });

    it("requestLogger logs info and warn based on status", () => {
        const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        const finishHandlers = [];
        const res = {
            statusCode: 200,
            get: () => "UA",
            on: (event, handler) => finishHandlers.push(handler),
        };
        requestLogger(buildReq({ user: { userId: "1", role: "teacher" } }), res, vi.fn());
        finishHandlers.forEach((handler) => handler());
        expect(infoSpy).toHaveBeenCalled();

        res.statusCode = 400;
        finishHandlers.forEach((handler) => handler());
        expect(warnSpy).toHaveBeenCalled();
    });

    it("corsConfig allows configured origins and blocks others", () => {
        const cb = vi.fn();
        corsConfig.origin("https://mindfullearning.se", cb);
        expect(cb).toHaveBeenCalledWith(null, true);

        const warnSpy = vi
            .spyOn(logger, "warn")
            .mockImplementation(() => {});
        corsConfig.origin("https://evil.com", cb);
        expect(warnSpy).toHaveBeenCalled();
        const error = cb.mock.calls[1][0];
        expect(error).toBeInstanceOf(AppError);
        expect(error.message).toBe("Not allowed by CORS");
    });

    it("corsConfig blocks no-origin requests in production", () => {
        const original = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        const cb = vi.fn();
        const warnSpy = vi
            .spyOn(logger, "warn")
            .mockImplementation(() => {});
        corsConfig.origin(undefined, cb);
        expect(warnSpy).toHaveBeenCalled();
        const error = cb.mock.calls[0][0];
        expect(error).toBeInstanceOf(AppError);
        expect(error.message).toBe("CORS: No Origin header");
        expect(error.statusCode).toBe(403);
        process.env.NODE_ENV = original;
    });

    it("corsConfig allows no-origin requests in non-production", () => {
        const cb = vi.fn();
        corsConfig.origin(undefined, cb);
        expect(cb).toHaveBeenCalledWith(null, true);
    });

    it("securityAudit detects suspicious payloads", () => {
        const res = buildRes();
        const next = vi.fn();
        const req = buildReq({
            body: { comment: "<script>alert(1)</script>" },
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer abc",
                "User-Agent": "UA",
            },
        });
        securityAudit(req, res, next);
        expect(res.statusCode).toBe(400);
        expect(res.body.error.message).toBe("Invalid request detected");
        expect(next).not.toHaveBeenCalled();
    });

    it("securityAudit passes clean requests", () => {
        const next = vi.fn();
        securityAudit(buildReq({ url: "/safe" }), buildRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it("securityAudit rejects suspicious URLs even without body", () => {
        const res = buildRes();
        const next = vi.fn();
        securityAudit(
            buildReq({ url: "/api?next=javascript:alert(1)" }),
            res,
            next
        );
        expect(res.statusCode).toBe(400);
        expect(next).not.toHaveBeenCalled();
    });

    it("securityAudit tolerates missing URL values", () => {
        const next = vi.fn();
        securityAudit(buildReq({ url: undefined }), buildRes(), next);
        expect(next).toHaveBeenCalled();
    });

    it("createRateLimiter skip and handler behave as expected", () => {
        const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        const custom = createRateLimiter(1000, 1, "Boom");
        const skip = custom.options?.skip;
        expect(typeof skip).toBe("function");
        const allowed = skip({
            user: { role: "admin", userId: "1" },
            cookies: {},
        });
        expect(allowed).toBe(true);
        expect(infoSpy).toHaveBeenCalled();

        const handler =
            custom.options?.handler ?? custom.handler ?? (() => {});
        const res = {
            statusCode: 200,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json: vi.fn(),
        };
        handler(buildReq(), res);
        expect(warnSpy).toHaveBeenCalled();
        expect(res.statusCode).toBe(429);
        expect(res.json.mock.calls[0][0].error.retryAfter).toBe(1);
    });

    describe("base rate limiter skip logic", () => {
        afterEach(() => {
            delete process.env.JWT_SECRET;
        });

        it("skips when request user is admin", () => {
            const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
            const skip = rateLimiter.options?.skip;
            expect(skip).toBeDefined();
            const allowed = skip(buildReq({ user: { userId: "1", role: "admin" } }));
            expect(allowed).toBe(true);
            expect(infoSpy).toHaveBeenCalled();
        });

        it("skips when JWT token shows admin", () => {
            process.env.JWT_SECRET = "secret";
            const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET);
            const skip = rateLimiter.options?.skip;
            expect(skip).toBeDefined();
            const allowed = skip(buildReq({ cookies: { [AUTH_COOKIE_NAME]: token } }));
            expect(allowed).toBe(true);
        });

        it("rejects invalid tokens gracefully", () => {
            process.env.JWT_SECRET = "secret";
            const debugSpy = vi
                .spyOn(logger, "debug")
                .mockImplementation(() => {});
            const skip = rateLimiter.options?.skip;
            expect(skip).toBeDefined();
            const allowed = skip(buildReq({ cookies: { [AUTH_COOKIE_NAME]: "bad" } }));
            expect(allowed).toBe(false);
            expect(debugSpy).toHaveBeenCalled();
        });

        it("logs when JWT_SECRET is missing", () => {
            const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
            const skip = rateLimiter.options?.skip;
            expect(skip).toBeDefined();
            const allowed = skip(buildReq({ cookies: { [AUTH_COOKIE_NAME]: "abc" } }));
            expect(allowed).toBe(false);
            expect(errorSpy).toHaveBeenCalled();
        });

        it("handles unexpected errors in admin check", () => {
            const debugSpy = vi
                .spyOn(logger, "debug")
                .mockImplementation(() => {});
            const skip = rateLimiter.options?.skip;
            const req = {
                get cookies() {
                    throw new Error("boom");
                },
            };
            const allowed = skip?.(req);
            expect(allowed).toBe(false);
            expect(debugSpy).toHaveBeenCalled();
        });
    });

    describe("inputValidator helpers", () => {
        it("validates email boundaries and rejects bad patterns", () => {
            expect(inputValidator.validateEmail(123)).toBe(false);
            expect(inputValidator.validateEmail("alice..bob@example.com")).toBe(
                false
            );
            expect(
                inputValidator.validateEmail("alice.@example.com")
            ).toBe(false);
            expect(
                inputValidator.validateEmail("alice@.example.com")
            ).toBe(false);
            expect(
                inputValidator.validateEmail("alice@example.com")
            ).toBe(true);
        });

        it("validates password strength and reports errors", () => {
            const result = inputValidator.validatePassword("weak");
            expect(result.isValid).toBe(false);
            expect(result.errors.uppercase).toBeDefined();
            expect(result.errors.lowercase).toBeNull();
            expect(result.errors.length).toContain("at least");

            const strong = inputValidator.validatePassword("GoodPass1!");
            expect(strong.isValid).toBe(true);
            expect(strong.errors.numbers).toBeNull();
        });

        it("rejects emails with leading or trailing dots in local/domain parts", () => {
            expect(
                inputValidator.validateEmail(".alice@example.com")
            ).toBe(false);
            expect(
                inputValidator.validateEmail("alice@example.com.")
            ).toBe(false);
        });
    });
});

describe("rate limiter behavior", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.JWT_SECRET = "test-secret";
    });

    it("adjusts base rate limiter for test env and exposes skip hook", () => {
        expect(rateLimiter.options.windowMs).toBe(60 * 1000);
        expect(rateLimiter.options.max).toBe(3);
        expect(typeof rateLimiter.options.skip).toBe("function");
    });

    it("rate limit skip returns true for admin users", () => {
        const skipResult = rateLimiter.options.skip(
            buildReq({ user: { role: "admin" }, cookies: {} })
        );
        expect(skipResult).toBe(true);
    });

    it("rate limit skip verifies token and logs on success", () => {
        const token = "token";
        const decoded = { role: "admin" };
        vi.spyOn(jwt, "verify").mockReturnValueOnce(decoded);
        const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
        const skipResult = rateLimiter.options.skip(
            buildReq({ cookies: { [AUTH_COOKIE_NAME]: token } })
        );
        expect(skipResult).toBe(true);
        expect(infoSpy).toHaveBeenCalledWith(
            `✅ Rate limit SKIPPED: Token shows user is ${decoded.role}`
        );
    });

    it("rate limit skip logs debug when JWT verification fails", () => {
        vi.spyOn(jwt, "verify").mockImplementation(() => {
            throw new Error("unexpected");
        });
        const debugSpy = vi.spyOn(logger, "debug").mockImplementation(() => {});
        const skipResult = rateLimiter.options.skip(
            buildReq({ cookies: { [AUTH_COOKIE_NAME]: "bad" } })
        );
        expect(skipResult).toBe(false);
        expect(debugSpy).toHaveBeenCalled();
    });

    it("rate limit skip logs error when JWT_SECRET missing", () => {
        const originalSecret = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
        const skipResult = rateLimiter.options.skip(
            buildReq({ cookies: { [AUTH_COOKIE_NAME]: "token" } })
        );
        expect(skipResult).toBe(false);
        expect(errorSpy).toHaveBeenCalledWith("❌ JWT_SECRET is not defined!");
        process.env.JWT_SECRET = originalSecret;
    });

    it("rate limit skip catches unexpected errors while inspecting cookies", () => {
        const req = {};
        Object.defineProperty(req, "cookies", {
            get() {
                throw new Error("boom");
            },
        });
        const debugSpy = vi.spyOn(logger, "debug").mockImplementation(() => {});
        const skipResult = rateLimiter.options.skip(req);
        expect(skipResult).toBe(false);
        expect(debugSpy).toHaveBeenCalledWith(
            expect.stringMatching(/Error checking admin status/)
        );
    });

    it("createRateLimiter exposes handler and skip options", () => {
        const limiter = createRateLimiter(1000, 1, "stop");
        expect(limiter.options.windowMs).toBe(1000);
        expect(typeof limiter.options.handler).toBe("function");
        expect(typeof limiter.options.skip).toBe("function");
        const skipResult = limiter.options.skip(
            buildReq({ user: { role: "systemadmin" }, cookies: {} })
        );
        expect(skipResult).toBe(true);
    });

    it("createRateLimiter handler responds with 429 payload", () => {
        const limiter = createRateLimiter(1000, 1, "blocked");
        const res = buildRes();
        limiter.options.handler(
            buildReq({ ip: "1.2.3.4" }),
            res
        );
        expect(res.statusCode).toBe(429);
        expect(res.body.success).toBe(false);
        expect(res.body.error.retryAfter).toBe(Math.ceil(1000 / 1000));
    });

    it("createRateLimiter handler falls back to default message when unset", () => {
        const limiter = createRateLimiter(1000, 1);
        const res = buildRes();
        limiter.options.handler(buildReq({ ip: "1.2.3.4" }), res);
        expect(res.body.error.message).toBe(
            "Too many requests, please try again later."
        );
    });
});
