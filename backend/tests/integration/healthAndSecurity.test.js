import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../index.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

describe("Health & Infrastructure", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    describe("GET /health/live", () => {
        it("returns 200 with status ok", async () => {
            const res = await request(app).get("/health/live").expect(200);
            expect(res.body).toEqual({ status: "ok" });
        });
    });

    describe("GET /health/ready", () => {
        it("returns 200 when db is connected", async () => {
            const res = await request(app).get("/health/ready").expect(200);
            expect(res.body.status).toBe("ok");
            expect(res.body.database).toBe("connected");
            expect(res.body).toHaveProperty("uptime");
        });
    });

    describe("GET /health", () => {
        it("returns OK with full health payload", async () => {
            const res = await request(app).get("/health").expect(200);
            expect(res.body.status).toBe("OK");
            expect(res.body).toHaveProperty("timestamp");
            expect(res.body).toHaveProperty("uptime");
            expect(res.body).toHaveProperty("environment");
            expect(res.body).toHaveProperty("database", "connected");
            expect(res.body).toHaveProperty("memory");
            expect(res.body.memory).toHaveProperty("rss");
        });
    });

    describe("GET /metrics", () => {
        it("returns monitoring metrics", async () => {
            const res = await request(app).get("/metrics").expect(200);
            expect(res.body).toHaveProperty("errors");
            expect(res.body).toHaveProperty("database");
            expect(res.body).toHaveProperty("system");
            expect(res.body.system).toHaveProperty("nodeVersion");
            expect(res.body.system).toHaveProperty("memory");
        });
    });
});

describe("404 handling", () => {
    it("returns JSON for unknown routes", async () => {
        const res = await request(app)
            .get("/api/this-route-does-not-exist")
            .expect(404);

        expect(res.body).toEqual({
            success: false,
            error: { message: "Route not found" },
        });
    });

    it("returns JSON for unknown POST routes", async () => {
        const res = await request(app)
            .post("/api/also-not-real")
            .expect(404);

        expect(res.body.success).toBe(false);
    });
});

describe("Error response shapes", () => {
    it("returns JSON for malformed request body", async () => {
        const res = await request(app)
            .post("/api/student")
            .set("Content-Type", "application/json")
            .send('{"invalid": json}')
            .expect(400);

        expect(res.headers["content-type"]).toMatch(/json/);
    });

    it("returns structured validation error for missing fields", async () => {
        const res = await request(app)
            .post("/api/auth/register")
            .send({ email: "test@example.com" })
            .expect(400);

        expect(res.body).toHaveProperty("message");
    });
});

describe("Security headers", () => {
    it("includes helmet security headers", async () => {
        const res = await request(app).get("/health/live").expect(200);

        expect(res.headers["x-content-type-options"]).toBe("nosniff");
        expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
        expect(res.headers).toHaveProperty("content-security-policy");
    });
});

describe("CORS", () => {
    it("includes CORS headers", async () => {
        const res = await request(app)
            .get("/health/live")
            .set("Origin", "http://localhost:5173")
            .expect(200);

        expect(res.headers).toHaveProperty("access-control-allow-origin");
    });
});

describe("Rate limiting", () => {
    it("allows normal request volume to students endpoint", async () => {
        const res = await request(app)
            .get("/api/students")
            .expect(401);

        expect(res.status).toBe(401);
    });
});
