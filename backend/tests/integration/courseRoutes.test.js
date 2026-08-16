import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import User from "../../src/models/User.js";
import Course from "../../src/models/Course.js";
import AuditLog from "../../src/models/AuditLog.js";
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

let authCookie;
let adminUserId;

describe("courseRoutes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([Course.deleteMany({}), User.deleteMany({}), AuditLog.deleteMany({})]);

        const hashed = await bcrypt.hash("testPassword123!", 10);
        const adminUser = await User.create({
            name: "Test Admin",
            email: "testadmin@example.com",
            password: hashed,
            roles: ["admin"],
        });
        adminUserId = adminUser._id;
        const token = jwt.sign(
            {
                userId: adminUser._id.toString(),
                role: "admin",
                roles: ["admin"],
                name: adminUser.name,
                email: adminUser.email,
            },
            process.env.JWT_SECRET || "test-secret"
        );
        authCookie = `token=${token}`;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("GET /api/courses", () => {
        it("returns all courses", async () => {
            await createCourse();
            const response = await request(app).get("/api/courses").expect(200);
            expect(response.body).toHaveLength(1);
        });
    });

    describe("GET /api/courses/:courseId", () => {
        it("returns a single course", async () => {
            const course = await createCourse();
            const response = await request(app)
                .get(`/api/courses/${course._id}`)
                .expect(200);
            expect(response.body.courseName).toBe("Test Course");
        });

        it("returns 400 for invalid courseId", async () => {
            const response = await request(app)
                .get("/api/courses/not-a-valid-id")
                .expect(400);
            expect(response.body).toHaveProperty("success", false);
        });

        it("returns 404 when course does not exist", async () => {
            const response = await request(app)
                .get(`/api/courses/${new mongoose.Types.ObjectId()}`)
                .expect(404);
            expect(response.body).toEqual({ error: "Course not found" });
        });
    });

    describe("GET /api/course/:id", () => {
        it("returns 404 when course does not exist", async () => {
            const response = await request(app)
                .get(`/api/course/${new mongoose.Types.ObjectId()}`)
                .expect(404);
            expect(response.body).toEqual({ message: "Course not found" });
        });

        it("returns 500 when server fails", async () => {
            vi.spyOn(Course, "findById").mockRejectedValueOnce(new Error("boom"));
            const response = await request(app)
                .get(`/api/course/${new mongoose.Types.ObjectId()}`)
                .expect(500);
            expect(response.body).toEqual({ message: "Server error" });
        });
    });

    describe("POST /api/course", () => {
        it("returns 401 without authentication", async () => {
            const response = await request(app)
                .post("/api/course")
                .send({ courseName: "No Auth", courseCode: "NA001" })
                .expect(401);
            expect(response.body).toHaveProperty("error");
        });

        it("returns 400 when required fields are missing", async () => {
            const response = await request(app)
                .post("/api/course")
                .set("Cookie", authCookie)
                .send({ courseName: "No Code" })
                .expect(400);

            expect(response.body).toEqual({ message: "Alla fält är obligatoriska!" });
        });

        it("creates a course and writes an audit log", async () => {
            const response = await request(app)
                .post("/api/course")
                .set("Cookie", authCookie)
                .send({
                    courseName: "New Course",
                    courseCode: "NC001",
                    coursePoints: "5",
                    courseExtent: "6 weeks",
                })
                .expect(201);

            expect(response.body.courseCode).toBe("NC001");

            const audit = await AuditLog.findOne({ entityType: "Course", action: "create" });
            expect(audit).not.toBeNull();
            expect(audit.performedBy.userId.toString()).toBe(adminUserId.toString());
            expect(audit.performedBy.role).toBe("admin");
        });

        it("returns 500 when course creation fails", async () => {
            vi.spyOn(Course, "create").mockRejectedValueOnce(
                new Error("create failure")
            );

            const response = await request(app)
                .post("/api/course")
                .set("Cookie", authCookie)
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

    describe("PUT /api/course/:id", () => {
        it("returns 401 without authentication", async () => {
            const course = await createCourse();
            const response = await request(app)
                .put(`/api/course/${course._id}`)
                .send({ courseName: "Updated" })
                .expect(401);
            expect(response.body).toHaveProperty("error");
        });

        it("updates a course and writes an audit log", async () => {
            const course = await createCourse();
            const response = await request(app)
                .put(`/api/course/${course._id}`)
                .set("Cookie", authCookie)
                .send({ courseName: "Updated Name" })
                .expect(200);

            expect(response.body.courseName).toBe("Updated Name");

            const audit = await AuditLog.findOne({ entityType: "Course", action: "update" });
            expect(audit).not.toBeNull();
            expect(audit.entityId.toString()).toBe(course._id.toString());
        });

        it("returns 404 for a missing course", async () => {
            const response = await request(app)
                .put(`/api/course/${new mongoose.Types.ObjectId()}`)
                .set("Cookie", authCookie)
                .send({ courseName: "Updated" })
                .expect(404);
            expect(response.body).toEqual({ error: "Course not found" });
        });
    });

    describe("DELETE /api/course/:id", () => {
        it("returns 401 without authentication", async () => {
            const course = await createCourse();
            const response = await request(app)
                .delete(`/api/course/${course._id}`)
                .expect(401);
            expect(response.body).toHaveProperty("error");
        });

        it("deletes a course and writes an audit log", async () => {
            const course = await createCourse();
            const response = await request(app)
                .delete(`/api/course/${course._id}`)
                .set("Cookie", authCookie)
                .expect(200);

            expect(response.body).toEqual({ message: "Course deleted", id: course._id.toString() });
            expect(await Course.findById(course._id)).toBeNull();

            const audit = await AuditLog.findOne({ entityType: "Course", action: "delete" });
            expect(audit).not.toBeNull();
        });

        it("returns 404 for a missing course", async () => {
            const response = await request(app)
                .delete(`/api/course/${new mongoose.Types.ObjectId()}`)
                .set("Cookie", authCookie)
                .expect(404);
            expect(response.body).toEqual({ error: "Course not found" });
        });
    });
});
