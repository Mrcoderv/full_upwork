import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import jwtLib from "jsonwebtoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
let envFile = ".env.development";
if (process.env.NODE_ENV === "production") {
    envFile = ".env.production";
} else if (process.env.NODE_ENV === "test") {
    envFile = ".env.test";
}
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

import logger from "./src/utils/logger.js";

logger.info({ env: process.env.NODE_ENV }, "Running in environment mode");
logger.info({ envFile }, "Loaded environment file");

// --- Environment validation (non-test only) ---
if (process.env.NODE_ENV !== "test") {
    const required = ["MONGODB_URI", "JWT_SECRET"];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) {
        logger.fatal(
            { missing },
            "Required environment variables are not set. " +
                "Copy .env.example to .env.development and fill in values."
        );
        process.exit(1);
    }

    const weakSecrets = ["test-secret", "jwt_mindful", "secret", "changeme", "password", "default"];
    if (process.env.JWT_SECRET.length < 32) {
        logger.fatal(
            "JWT_SECRET must be at least 32 characters long."
        );
        process.exit(1);
    }
    if (weakSecrets.includes(process.env.JWT_SECRET)) {
        logger.fatal(
            `JWT_SECRET is a known weak value ("${process.env.JWT_SECRET}"). Replace it with a strong random secret.`
        );
        process.exit(1);
    }
}
logger.info({ loaded: !!process.env.JWT_SECRET }, "JWT secret status");

import express from "express";
const app = express();

// Import security and performance utilities
import {
    securityHeaders,
    corsConfig,
    requestLogger,
    securityAudit,
    mongoSanitize,
    rateLimiter,
    apiRateLimiter,
    requestTimeout,
} from "./src/middleware/security.js";

import {
    globalErrorHandler,
    performanceMonitor,
    errorMonitor,
} from "./src/utils/errorHandler.js";

import { dbOptimizer, requestOptimizer } from "./src/utils/performance.js";

// Apply security headers
app.use(securityHeaders);

// Apply request timeout (30 seconds)
app.use(requestTimeout(30));

// Apply CORS with enhanced configuration
import cors from "cors";
app.use(cors(corsConfig));

// Rate limiting
if (process.env.NODE_ENV !== "test") {
    app.use(rateLimiter);
    app.use("/api/", apiRateLimiter);
} else {
    // In tests, only rate limit the students endpoint to validate rate limiting behavior
    app.use("/api/students", apiRateLimiter);
}

// Apply performance monitoring
app.use(performanceMonitor);

// Apply request logging
app.use(requestLogger);

// Apply security audit
app.use(securityAudit);

import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import router from "./src/router/router.js";

const PORT = process.env.PORT || 5001;

// Middleware setup
app.use(cookieParser());
app.use(express.json({ limit: process.env.MAX_FILE_SIZE || "10mb" }));
app.use(
    express.urlencoded({
        extended: true,
        limit: process.env.MAX_FILE_SIZE || "10mb",
    })
);

// Strip Mongo operator keys ($gt, $where, etc.) from body/query/params to
// prevent NoSQL injection
app.use(mongoSanitize);

// Apply query optimization
app.use(requestOptimizer.optimizeQuery);

// Enhanced request logging
app.use((req, res, next) => {
    logger.debug({ method: req.method, url: req.url }, "Incoming request");
    next();
});

// --- Health check endpoints (before router) ---

// Liveness: is the process alive?
app.get("/health/live", (_req, res) => {
    res.status(200).json({ status: "ok" });
});

// Readiness: can the process serve traffic? (DB must be connected)
app.get("/health/ready", (_req, res) => {
    const dbReady = mongoose.connection.readyState === 1;
    if (dbReady) {
        res.status(200).json({
            status: "ok",
            database: "connected",
            uptime: process.uptime(),
        });
    } else {
        res.status(503).json({
            status: "not ready",
            database: mongoose.connection.readyState === 2 ? "connecting" : "disconnected",
            uptime: process.uptime(),
        });
    }
});

// Combined health (backward-compatible)
app.get("/health", (_req, res) => {
    const dbReady = mongoose.connection.readyState === 1;
    res.status(dbReady ? 200 : 503).json({
        status: dbReady ? "OK" : "DEGRADED",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        database: dbReady ? "connected" : "disconnected",
        memory: process.memoryUsage(),
        performance: errorMonitor.getErrorStats(),
    });
});

// Metrics endpoint for monitoring (before router)
app.get("/metrics", (_req, res) => {
    res.status(200).json({
        errors: errorMonitor.getErrorStats(),
        cache: { size: 0, keys: [] },
        database: {
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            name: mongoose.connection.name,
        },
        system: {
            nodeVersion: process.version,
            platform: process.platform,
            memory: process.memoryUsage(),
            uptime: process.uptime(),
        },
    });
});

logger.info("Mounting router");
app.use("/", router);
logger.info("Router mounted");

// Ensure preflight (OPTIONS) requests are handled
app.options(/.*/, cors());

app.use("/uploads", (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).json({ error: "Authentication required" });
    }
    try {
        jwtLib.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}, express.static(path.join(__dirname, "public/uploads")));

// 404 handler — any request that reaches here has no matching route
app.use((_req, res) => {
    res.status(404).json({
        success: false,
        error: { message: "Route not found" },
    });
});

// Configure database connection with optimization
dbOptimizer.configurePool();

// MongoDB Connection with enhanced error handling (skip during tests)
if (process.env.NODE_ENV !== "test") {
    const mongoUri = process.env.MONGODB_URI;
    mongoose
        .connect(mongoUri, {
            maxPoolSize: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 50,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        })
        .then(async () => {
            logger.info("Connected to MongoDB");

            // Create database indexes for performance
            try {
                await dbOptimizer.createIndexes();
            } catch (error) {
                logger.warn({ err: error }, "Database index creation failed");
            }
        })
        .catch((err) => {
            logger.error({ err }, "MongoDB connection error");
            errorMonitor.recordError(err);
        });
}

// Apply global error handler (must be last)
app.use(globalErrorHandler);

// Graceful shutdown
let server;
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function shutdown(signal) {
    logger.info({ signal }, "Received signal, shutting down gracefully");

    const forceExit = setTimeout(() => {
        logger.fatal("Shutdown timed out, forcing exit");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
        if (server) {
            await new Promise((resolve, reject) =>
                server.close((err) => (err ? reject(err) : resolve()))
            );
            logger.info("HTTP server closed");
        }
    } catch (err) {
        logger.error({ err }, "Error closing HTTP server");
    }

    try {
        await mongoose.connection.close();
        logger.info("Database connection closed");
    } catch (err) {
        logger.error({ err }, "Error closing database connection");
    }

    logger.info({ metrics: errorMonitor.getErrorStats() }, "Final metrics");
    process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    errorMonitor.recordError(err);
    mongoose.connection.close(() => process.exit(1));
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
    logger.fatal({ err }, "Unhandled rejection");
    errorMonitor.recordError(err);
    mongoose.connection.close(() => process.exit(1));
});

// Start the server unless running tests
if (process.env.NODE_ENV !== "test") {
    server = app.listen(PORT, () => {
        logger.info({ port: PORT }, "Server started");
        logger.info("Security features active: rate limiting, CORS, helmet, input validation");
        logger.info("Performance features active: caching, lazy loading, query optimization");
        logger.info("Monitoring active: error tracking, performance metrics, health checks");
    });
}

export default app;
