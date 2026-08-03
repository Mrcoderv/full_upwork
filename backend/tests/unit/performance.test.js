import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const connectionHandlers = vi.hoisted(() => ({}));
const mongooseMock = vi.hoisted(() => ({
    connection: {
        on: vi.fn((event, handler) => {
            connectionHandlers[event] = handler;
        }),
        close: vi.fn().mockResolvedValue(),
    },
    model: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
}));

vi.mock("mongoose", () => ({
    default: mongooseMock,
}));

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: loggerMock,
}));

import mongoose from "mongoose";
import logger from "../../src/utils/logger.js";
import {
    cacheManager,
    queryOptimizer,
    lazyLoader,
    dbOptimizer,
    requestOptimizer,
    performanceUtils,
} from "../../src/utils/performance.js";

const buildQuery = () => {
    const query = {
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        exec: vi.fn(),
    };
    return query;
};

describe("performance utilities", () => {
    beforeEach(() => {
        cacheManager.clear();
        vi.clearAllMocks();
        Object.keys(connectionHandlers).forEach((key) => {
            delete connectionHandlers[key];
        });
    });

    afterEach(() => {
        cacheManager.clear();
        vi.useRealTimers();
    });

    it("manages cache entries with TTL", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));

        cacheManager.set("key", "value", 1);
        expect(cacheManager.get("key")).toBe("value");

        vi.setSystemTime(new Date("2024-01-01T00:00:02Z"));
        expect(cacheManager.get("key")).toBeNull();
        expect(cacheManager.getStats().size).toBe(0);
    });

    it("exposes cache stats and supports deletion", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));

        cacheManager.set("one", 1, 10);
        cacheManager.set("two", 2, 1);

        vi.setSystemTime(new Date("2024-01-01T00:00:02Z"));
        const stats = cacheManager.getStats();
        expect(stats.keys).toEqual(["one"]);
        expect(cacheManager.delete("one")).toBe(true);
        expect(cacheManager.getStats().size).toBe(0);
    });

    it("adds pagination, sorting, and selections to queries", () => {
        const query = buildQuery();

        queryOptimizer.addPagination(query, 2, 25);
        expect(query.skip).toHaveBeenCalledWith(25);
        expect(query.limit).toHaveBeenCalledWith(25);

        queryOptimizer.addSorting(query, "name", "asc");
        expect(query.sort).toHaveBeenCalledWith({ name: 1 });

        const descQuery = buildQuery();
        queryOptimizer.addSorting(descQuery, "createdAt", "desc");
        expect(descQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });

        queryOptimizer.addFieldSelection(query, []);
        expect(query.select).not.toHaveBeenCalled();

        queryOptimizer.addFieldSelection(query, ["name", "email"]);
        expect(query.select).toHaveBeenCalledWith({ name: 1, email: 1 });

        queryOptimizer.addLazyPopulation(query, [{ path: "teacher" }]);
        expect(query.populate).toHaveBeenCalledWith([{ path: "teacher" }]);

        const noPopulateQuery = buildQuery();
        const untouchedQuery = queryOptimizer.addLazyPopulation(
            noPopulateQuery,
            []
        );
        expect(untouchedQuery).toBe(noPopulateQuery);
        expect(noPopulateQuery.populate).not.toHaveBeenCalled();
    });

    it("lazy loads with caching and population", async () => {
        const query = buildQuery();
        query.exec.mockResolvedValue({ id: "record" });
        const model = {
            findById: vi.fn().mockReturnValue(query),
        };

        const result = await lazyLoader.lazyLoad(
            model,
            "id-1",
            [{ path: "teacher" }],
            "cache-key"
        );

        expect(model.findById).toHaveBeenCalledWith("id-1");
        expect(query.populate).toHaveBeenCalledWith([{ path: "teacher" }]);
        expect(result).toEqual({ id: "record" });
        expect(cacheManager.get("cache-key")).toEqual({ id: "record" });

        const cached = await lazyLoader.lazyLoad(
            model,
            "id-1",
            [],
            "cache-key"
        );
        expect(cached).toEqual({ id: "record" });
        expect(model.findById).toHaveBeenCalledTimes(1);
    });

    it("lazy loads without cache key or population", async () => {
        const query = buildQuery();
        query.exec.mockResolvedValue({ id: "plain" });
        const model = {
            findById: vi.fn().mockReturnValue(query),
        };

        const result = await lazyLoader.lazyLoad(model, "id-2");

        expect(model.findById).toHaveBeenCalledWith("id-2");
        expect(query.populate).not.toHaveBeenCalled();
        expect(result).toEqual({ id: "plain" });
    });

    it("lazy loads paginated data and caches results", async () => {
        const query = buildQuery();
        query.exec.mockResolvedValue([{ id: 1 }, { id: 2 }]);
        const model = {
            find: vi.fn().mockReturnValue(query),
            countDocuments: vi.fn().mockResolvedValue(5),
        };

        const result = await lazyLoader.lazyLoadPaginated(
            model,
            { active: true },
            {
                page: 2,
                limit: 2,
                sortBy: "name",
                sortOrder: "asc",
                populate: [{ path: "teacher" }],
                select: ["name", "email"],
                cacheKey: "page-cache",
            }
        );

        expect(model.find).toHaveBeenCalledWith({ active: true });
        expect(query.skip).toHaveBeenCalledWith(2);
        expect(query.limit).toHaveBeenCalledWith(2);
        expect(query.sort).toHaveBeenCalledWith({ name: 1 });
        expect(query.select).toHaveBeenCalledWith({ name: 1, email: 1 });
        expect(query.populate).toHaveBeenCalledWith([{ path: "teacher" }]);
        expect(result.pagination).toEqual({
            page: 2,
            limit: 2,
            total: 5,
            pages: 3,
            hasNext: true,
            hasPrev: true,
        });

        const cached = await lazyLoader.lazyLoadPaginated(model, {}, {
            cacheKey: "page-cache",
        });
        expect(cached).toEqual(result);
    });

    it("lazy loads paginated data without cache, selection, or population", async () => {
        const query = buildQuery();
        query.exec.mockResolvedValue([{ id: 3 }]);
        const model = {
            find: vi.fn().mockReturnValue(query),
            countDocuments: vi.fn().mockResolvedValue(1),
        };

        const result = await lazyLoader.lazyLoadPaginated(model, { active: true }, {
            page: 1,
            limit: 5,
        });

        expect(model.find).toHaveBeenCalledWith({ active: true });
        expect(query.select).not.toHaveBeenCalled();
        expect(query.populate).not.toHaveBeenCalled();
        expect(result.data).toEqual([{ id: 3 }]);
        expect(result.pagination).toEqual({
            page: 1,
            limit: 5,
            total: 1,
            pages: 1,
            hasNext: false,
            hasPrev: false,
        });
    });

    it("batch loads results with optional caching", async () => {
        const query = buildQuery();
        query.exec.mockResolvedValue([{ id: 1 }]);
        const model = {
            find: vi.fn().mockReturnValue(query),
        };
        const ids = ["a", "b"];

        const result = await lazyLoader.batchLazyLoad(
            model,
            ids,
            [{ path: "teacher" }],
            "batch-cache"
        );

        expect(model.find).toHaveBeenCalledWith({ _id: { $in: ids } });
        expect(query.populate).toHaveBeenCalledWith([{ path: "teacher" }]);
        expect(result).toEqual([{ id: 1 }]);
        expect(cacheManager.get("batch-cache")).toEqual([{ id: 1 }]);
    });

    it("returns cached batch results without querying", async () => {
        const cachedResults = [{ id: "cached" }];
        cacheManager.set("batch-cache-hit", cachedResults, 60);

        const model = {
            find: vi.fn(),
        };

        const result = await lazyLoader.batchLazyLoad(
            model,
            ["x"],
            [],
            "batch-cache-hit"
        );

        expect(result).toEqual(cachedResults);
        expect(model.find).not.toHaveBeenCalled();
    });

    it("batch loads without cache key or population", async () => {
        const query = buildQuery();
        query.exec.mockResolvedValue([{ id: 2 }]);
        const model = {
            find: vi.fn().mockReturnValue(query),
        };

        const result = await lazyLoader.batchLazyLoad(model, ["x"]);

        expect(model.find).toHaveBeenCalledWith({ _id: { $in: ["x"] } });
        expect(query.populate).not.toHaveBeenCalled();
        expect(result).toEqual([{ id: 2 }]);
    });

    it("configures database pool listeners and exposes shutdown for the app handler", async () => {
        const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
        const onSpy = vi.spyOn(process, "on");
        const originalPool = process.env.MAX_CONCURRENT_REQUESTS;
        process.env.MAX_CONCURRENT_REQUESTS = "25";

        dbOptimizer.configurePool();

        expect(mongoose.connection.on).toHaveBeenCalledWith(
            "connected",
            expect.any(Function)
        );
        expect(mongoose.connection.on).toHaveBeenCalledWith(
            "error",
            expect.any(Function)
        );
        expect(mongoose.connection.on).toHaveBeenCalledWith(
            "disconnected",
            expect.any(Function)
        );
        expect(onSpy).not.toHaveBeenCalledWith("SIGINT", expect.any(Function));

        connectionHandlers.connected();
        expect(logger.info).toHaveBeenCalledWith(
            "MongoDB connected with pool size: 25"
        );

        const error = new Error("boom");
        connectionHandlers.error(error);
        expect(logger.error).toHaveBeenCalledWith(
            "MongoDB connection error:",
            error
        );

        connectionHandlers.disconnected();
        expect(logger.warn).toHaveBeenCalledWith("MongoDB disconnected");

        await dbOptimizer.shutdown();
        expect(mongoose.connection.close).toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith(
            "MongoDB connection closed through app termination"
        );
        expect(exitSpy).not.toHaveBeenCalled();

        process.env.MAX_CONCURRENT_REQUESTS = originalPool;
    });

    it("creates indexes and logs errors", async () => {
        const createIndexesSpy = vi.fn().mockResolvedValue();
        mongoose.model.mockReturnValue({ createIndexes: createIndexesSpy });

        await dbOptimizer.createIndexes();

        expect(mongoose.model).toHaveBeenCalledWith("Student");
        expect(mongoose.model).toHaveBeenCalledWith("Course");
        expect(mongoose.model).toHaveBeenCalledWith("StudentEnrollment");
        expect(mongoose.model).toHaveBeenCalledWith("User");
        expect(createIndexesSpy).toHaveBeenCalledTimes(4);
        expect(logger.info).toHaveBeenCalledWith(
            "Database indexes created successfully"
        );

        mongoose.model.mockReset();
        const failSpy = vi.fn().mockRejectedValue(new Error("index failed"));
        mongoose.model.mockReturnValue({ createIndexes: failSpy });

        await dbOptimizer.createIndexes();
        expect(logger.error).toHaveBeenCalledWith(
            "Error creating database indexes:",
            expect.any(Error)
        );
    });

    it("optimizes request query parameters", () => {
        const req = {
            query: {
                page: "2",
                limit: "150",
                fields: "name,email",
                populate: "teacher,course",
                teacherSelect: "name",
            },
        };
        const next = vi.fn();

        requestOptimizer.optimizeQuery(req, {}, next);

        expect(req.query.page).toBe(2);
        expect(req.query.limit).toBe(100);
        expect(req.query.sortBy).toBe("createdAt");
        expect(req.query.sortOrder).toBe("desc");
        expect(req.query.select).toEqual(["name", "email"]);
        expect(req.query.populate).toEqual([
            { path: "teacher", select: "name" },
            { path: "course", select: "" },
        ]);
        expect(next).toHaveBeenCalled();
    });

    it("sets cache headers for optimized responses", () => {
        const res = { set: vi.fn() };
        const next = vi.fn();

        requestOptimizer.compressResponse({}, res, next);

        expect(res.set).toHaveBeenCalledWith(
            "Cache-Control",
            "public, max-age=300"
        );
        expect(next).toHaveBeenCalled();
    });

    it("measures execution time and logs slow paths", async () => {
        const nowSpy = vi.spyOn(Date, "now");
        nowSpy.mockReturnValueOnce(0).mockReturnValueOnce(1500);

        const result = await performanceUtils.measureExecution(
            () => Promise.resolve("ok"),
            "Slow Task"
        );

        expect(result).toBe("ok");
        expect(logger.info).toHaveBeenCalledWith(
            "Performance: Slow Task executed in 1500ms"
        );
        expect(logger.warn).toHaveBeenCalledWith(
            "Performance: Slow Task took 1500ms (slow execution)"
        );

        logger.warn.mockClear();
        nowSpy.mockReset();
        nowSpy.mockReturnValueOnce(0).mockReturnValueOnce(200);

        const fastResult = await performanceUtils.measureExecution(
            () => Promise.resolve("fast"),
            "Fast Task"
        );

        expect(fastResult).toBe("fast");
        expect(logger.warn).not.toHaveBeenCalled();

        nowSpy.mockReset();
        nowSpy.mockReturnValueOnce(0).mockReturnValueOnce(200);

        await expect(
            performanceUtils.measureExecution(() => {
                throw new Error("boom");
            }, "Failing Task")
        ).rejects.toThrow("boom");

        expect(logger.error).toHaveBeenCalledWith(
            "Performance: Failing Task failed after 200ms",
            expect.any(Error)
        );
    });

    it("debounces and throttles function calls", () => {
        vi.useFakeTimers();
        const debounceFn = vi.fn();
        const throttledFn = vi.fn();

        const debounced = performanceUtils.debounce(debounceFn, 100);
        debounced("first");
        debounced("second");
        vi.advanceTimersByTime(99);
        expect(debounceFn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(debounceFn).toHaveBeenCalledWith("second");

        const throttled = performanceUtils.throttle(throttledFn, 100);
        throttled("a");
        throttled("b");
        expect(throttledFn).toHaveBeenCalledTimes(1);
        expect(throttledFn).toHaveBeenCalledWith("a");

        vi.advanceTimersByTime(100);
        throttled("c");
        expect(throttledFn).toHaveBeenCalledTimes(2);
        expect(throttledFn).toHaveBeenCalledWith("c");
    });
});
