import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Question from "../../src/models/Question.js";
import ExamAttempt from "../../src/models/ExamAttempt.js";
import Course from "../../src/models/Course.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import Teacher from "../../src/models/Teacher.js";
import User from "../../src/models/User.js";
import app from "../../index.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

const buildAuthHeader = (role = "admin") => {
    const token = jwt.sign(
        { userId: new mongoose.Types.ObjectId().toString(), role, roles: [role] },
        process.env.JWT_SECRET || "test-secret"
    );
    return { Authorization: `Bearer ${token}` };
};

const adminUser = () => ({ userId: new mongoose.Types.ObjectId().toString(), role: "admin", roles: ["admin"] });

describe("Question Bank Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
        process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            Course.deleteMany({}),
            Question.deleteMany({}),
            ExamAttempt.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            Teacher.deleteMany({}),
            User.deleteMany({}),
        ]);
    }, 60000);

    afterEach(async () => {
        await Promise.all([
            Course.deleteMany({}),
            Question.deleteMany({}),
            ExamAttempt.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            Teacher.deleteMany({}),
            User.deleteMany({}),
        ]);
    });

    it("fetches all questions", async () => {
        const course = await Course.create({
            courseName: "Svenska 1",
            courseCode: "SVEN01",
        });

        await Question.create({
            questionText: "Vad är huvudstaden i Sverige?",
            course: course._id,
            subject: "Samhällskunskap",
            questionType: "multipleChoice",
            options: ["Stockholm", "Göteborg", "Malmö", "Umeå"],
            correctAnswer: "Stockholm",
            createdBy: adminUser().userId,
        });

        const response = await request(app)
            .get("/api/question-bank")
            .set(buildAuthHeader("admin"));
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.questions).toHaveLength(1);
        expect(response.body.total).toBe(1);
    });

    it("filters questions by subject", async () => {
        const course = await Course.create({
            courseName: "Samhällskunskap 1",
            courseCode: "SSK01",
        });

        await Question.create({
            questionText: "Vad är medelpunkten?",
            course: course._id,
            subject: "Samhällskunskap",
            questionType: "essay",
            createdBy: adminUser().userId,
        });

        const response = await request(app)
            .get("/api/question-bank?subject=Samhällskunskap")
            .set(buildAuthHeader("admin"));
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.total).toBe(1);
    });

    it("creates a new question", async () => {
        const course = await Course.create({
            courseName: "Matematik 1",
            courseCode: "MAT01",
        });

        const response = await request(app)
            .post("/api/question-bank")
            .set(buildAuthHeader("admin"))
            .send({
                questionText: "Vad är 2 + 2?",
                course: course._id,
                subject: "Matematik",
                questionType: "multipleChoice",
                options: ["2", "3", "4", "5"],
                correctAnswer: "4",
            });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe("Fråga skapad");
    });

    it("generates exam from question bank", async () => {
        const course = await Course.create({
            courseName: "Svenska 1",
            courseCode: "SVEN01",
        });

        await Question.create({
            questionText: "Vad är huvudstaden i Sverige?",
            course: course._id,
            subject: "Samhällskunskap",
            questionType: "multipleChoice",
            options: ["Stockholm", "Göteborg", "Malmö", "Umeå"],
            correctAnswer: "Stockholm",
            createdBy: adminUser().userId,
        });

        const response = await request(app)
            .post("/api/question-bank/generate-exam")
            .set(buildAuthHeader("admin"))
            .send({
                courseId: course._id,
                numberOfQuestions: 1,
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.selectedCount).toBe(1);
        expect(response.body.totalAvailable).toBe(1);
        expect(response.body.examAttemptId).toBeDefined();
    });

    it("returns error when generating exam with no questions", async () => {
        const course = await Course.create({
            courseName: "Tom kurs",
            courseCode: "TOM01",
        });

        const response = await request(app)
            .post("/api/question-bank/generate-exam")
            .set(buildAuthHeader("admin"))
            .send({
                courseId: course._id,
                numberOfQuestions: 5,
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Inga frågor hittades");
    });

    it("fetches exam attempts", async () => {
        const response = await request(app)
            .get("/api/question-bank/exam-attempts")
            .set(buildAuthHeader("admin"));

        // Temporarily expose the actual response for debugging
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.examAttempts)).toBe(true);
    });
});
