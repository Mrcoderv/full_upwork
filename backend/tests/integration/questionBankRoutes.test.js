import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import Question from "../../src/models/Question.js";
import ExamAttempt from "../../src/models/ExamAttempt.js";
import Course from "../../src/models/Course.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import Teacher from "../../src/models/Teacher.js";
import User from "../../src/models/User.js";
import app from "../../index.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

describe("Question Bank Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
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
        vi.restoreAllMocks();
    });

    const authHeaders = (role) => ({
        "x-test-user-role": role,
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
        });

        const response = await request(app)
            .get("/question-bank")
            .set(authHeaders("admin"));
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.questions).toBeArrayOfLength(1);
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
        });

        const response = await request(app)
            .get("/question-bank?subject=Samhällskunskap")
            .set(authHeaders("admin"));
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
            .post("/question-bank")
            .set(authHeaders("admin"))
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
        });

        const response = await request(app)
            .post("/question-bank/generate-exam")
            .set(authHeaders("admin"))
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
            .post("/question-bank/generate-exam")
            .set(authHeaders("admin"))
            .send({
                courseId: course._id,
                numberOfQuestions: 5,
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Inga frågor hittades");
    });

    it("fetches exam attempts", async () => {
        const response = await request(app)
            .get("/question-bank/exam-attempts")
            .set(authHeaders("admin"));

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.examAttempts).toBeArray();
    });
});
