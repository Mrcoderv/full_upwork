import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import app from "../../index.js";
import Course from "../../src/models/Course.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const createCourse = async (overrides = {}) =>
    Course.create({
        courseName: overrides.courseName ?? "Test Course",
        courseCode: overrides.courseCode ?? "TC101",
        coursePoints: overrides.coursePoints ?? "5",
        courseExtent: overrides.courseExtent ?? "10 weeks",
    });

describe("courseRoutes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Course.deleteMany({});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("GET /api/courses", () => {
        it("returns 500 when fetching courses fails", async () => {
            vi.spyOn(Course, "find").mockRejectedValueOnce(
                new Error("find failure")
            );

            const response = await request(app)
                .get("/api/courses")
                .expect(500);

            expect(response.body).toEqual({ error: "Internal Server Error" });
        });
    });

    describe("GET /api/courses/:courseId", () => {
        it("returns a course by id", async () => {
            const course = await createCourse();

            const response = await request(app)
                .get(`/api/courses/${course._id}`)
                .expect(200);

            expect(response.body).toMatchObject({
                courseName: "Test Course",
                courseCode: "TC101",
            });
        });

        it("returns 404 when course is missing", async () => {
            const response = await request(app)
                .get(`/api/courses/${new mongoose.Types.ObjectId()}`)
                .expect(404);

            expect(response.body).toEqual({ error: "Course not found" });
        });

        it("returns 500 when lookup throws", async () => {
            vi.spyOn(Course, "findById").mockRejectedValueOnce(
                new Error("lookup failure")
            );

            const response = await request(app)
                .get(`/api/courses/${new mongoose.Types.ObjectId()}`)
                .expect(500);

            expect(response.body).toEqual({ error: "Internal Server Error" });
        });
    });

    describe("GET /api/course/:id", () => {
        it("returns 404 when course is missing", async () => {
            const response = await request(app)
                .get(`/api/course/${new mongoose.Types.ObjectId()}`)
                .expect(404);

            expect(response.body).toEqual({ message: "Course not found" });
        });

        it("returns 500 when lookup throws", async () => {
            vi.spyOn(Course, "findById").mockRejectedValueOnce(
                new Error("lookup failure")
            );

            const response = await request(app)
                .get(`/api/course/${new mongoose.Types.ObjectId()}`)
                .expect(500);

            expect(response.body).toEqual({ message: "Server error" });
        });
    });

    describe("POST /api/course", () => {
        it("returns 400 when required fields are missing", async () => {
            const response = await request(app)
                .post("/api/course")
                .send({ courseName: "No Code" })
                .expect(400);

            expect(response.body).toEqual({ message: "Alla fält är obligatoriska!" });
        });

        it("returns 500 when course creation fails", async () => {
            vi.spyOn(Course, "create").mockRejectedValueOnce(
                new Error("create failure")
            );

            const response = await request(app)
                .post("/api/course")
                .send({
                    courseName: "Broken",
                    courseCode: "BR001",
                    coursePoints: "5",
                    courseExtent: "6 weeks",
                })
                .expect(500);

            expect(response.body).toEqual({ error: "Internal Server Error" });
        });
    });
});
