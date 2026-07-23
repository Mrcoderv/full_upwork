import { describe, it, expect } from "vitest";

describe("errorHandler logger integration", () => {
    it("imports logger without errors", async () => {
        const mod = await import("../../src/utils/errorHandler.js");
        expect(mod.logger).toBeDefined();
        expect(typeof mod.logger.error).toBe("function");
    });
});
