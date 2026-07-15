import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

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

console.log(`🚀 Running in ${process.env.NODE_ENV} mode`);
console.log(`📌 Loaded environment file: ${envFile}`);
console.log(`🔑 JWT_SECRET Loaded: ${process.env.JWT_SECRET ? "Yes" : "No"}`);

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
    console.log(`Incoming request: ${req.method} ${req.url}`);
    next();
});

// Health check endpoint (before router)
app.get("/health", (req, res) => {
    const health = {
        status: "OK",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        database:
            mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        memory: process.memoryUsage(),
        performance: errorMonitor.getErrorStats(),
    };

    res.status(200).json(health);
});

// Metrics endpoint for monitoring (before router)
app.get("/metrics", (req, res) => {
    const metrics = {
        errors: errorMonitor.getErrorStats(),
        cache: { size: 0, keys: [] }, // Simplified for now
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
    };

    res.status(200).json(metrics);
});

console.log("Attempting to mount router...");
app.use("/", router);
console.log("Router successfully mounted!");

// Ensure preflight (OPTIONS) requests are handled
app.options(/.*/, cors());

app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// Configure database connection with optimization
dbOptimizer.configurePool();

// JWT_SECRET must be a real secret in dev/production. Only tests get an
// insecure fallback so the suite can run without requiring one.
if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === "test") {
        process.env.JWT_SECRET = "test-secret";
    } else {
        console.error(
            "💥 JWT_SECRET is not set. Refusing to start with an insecure default — set JWT_SECRET in the environment."
        );
        process.exit(1);
    }
}

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
            console.log("✅ Connected to MongoDB");

            // Create database indexes for performance
            try {
                await dbOptimizer.createIndexes();
            } catch (error) {
                console.warn(
                    "⚠️ Database index creation failed:",
                    error.message
                );
            }
        })
        .catch((err) => {
            console.error("❌ MongoDB connection error:", err);
            errorMonitor.recordError(err);
        });
}

// Apply global error handler (must be last)
app.use(globalErrorHandler);

// Graceful shutdown handling
process.on("SIGTERM", async () => {
    console.log("🛑 SIGTERM received, shutting down gracefully...");

    // Close database connection
    await mongoose.connection.close();
    console.log("✅ Database connection closed");

    // Log final metrics
    console.log("📊 Final metrics:", errorMonitor.getErrorStats());

    process.exit(0);
});

process.on("SIGINT", async () => {
    console.log("🛑 SIGINT received, shutting down gracefully...");

    // Close database connection
    await mongoose.connection.close();
    console.log("✅ Database connection closed");

    // Log final metrics
    console.log("📊 Final metrics:", errorMonitor.getErrorStats());

    process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
    console.error("💥 Uncaught Exception:", err);
    errorMonitor.recordError(err);

    // Close database connection
    mongoose.connection.close(() => {
        console.log("✅ Database connection closed due to uncaught exception");
        process.exit(1);
    });
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
    console.error("💥 Unhandled Rejection:", err);
    errorMonitor.recordError(err);

    // Close database connection
    mongoose.connection.close(() => {
        console.log("✅ Database connection closed due to unhandled rejection");
        process.exit(1);
    });
});

// Start the server unless running tests
if (process.env.NODE_ENV !== "test") {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on localhost:${PORT}`);
        console.log(
            `🔒 Security features: Rate limiting, CORS, Helmet, Input validation`
        );
        console.log(
            `⚡ Performance features: Caching, Lazy loading, Query optimization`
        );
        console.log(
            `📊 Monitoring: Error tracking, Performance metrics, Health checks`
        );
        console.log(
            `🧪 Testing: Unit tests, Integration tests, API validation`
        );
    });
}

export default app;
