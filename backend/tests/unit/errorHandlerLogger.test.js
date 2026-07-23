import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

describe("errorHandler logger re-export", () => {
    it("re-exports the pino logger", async () => {
        const { logger } = await import("../../src/utils/errorHandler.js");
        expect(logger).toBeDefined();
        expect(typeof logger.info).toBe("function");
        expect(typeof logger.warn).toBe("function");
        expect(typeof logger.error).toBe("function");
    });
});
