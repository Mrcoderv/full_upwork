import logger from "./logger.js";

// Custom error classes
export class AppError extends Error {
    constructor(message, statusCode, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";

        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(message, errors = []) {
        super(message, 400);
        this.errors = errors;
    }
}

export class AuthenticationError extends AppError {
    constructor(message = "Authentication failed") {
        super(message, 401);
    }
}

export class AuthorizationError extends AppError {
    constructor(message = "Access denied") {
        super(message, 403);
    }
}

export class NotFoundError extends AppError {
    constructor(resource = "Resource") {
        super(`${resource} not found`, 404);
    }
}

export class ConflictError extends AppError {
    constructor(message = "Resource conflict") {
        super(message, 409);
    }
}

// Error monitoring and reporting
export const errorMonitor = {
    // Track error frequency
    errorCounts: new Map(),

    // Track performance metrics
    performanceMetrics: {
        requestCount: 0,
        errorCount: 0,
        averageResponseTime: 0,
        slowQueries: [],
    },

    // Per-route latency histogram (lightweight, in-memory). Buckets in ms:
    // [<10, <50, <100, <250, <500, <1000, <2000, <5000, >=5000]
    routeLatency: new Map(),

    // Record an error
    recordError(error, req = null) {
        const errorKey = `${error.constructor.name}:${error.message}`;
        const currentCount = this.errorCounts.get(errorKey) || 0;
        this.errorCounts.set(errorKey, currentCount + 1);

        this.performanceMetrics.errorCount++;

        // Log error with context
        logger.error("Application Error", {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
                statusCode: error.statusCode,
                isOperational: error.isOperational,
            },
            request: req
                ? {
                      method: req.method,
                      url: req.url,
                      ip: req.ip,
                      userAgent: req.get("User-Agent"),
                      userId: req.user?.userId,
                  }
                : null,
            timestamp: new Date().toISOString(),
            count: currentCount + 1,
        });

        // Send to external monitoring service if configured
        if (process.env.SENTRY_DSN) {
            logger.info({ error: error.message }, "Sending error to Sentry");
        }
    },

    // Record performance metrics
    recordPerformance(operation, duration, success = true) {
        this.performanceMetrics.requestCount++;

        if (!success) {
            this.performanceMetrics.errorCount++;
        }

        // Track slow queries
        if (duration > 1000) {
            // 1 second threshold
            this.performanceMetrics.slowQueries.push({
                operation,
                duration,
                timestamp: new Date().toISOString(),
            });

            // Keep only last 100 slow queries
            if (this.performanceMetrics.slowQueries.length > 100) {
                this.performanceMetrics.slowQueries.shift();
            }
        }

        // Update average response time
        const currentAvg = this.performanceMetrics.averageResponseTime;
        const totalRequests = this.performanceMetrics.requestCount;
        this.performanceMetrics.averageResponseTime =
            (currentAvg * (totalRequests - 1) + duration) / totalRequests;

        // Per-route latency histogram
        const bucketBoundaries = [10, 50, 100, 250, 500, 1000, 2000, 5000];
        const entry = this.routeLatency.get(operation) || {
            count: 0,
            errorCount: 0,
            totalMs: 0,
            maxMs: 0,
            buckets: new Array(bucketBoundaries.length + 1).fill(0),
        };
        entry.count++;
        if (!success) entry.errorCount++;
        entry.totalMs += duration;
        if (duration > entry.maxMs) entry.maxMs = duration;
        let bucketIndex = bucketBoundaries.length;
        for (let i = 0; i < bucketBoundaries.length; i++) {
            if (duration < bucketBoundaries[i]) {
                bucketIndex = i;
                break;
            }
        }
        entry.buckets[bucketIndex]++;
        this.routeLatency.set(operation, entry);
    },

    // Get error statistics
    getErrorStats() {
        return {
            totalErrors: this.performanceMetrics.errorCount,
            errorRate:
                this.performanceMetrics.requestCount > 0
                    ? (
                          (this.performanceMetrics.errorCount /
                              this.performanceMetrics.requestCount) *
                          100
                      ).toFixed(2)
                    : 0,
            topErrors: Array.from(this.errorCounts.entries())
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([error, count]) => ({ error, count })),
            performance: this.performanceMetrics,
            routes: Array.from(this.routeLatency.entries())
                .map(([operation, entry]) => ({
                    operation,
                    count: entry.count,
                    errorCount: entry.errorCount,
                    avgMs: Math.round(entry.totalMs / entry.count),
                    maxMs: entry.maxMs,
                    buckets: entry.buckets,
                }))
                .sort((a, b) => b.count - a.count),
        };
    },

    // Reset metrics (useful for testing)
    resetMetrics() {
        this.errorCounts.clear();
        this.routeLatency.clear();
        this.performanceMetrics = {
            requestCount: 0,
            errorCount: 0,
            averageResponseTime: 0,
            slowQueries: [],
        };
    },
};

// Global error handler middleware
export const globalErrorHandler = (err, req, res, _next) => {
    let error = { ...err };
    error.message = err.message;

    // Log the error
    errorMonitor.recordError(err, req);

    // Mongoose bad ObjectId
    if (err.name === "CastError") {
        const message = "Resource not found";
        error = new NotFoundError(message);
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const message = "Duplicate field value entered";
        error = new ConflictError(message);
    }

    // Mongoose validation error
    if (err.name === "ValidationError") {
        const message = Object.values(err.errors)
            .map((val) => val.message)
            .join(", ");
        error = new ValidationError(message);
    }

    // JWT errors
    if (err.name === "JsonWebTokenError") {
        const message = "Invalid token";
        error = new AuthenticationError(message);
    }

    if (err.name === "TokenExpiredError") {
        const message = "Token expired";
        error = new AuthenticationError(message);
    }

    // Default error
    const statusCode = error.statusCode || 500;
    const message = error.message || "Server Error";

    // Send error response
    res.status(statusCode).json({
        success: false,
        error: {
            message,
            ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
        },
        ...(process.env.NODE_ENV === "development" && {
            timestamp: new Date().toISOString(),
            path: req.path,
        }),
    });
};

// Async error wrapper
export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Performance monitoring middleware
export const performanceMonitor = (req, res, next) => {
    const start = Date.now();

    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = function (...args) {
        const duration = Date.now() - start;
        const success = res.statusCode < 400;

        errorMonitor.recordPerformance(
            `${req.method} ${req.path}`,
            duration,
            success
        );

        originalEnd.apply(this, args);
    };

    next();
};

// Rate limiting error handler
export const rateLimitErrorHandler = (req, res) => {
    const error = new AppError("Too many requests from this IP", 429);
    errorMonitor.recordError(error, req);

    res.status(429).json({
        success: false,
        error: {
            message: "Too many requests from this IP, please try again later.",
        },
    });
};

export { logger };
