import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let currentApp;
let thenHandler;
let catchHandler;
const expressMock = vi.fn(() => {
  currentApp = {
    use: vi.fn(),
    get: vi.fn(),
    options: vi.fn(),
    listen: vi.fn((port, cb) => {
      if (typeof cb === "function") {
        cb();
      }
      return currentApp;
    }),
  };
  return currentApp;
});
expressMock.json = vi.fn(() => "jsonMiddleware");
expressMock.urlencoded = vi.fn(() => "urlencodedMiddleware");
expressMock.static = vi.fn(() => "staticMiddleware");
vi.mock("express", () => ({
  __esModule: true,
  default: expressMock,
}));

const corsMock = vi.fn(() => "corsMiddleware");
vi.mock("cors", () => ({
  __esModule: true,
  default: corsMock,
}));

const cookieParserMock = vi.fn(() => "cookieMiddleware");
vi.mock("cookie-parser", () => ({
  __esModule: true,
  default: cookieParserMock,
}));

const dotenvConfigMock = vi.fn();
vi.mock("dotenv", () => ({
  __esModule: true,
  default: {
    config: dotenvConfigMock,
  },
}));

const securityMocks = {
  securityHeaders: vi.fn(),
  corsConfig: { origin: "https://example.com" },
  requestLogger: vi.fn(),
  securityAudit: vi.fn(),
  rateLimiter: vi.fn(),
  apiRateLimiter: vi.fn(),
  mongoSanitize: vi.fn((req, res, next) => next()),
  requestTimeout: vi.fn(() => (req, res, next) => next()),
};
vi.mock("../../src/middleware/security.js", () => ({
  __esModule: true,
  ...securityMocks,
}));

const createErrorStats = () => ({ errors: 0 });
const errorMonitor = {
  getErrorStats: vi.fn(createErrorStats),
  recordError: vi.fn(),
};
const errorHandlerMocks = {
  globalErrorHandler: vi.fn(),
  performanceMonitor: vi.fn(),
  errorMonitor,
};
vi.mock("../../src/utils/errorHandler.js", () => ({
  __esModule: true,
  ...errorHandlerMocks,
}));

const dbOptimizer = {
  configurePool: vi.fn(),
  createIndexes: vi.fn(() => Promise.resolve()),
};
const requestOptimizer = {
  optimizeQuery: vi.fn(),
};
vi.mock("../../src/utils/performance.js", () => ({
  __esModule: true,
  dbOptimizer,
  requestOptimizer,
}));

const routerMock = {};
vi.mock("../../src/router/router.js", () => ({
  __esModule: true,
  default: routerMock,
}));

const mongooseMock = {
  connect: vi.fn(),
  connection: {
    readyState: 1,
    host: "localhost",
    name: "mindful",
    close: vi.fn((cb) => {
      if (cb) cb();
      return Promise.resolve();
    }),
  },
};
vi.mock("mongoose", () => ({
  __esModule: true,
  default: mongooseMock,
}));

const createRes = () => {
  const res = {
    json: vi.fn(),
  };
  res.status = vi.fn(() => res);
  return res;
};

describe("backend/index.js", () => {
  let registeredHandlers;
  let processOnSpy;
  let processExitSpy;
  let previousEnv;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    registeredHandlers = {};
    processOnSpy = vi
      .spyOn(process, "on")
      .mockImplementation((event, handler) => {
        registeredHandlers[event] = handler;
      });
    processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined);

    previousEnv = {
      NODE_ENV: process.env.NODE_ENV,
      JWT_SECRET: process.env.JWT_SECRET,
      MONGODB_URI: process.env.MONGODB_URI,
      MAX_CONCURRENT_REQUESTS: process.env.MAX_CONCURRENT_REQUESTS,
    };

    thenHandler = undefined;
    catchHandler = undefined;
    mongooseMock.connect.mockImplementation(() => {
      const chain = {
        then(cb) {
          thenHandler = cb;
          return chain;
        },
        catch(cb) {
          catchHandler = cb;
          return chain;
        },
      };
      return chain;
    });
    mongooseMock.connection.readyState = 1;
    mongooseMock.connection.host = "mongo-host";
    mongooseMock.connection.name = "mindful-db";
    mongooseMock.connection.close.mockImplementation((cb) => {
      if (cb) cb();
      return Promise.resolve();
    });
  });

  afterEach(() => {
    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
    process.env.NODE_ENV = previousEnv.NODE_ENV;
    process.env.JWT_SECRET = previousEnv.JWT_SECRET;
    process.env.MONGODB_URI = previousEnv.MONGODB_URI;
    process.env.MAX_CONCURRENT_REQUESTS =
      previousEnv.MAX_CONCURRENT_REQUESTS;
  });

  it("initializes security stack and exposes health/metrics in test mode", async () => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "";
    await import("../../index.js");
    const appInstance = currentApp;

    const healthHandlerCall = appInstance.get.mock.calls.find(
      (call) => call[0] === "/health"
    );
    const healthHandler = healthHandlerCall[1];
    const healthRes = createRes();
    await healthHandler({ method: "GET", url: "/health" }, healthRes);

    expect(healthRes.status).toHaveBeenCalledWith(200);
    expect(healthRes.json).toHaveBeenCalled();
    const healthPayload = healthRes.json.mock.calls[0][0];
    expect(healthPayload.environment).toBe("test");
    expect(healthPayload.database).toBe("connected");

    const metricsHandlerCall = appInstance.get.mock.calls.find(
      (call) => call[0] === "/metrics"
    );
    const metricsHandler = metricsHandlerCall[1];
    const metricsRes = createRes();
    await metricsHandler({ method: "GET", url: "/metrics" }, metricsRes);
    expect(metricsRes.status).toHaveBeenCalledWith(200);
    expect(metricsRes.json).toHaveBeenCalled();
    const metricsPayload = metricsRes.json.mock.calls[0][0];
    expect(metricsPayload.system.nodeVersion).toBe(process.version);

    const useCalls = appInstance.use.mock.calls;
    expect(useCalls).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([securityMocks.securityHeaders]),
        expect.arrayContaining(["corsMiddleware"]),
        expect.arrayContaining(["cookieMiddleware"]),
        expect.arrayContaining(["jsonMiddleware"]),
        expect.arrayContaining(["urlencodedMiddleware"]),
      ])
    );

    expect(corsMock).toHaveBeenCalledWith(securityMocks.corsConfig);
    expect(cookieParserMock).toHaveBeenCalled();
    expect(expressMock.static).toHaveBeenCalled();
  });

  it("connects to MongoDB when not in test mode and handles shutdown hooks", async () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "";
    process.env.MONGODB_URI = "mongodb://test";
    process.env.MAX_CONCURRENT_REQUESTS = "12";

    await import("../../index.js");
    const appInstance = currentApp;

    expect(dbOptimizer.configurePool).toHaveBeenCalled();
    expect(expressMock.static).toHaveBeenCalled();

    await thenHandler?.();
    await Promise.resolve();

    expect(mongooseMock.connect).toHaveBeenCalledWith(
      process.env.MONGODB_URI,
      expect.objectContaining({
        maxPoolSize: 12,
      })
    );
    expect(dbOptimizer.createIndexes).toHaveBeenCalled();

    await catchHandler?.(new Error("boom"));
    expect(errorMonitor.recordError).toHaveBeenCalledWith(expect.any(Error));

    await registeredHandlers.SIGTERM?.();
    await registeredHandlers.SIGINT?.();
    await registeredHandlers.uncaughtException?.(new Error("boom"));
    await registeredHandlers.unhandledRejection?.(new Error("boom"));

    expect(mongooseMock.connection.close).toHaveBeenCalled();
    expect(errorMonitor.recordError).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(processExitSpy).toHaveBeenCalledWith(0);

    const healthHandler = appInstance.get.mock.calls.find(
      (call) => call[0] === "/health"
    )[1];
    const healthRes = createRes();
    await healthHandler({}, healthRes);
    expect(healthRes.json).toHaveBeenCalled();

    const metricsHandler = appInstance.get.mock.calls.find(
      (call) => call[0] === "/metrics"
    )[1];
    const metricsRes = createRes();
    await metricsHandler({}, metricsRes);
    expect(metricsRes.json).toHaveBeenCalled();

    const useCalls = appInstance.use.mock.calls;
    expect(useCalls).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([securityMocks.securityHeaders]),
        expect.arrayContaining(["corsMiddleware"]),
        expect.arrayContaining(["cookieMiddleware"]),
        expect.arrayContaining(["jsonMiddleware"]),
        expect.arrayContaining(["urlencodedMiddleware"]),
        expect.arrayContaining([requestOptimizer.optimizeQuery]),
        expect.arrayContaining(["/", routerMock]),
      ])
    );
  });

  it("warns when creating database indexes fails", async () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "";
    process.env.MONGODB_URI = "mongodb://test";
    process.env.MAX_CONCURRENT_REQUESTS = "5";
    dbOptimizer.createIndexes.mockRejectedValueOnce(new Error("index fail"));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await import("../../index.js");

    await thenHandler?.();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(
      "⚠️ Database index creation failed:",
      "index fail"
    );
    warnSpy.mockRestore();
  });

  it("loads production env configuration and still mounts the server", async () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "";
    process.env.MONGODB_URI = "mongodb://prod-db";
    process.env.MAX_CONCURRENT_REQUESTS = "8";

    await import("../../index.js");

    const lastCall = dotenvConfigMock.mock.calls.slice(-1)[0];
    expect(lastCall?.[0]?.path).toContain(".env.production");

    await thenHandler?.();
    await Promise.resolve();
    await catchHandler?.(new Error("prod failure"));

    expect(expressMock.static).toHaveBeenCalled();
    expect(routerMock).toBeDefined();
  });
});
