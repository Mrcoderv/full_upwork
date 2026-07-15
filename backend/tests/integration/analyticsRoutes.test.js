import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import Teacher from "../../src/models/Teacher.js";
import User from "../../src/models/User.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

const buildAuthHeader = (role = "admin") => {
    const token = jwt.sign(
        {
            userId: new mongoose.Types.ObjectId().toString(),
            role,
            roles: [role],
        },
        process.env.JWT_SECRET || "test-secret"
    );
    return { Authorization: `Bearer ${token}` };
};

describe("Analytics Routes Integration Tests", () => {
    let student;
    let course;
    let instance;

    beforeAll(async () => {
        await connectTestDatabase();
        process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
    });

    afterAll(async () => {
        await disconnectTestDatabase();
    });

    beforeEach(async () => {
        // Clear collections
        await Promise.all([
            Student.deleteMany({}),
            Course.deleteMany({}),
            CourseInstance.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            Teacher.deleteMany({}),
            User.deleteMany({}),
        ]);

        // Seed data
        student = await Student.create({
            name: "Test Student",
            personalNumber: "19900101-1234",
            email: "student@example.com",
            municipality: { type: "Sollentuna" },
        });

        course = await Course.create({
            courseName: "Svenska 1",
            courseCode: "SVE101",
        });

        instance = await CourseInstance.create({
            mainCourseId: course._id,
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-06-30"),
            courseName: course.courseName,
            courseCode: course.courseCode,
        });

        await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: course._id,
            courseName: course.courseName,
            municipalityName: "Sollentuna",
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-06-30"),
            status: "completed",
            grade: "B",
            gradeDate: new Date("2026-06-25"),
        });
    });

    describe("Access Control", () => {
        it("returns 401 for unauthenticated request to /filters", async () => {
            await request(app)
                .get("/api/analytics/filters")
                .expect(401);
        });

        it("returns 403 for non-admin user accessing /filters", async () => {
            await request(app)
                .get("/api/analytics/filters")
                .set(buildAuthHeader("teacher"))
                .expect(403);
        });

        it("allows admin user to access /filters", async () => {
            const res = await request(app)
                .get("/api/analytics/filters")
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(res.body).toHaveProperty("municipalities");
            expect(res.body).toHaveProperty("courses");
            expect(res.body).toHaveProperty("teachers");
        });
    });

    describe("Reporting Endpoints", () => {
        it("returns revenue report data for admins", async () => {
            const res = await request(app)
                .get("/api/analytics/revenue")
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(res.body).toHaveProperty("totalRevenue");
            expect(res.body).toHaveProperty("byMunicipality");
            expect(res.body).toHaveProperty("byCourse");
            expect(res.body.totalRevenue).toBeGreaterThan(0);
        });

        it("returns monthly income forecast for admins", async () => {
            const res = await request(app)
                .get("/api/analytics/forecast")
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(res.body).toHaveProperty("history");
            expect(res.body).toHaveProperty("forecast");
        });

        it("returns student report statistics for admins", async () => {
            const res = await request(app)
                .get("/api/analytics/students")
                .query({ groupBy: "month" })
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
            expect(res.body[0]).toHaveProperty("enrollments");
            expect(res.body[0]).toHaveProperty("uniqueStudents");
            expect(res.body[0]).toHaveProperty("active");
            expect(res.body[0]).toHaveProperty("completions");
        });

        it("returns grade distribution report data for admins", async () => {
            const res = await request(app)
                .get("/api/analytics/grades")
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(res.body).toHaveProperty("overall");
            expect(res.body).toHaveProperty("perCourse");
            expect(res.body).toHaveProperty("perTeacher");
            expect(res.body).toHaveProperty("perMunicipality");
        });

        it("returns popular courses ranked by enrollments", async () => {
            const res = await request(app)
                .get("/api/analytics/popular-courses")
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
            expect(res.body[0].course).toBe("Svenska 1");
        });

        it("returns dropouts / avbrott reports data for admins", async () => {
            const res = await request(app)
                .get("/api/analytics/dropouts")
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(res.body).toHaveProperty("byMonth");
            expect(res.body).toHaveProperty("byCourse");
        });
    });
});
