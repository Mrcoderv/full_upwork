import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    vi,
} from "vitest";

vi.mock("../../src/utils/logger.js", () => {
    return {
        default: {
            error: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        },
    };
});

import {
    AppError,
    AuthorizationError,
    AuthenticationError,
    ConflictError,
    NotFoundError,
    ValidationError,
    asyncHandler,
    errorMonitor,
    globalErrorHandler,
    performanceMonitor,
    rateLimitErrorHandler,
    logger,
} from "../../src/utils/errorHandler.js";

const buildReq = (overrides = {}) => ({
    method: "GET",
    url: "/api/test",
    path: "/api/test",
    ip: "127.0.0.1",
    get: () => "TestAgent",
    user: { userId: "user-1" },
    ...overrides,
});

const buildRes = () => {
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
        end: vi.fn(),
    };
    return res;
};

describe("errorHandler utilities", () => {
    beforeEach(() => {
        errorMonitor.resetMetrics();
        vi.restoreAllMocks();
    });

    it("creates proper app error subclasses", () => {
        const base = new AppError("Nah", 418, false);
        expect(base.statusCode).toBe(418);
        expect(base.status).toBe("fail");
        expect(base.isOperational).toBe(false);

        expect(new ValidationError("Bad", ["a"])).toMatchObject({
            statusCode: 400,
            errors: ["a"],
        });
        expect(new AuthenticationError().statusCode).toBe(401);
        expect(new AuthorizationError().statusCode).toBe(403);
        expect(new NotFoundError("Thing").message).toBe("Thing not found");
        expect(new ConflictError().statusCode).toBe(409);
    });

    it("records errors and honors Sentry configuration", () => {
        const error = new AppError("boom", 500);
        const req = buildReq();
        const loggerSpy = vi.spyOn(logger, "error");
        const loggerInfoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});

        process.env.SENTRY_DSN = "https://dsn";
        errorMonitor.recordError(error, req);
        delete process.env.SENTRY_DSN;

        expect(errorMonitor.errorCounts.size).toBe(1);
        expect(errorMonitor.performanceMetrics.errorCount).toBe(1);
        expect(loggerSpy).toHaveBeenCalled();
        expect(loggerInfoSpy).toHaveBeenCalledWith(
            { error: error.message },
            "Sending error to Sentry"
        );
    });

    it("records errors without request context", () => {
        const error = new AppError("bare", 400);
        const loggerSpy = vi.spyOn(logger, "error");

        errorMonitor.recordError(error);

        expect(loggerSpy).toHaveBeenCalledWith(
            "Application Error",
            expect.objectContaining({
                request: null,
            })
        );
    });

    it("records performance metrics and enforces slow query caps", () => {
        errorMonitor.resetMetrics();
        errorMonitor.performanceMetrics.slowQueries = new Array(100).fill({
            operation: "old",
            duration: 1500,
            timestamp: "old",
        });

        errorMonitor.recordPerformance("GET /test", 1500, false);
        errorMonitor.recordError(new AppError("boom", 500), buildReq());

        expect(errorMonitor.performanceMetrics.slowQueries).toHaveLength(100);
        expect(errorMonitor.performanceMetrics.requestCount).toBe(1);
        expect(errorMonitor.performanceMetrics.errorCount).toBe(2);

        const stats = errorMonitor.getErrorStats();
        expect(stats.totalErrors).toBe(2);
        expect(stats.errorRate).toBe("200.00");
        expect(Array.isArray(stats.topErrors)).toBe(true);

        errorMonitor.resetMetrics();
        expect(errorMonitor.errorCounts.size).toBe(0);
    });

    it("keeps only the latest 100 slow queries", () => {
        errorMonitor.resetMetrics();
        errorMonitor.performanceMetrics.slowQueries = new Array(100).fill({
            operation: "old",
            duration: 2000,
            timestamp: "old",
        });

        errorMonitor.recordPerformance("GET /slow", 1501, true);

        expect(errorMonitor.performanceMetrics.slowQueries).toHaveLength(100);
        expect(
            errorMonitor.performanceMetrics.slowQueries.some(
                (entry) => entry.operation === "GET /slow"
            )
        ).toBe(true);
    });

    it("produces top error ordering", () => {
        errorMonitor.resetMetrics();
        errorMonitor.recordError(new AppError("alpha", 400), buildReq());
        errorMonitor.recordError(new AppError("beta", 500), buildReq());

        const stats = errorMonitor.getErrorStats();
        expect(stats.topErrors.length).toBeGreaterThan(0);
    });

    it("handles async errors through asyncHandler", async () => {
        const error = new Error("boom");
        const fn = vi.fn(() => Promise.reject(error));
        const next = vi.fn();

        const handler = asyncHandler(fn);
        await handler(buildReq(), buildRes(), next);
        expect(next).toHaveBeenCalledWith(error);
    });
});

describe("global error handler", () => {
    beforeEach(() => {
        errorMonitor.resetMetrics();
        process.env.NODE_ENV = "development";
    });

    afterEach(() => {
        delete process.env.NODE_ENV;
        errorMonitor.resetMetrics();
    });

    const scenarios = [
        {
            name: "CastError",
            error: { name: "CastError", message: "bad cast", stack: "stack" },
            status: 404,
            message: "Resource not found not found",
        },
        {
            name: "duplicate key",
            error: { code: 11000, message: "dup", stack: "stack" },
            status: 409,
            message: "Duplicate field value entered",
        },
        {
            name: "validation",
            error: {
                name: "ValidationError",
                message: "failed",
                errors: { field: { message: "oops" } },
                stack: "stack",
            },
            status: 400,
            message: "oops",
        },
        {
            name: "jwt",
            error: { name: "JsonWebTokenError", message: "jwt", stack: "stack" },
            status: 401,
            message: "Invalid token",
        },
        {
            name: "token expired",
            error: { name: "TokenExpiredError", message: "exp", stack: "stack" },
            status: 401,
            message: "Token expired",
        },
        {
            name: "fallback",
            error: { name: "OtherError", message: "cool", statusCode: 418, stack: "stack" },
            status: 418,
            message: "cool",
        },
    ];

    for (const scenario of scenarios) {
        it(`responds for ${scenario.name}`, () => {
            const req = buildReq();
            const res = buildRes();

            globalErrorHandler(scenario.error, req, res);

            expect(res.statusCode).toBe(scenario.status);
            expect(res.body.error.message).toBe(scenario.message);
            expect(res.body.error.stack).toBe("stack");
            expect(res.body.timestamp).toBeDefined();
            expect(res.body.path).toBe("/api/test");
        });
    }

    it("uses defaults when error lacks status/message", () => {
        const req = buildReq();
        const res = buildRes();
        const fallbackError = new Error("");
        fallbackError.stack = "stack";

        globalErrorHandler(fallbackError, req, res);

        expect(res.statusCode).toBe(500);
        expect(res.body.error.message).toBe("Server Error");
        expect(res.body.error.stack).toBe("stack");
    });

    it("falls back to generic status/message when error omits them entirely", () => {
        const req = buildReq();
        const res = buildRes();
        const bareError = { stack: "stack" };

        globalErrorHandler(bareError, req, res);

        expect(res.statusCode).toBe(500);
        expect(res.body.error.message).toBe("Server Error");
        expect(res.body.error.stack).toBe("stack");
    });
});

describe("performance & rate limit middlewares", () => {
    afterEach(() => {
        errorMonitor.resetMetrics();
    });

    it("records performance from response end", () => {
        const req = buildReq();
        const res = buildRes();
        const perfSpy = vi.spyOn(errorMonitor, "recordPerformance");

        performanceMonitor(req, res, vi.fn());

        res.end();
        expect(perfSpy).toHaveBeenCalled();
    });

    it("retains slow queries when under cap", () => {
        errorMonitor.resetMetrics();

        errorMonitor.recordPerformance("GET /short", 1500);

        expect(errorMonitor.performanceMetrics.slowQueries).toHaveLength(1);
    });

    it("guards rate limit errors", () => {
        const req = buildReq();
        const res = buildRes();
        const recordSpy = vi.spyOn(errorMonitor, "recordError");

        rateLimitErrorHandler(req, res);

        expect(recordSpy).toHaveBeenCalled();
        expect(res.statusCode).toBe(429);
        expect(res.body.error.message).toContain("Too many requests");
    });
});
