import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
    vi,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const signToken = (overrides = {}) => {
    const payload = {
        userId: new mongoose.Types.ObjectId().toString(),
        role: "admin",
        name: "Test User",
        email: "test@example.com",
        ...overrides,
    };

    return jwt.sign(payload, process.env.JWT_SECRET || "test-secret");
};

describe("Stats Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Student.deleteMany({});
        await Course.deleteMany({});
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await Student.deleteMany({});
        await Course.deleteMany({});
    });

    it("returns aggregated course stats with grades and municipalities", async () => {
        const course = await Course.create({
            courseName: "Course One",
            courseCode: "C001",
            courseExtent: "5 weeks",
        });

        vi.spyOn(Student, "find").mockResolvedValueOnce([
            {
                municipality: { type: "CityA" },
                education: [
                    {
                        type: "Course",
                        addedAt: new Date("2024-05-15T10:00:00Z"),
                        refId: course._id,
                        grade: "g",
                    },
                    {
                        type: "Course",
                        addedAt: new Date("2024-05-20T10:00:00Z"),
                        refId: course._id,
                        grade: "g",
                    },
                    {
                        type: "Course",
                        addedAt: new Date("2024-05-21T10:00:00Z"),
                        refId: new mongoose.Types.ObjectId(),
                        grade: "a",
                    },
                    {
                        type: "Course",
                        addedAt: new Date("2024-05-22T10:00:00Z"),
                    },
                    {
                        type: "Other",
                        addedAt: new Date("2024-05-23T10:00:00Z"),
                        refId: course._id,
                        grade: "a",
                    },
                ],
            },
            {
                municipality: { type: "CityB" },
                education: [
                    {
                        type: "Course",
                        addedAt: new Date("2024-05-10T10:00:00Z"),
                        refId: course._id,
                        grade: "",
                    },
                ],
            },
            {
                education: [
                    {
                        type: "Course",
                        addedAt: new Date("2024-05-11T10:00:00Z"),
                        refId: course._id,
                        grade: "f",
                    },
                ],
            },
        ]);

        const token = signToken();
        const response = await request(app)
            .get("/api/stats/courses-per-month")
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(response.body).toHaveProperty("2024-05");
        expect(response.body["2024-05"]).toHaveProperty("Course One");

        const stats = response.body["2024-05"]["Course One"];
        expect(stats.G).toBe(2);
        expect(stats.UNKNOWN).toBe(1);
        expect(stats.F).toBe(1);
        expect(stats._municipality.sort()).toEqual(
            ["CityA", "CityB", "UNKNOWN"].sort()
        );
    });

    it("returns an empty object when no stats are available", async () => {
        vi.spyOn(Student, "find").mockResolvedValueOnce([
            {
                name: "Student No Courses",
                municipality: { type: "CityC" },
            },
        ]);

        const token = signToken();
        const response = await request(app)
            .get("/api/stats/courses-per-month")
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(response.body).toEqual({});
    });

    it("returns 500 when stats generation fails", async () => {
        vi.spyOn(Student, "find").mockRejectedValueOnce(
            new Error("Database failure")
        );

        const token = signToken();
        const response = await request(app)
            .get("/api/stats/courses-per-month")
            .set("Authorization", `Bearer ${token}`)
            .expect(500);

        expect(response.body).toEqual({ error: "Failed to generate stats" });
    });
});
