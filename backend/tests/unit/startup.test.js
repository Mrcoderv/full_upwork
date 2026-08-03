import { describe, it, expect } from "vitest";
import app from "../../index.js";

describe("App startup", () => {
    it("exports an Express application", () => {
        expect(app).toBeDefined();
        expect(typeof app.listen).toBe("function");
        expect(typeof app.use).toBe("function");
    });
});
