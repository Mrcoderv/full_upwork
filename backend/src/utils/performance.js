import mongoose from "mongoose";
import logger from "./logger.js";

// Cache configuration
const cache = new Map();
const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 3600; // 1 hour default

// Cache management
export const cacheManager = {
    // Set cache with TTL
    set(key, value, ttl = CACHE_TTL) {
        const expiry = Date.now() + ttl * 1000;
        cache.set(key, { value, expiry });

        // Clean up expired entries
        this.cleanup();
    },

    // Get from cache
    get(key) {
        const item = cache.get(key);
        if (!item) return null;

        if (Date.now() > item.expiry) {
            cache.delete(key);
            return null;
        }

        return item.value;
    },

    // Delete from cache
    delete(key) {
        return cache.delete(key);
    },

    // Clear all cache
    clear() {
        cache.clear();
    },

    // Get cache stats
    getStats() {
        this.cleanup();
        return {
            size: cache.size,
            keys: Array.from(cache.keys()),
        };
    },

    // Clean up expired entries
    cleanup() {
        const now = Date.now();
        for (const [key, item] of cache.entries()) {
            if (now > item.expiry) {
                cache.delete(key);
            }
        }
    },
};

// Database query optimization
export const queryOptimizer = {
    // Add pagination to queries
    addPagination(query, page = 1, limit = 10) {
        const skip = (page - 1) * limit;
        return query.skip(skip).limit(limit);
    },

    // Add sorting to queries
    addSorting(query, sortBy = "createdAt", sortOrder = "desc") {
        const sort = {};
        sort[sortBy] = sortOrder === "desc" ? -1 : 1;
        return query.sort(sort);
    },

    // Add field selection to queries
    addFieldSelection(query, fields = []) {
        if (fields.length > 0) {
            const projection = {};
            fields.forEach((field) => {
                projection[field] = 1;
            });
            return query.select(projection);
        }
        return query;
    },

    // Add population with lazy loading
    addLazyPopulation(query, populateOptions = []) {
        if (populateOptions.length > 0) {
            return query.populate(populateOptions);
        }
        return query;
    },
};

// Lazy loading utilities
export const lazyLoader = {
    // Lazy load related data
    async lazyLoad(model, id, populateOptions = [], cacheKey = null) {
        if (cacheKey) {
            const cached = cacheManager.get(cacheKey);
            if (cached) return cached;
        }

        let query = model.findById(id);

        if (populateOptions.length > 0) {
            query = query.populate(populateOptions);
        }

        const result = await query.exec();

        if (cacheKey && result) {
            cacheManager.set(cacheKey, result, 1800); // 30 minutes for lazy loaded data
        }

        return result;
    },

    // Lazy load with pagination
    async lazyLoadPaginated(model, filter = {}, options = {}) {
        const {
            page = 1,
            limit = 10,
            sortBy = "createdAt",
            sortOrder = "desc",
            populate = [],
            select = [],
            cacheKey = null,
        } = options;

        if (cacheKey) {
            const cached = cacheManager.get(cacheKey);
            if (cached) return cached;
        }

        let query = model.find(filter);

        // Add pagination
        query = queryOptimizer.addPagination(query, page, limit);

        // Add sorting
        query = queryOptimizer.addSorting(query, sortBy, sortOrder);

        // Add field selection
        if (select.length > 0) {
            query = queryOptimizer.addFieldSelection(query, select);
        }

        // Add population
        if (populate.length > 0) {
            query = queryOptimizer.addLazyPopulation(query, populate);
        }

        const [data, total] = await Promise.all([
            query.exec(),
            model.countDocuments(filter),
        ]);

        const result = {
            data,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasNext: page < Math.ceil(total / limit),
                hasPrev: page > 1,
            },
        };

        if (cacheKey) {
            cacheManager.set(cacheKey, result, 900); // 15 minutes for paginated data
        }

        return result;
    },

    // Batch lazy loading
    async batchLazyLoad(model, ids, populateOptions = [], cacheKey = null) {
        if (cacheKey) {
            const cached = cacheManager.get(cacheKey);
            if (cached) return cached;
        }

        let query = model.find({ _id: { $in: ids } });

        if (populateOptions.length > 0) {
            query = query.populate(populateOptions);
        }

        const results = await query.exec();

        if (cacheKey) {
            cacheManager.set(cacheKey, results, 1800);
        }

        return results;
    },
};

// Database connection pooling optimization
export const dbOptimizer = {
    // Configure connection pool
    configurePool() {
        const poolSize = parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 50;

        mongoose.connection.on("connected", () => {
            logger.info(`MongoDB connected with pool size: ${poolSize}`);
        });

        mongoose.connection.on("error", (err) => {
            logger.error("MongoDB connection error:", err);
        });

        mongoose.connection.on("disconnected", () => {
            logger.warn("MongoDB disconnected");
        });
    },

    // Close the database connection (invoked by the app's single shutdown handler)
    async shutdown() {
        await mongoose.connection.close();
        logger.info("MongoDB connection closed through app termination");
    },

    // Add database indexes for performance
    async createIndexes() {
        try {
            // Student indexes
            await mongoose.model("Student").createIndexes();

            // Course indexes
            await mongoose.model("Course").createIndexes();

            // Enrollment indexes
            await mongoose.model("StudentEnrollment").createIndexes();

            // User indexes
            await mongoose.model("User").createIndexes();

            logger.info("Database indexes created successfully");
        } catch (error) {
            logger.error("Error creating database indexes:", error);
        }
    },
};

// Request optimization middleware
export const requestOptimizer = {
    // Add query optimization to requests
    optimizeQuery(req, res, next) {
        // Parse pagination
        req.query.page = parseInt(req.query.page) || 1;
        req.query.limit = Math.min(parseInt(req.query.limit) || 10, 100); // Max 100 items

        // Parse sorting
        req.query.sortBy = req.query.sortBy || "createdAt";
        req.query.sortOrder = req.query.sortOrder || "desc";

        // Parse field selection
        if (req.query.fields) {
            req.query.select = req.query.fields.split(",");
        }

        // Parse population
        if (req.query.populate) {
            req.query.populate = req.query.populate.split(",").map((field) => ({
                path: field.trim(),
                select: req.query[`${field.trim()}Select`] || "",
            }));
        }

        next();
    },

    // Add response compression
    compressResponse(req, res, next) {
        // This would integrate with compression middleware
        // For now, we'll just add headers for optimization
        res.set("Cache-Control", "public, max-age=300"); // 5 minutes
        next();
    },
};

// Performance monitoring utilities
export const performanceUtils = {
    // Measure function execution time
    async measureExecution(fn, name = "Function") {
        const start = Date.now();
        try {
            const result = await fn();
            const duration = Date.now() - start;

            logger.info(`Performance: ${name} executed in ${duration}ms`);

            if (duration > 1000) {
                logger.warn(
                    `Performance: ${name} took ${duration}ms (slow execution)`
                );
            }

            return result;
        } catch (error) {
            const duration = Date.now() - start;
            logger.error(
                `Performance: ${name} failed after ${duration}ms`,
                error
            );
            throw error;
        }
    },

    // Debounce function calls
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Throttle function calls
    throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    },
};

// Export all utilities
export default {
    cacheManager,
    queryOptimizer,
    lazyLoader,
    dbOptimizer,
    requestOptimizer,
    performanceUtils,
};
