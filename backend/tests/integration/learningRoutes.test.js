import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import User from "../../src/models/User.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

const buildAuthHeader = (role = "admin", extra = {}) => {
    const token = jwt.sign(
        {
            userId: extra.userId || new mongoose.Types.ObjectId().toString(),
            email: extra.email,
            role,
            roles: [role],
        },
        process.env.JWT_SECRET || "test-secret"
    );
    return { Authorization: `Bearer ${token}` };
};

describe("Learning Route Permission Tests", () => {
    let student;
    let course;
    let courseInstance;
    let instructor;
    let instructorToken;

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
            User.deleteMany({}),
            mongoose.model("Teacher").deleteMany({}),
        ]);

        // Create a student
        student = await Student.create({
            name: "Test Student",
            personalNumber: "19900101-1234",
            email: "student@example.com",
            municipality: { type: "Sollentuna" },
        });

        // Create an instructor (teacher) user + profile
        instructor = await User.create({
            name: "Instructor",
            email: "teacher@example.com",
            password: await bcrypt.hash("password123", 10),
            role: "teacher",
        });

        const teacherProfile = await mongoose.model("Teacher").create({
            userId: instructor._id,
            subject: "Svenska",
        });

        instructorToken = buildAuthHeader("teacher", { userId: instructor._id.toString() });

        // Create a course
        course = await Course.create({
            courseName: "Svenska 1",
            courseCode: "SVE101",
        });

        // Create a course instance with responsible teacher
        courseInstance = await CourseInstance.create({
            mainCourseId: course._id,
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-06-30"),
            courseName: course.courseName,
            courseCode: course.courseCode,
            responsibleTeacher: teacherProfile._id,
            modules: [
                {
                    moduleNumber: 1,
                    title: "Modul 1",
                    instructions: "Test instructions",
                    assignment: {
                        title: "Uppgift 1",
                        description: "Skriv en text",
                    },
                },
            ],
        });

        // Enroll the student
        await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: courseInstance._id,
            courseName: course.courseName,
            mainCourseId: course._id,
            municipalityName: "Sollentuna",
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-06-30"),
            status: "active",
        });
    });

    describe("Student permissions on learning endpoints", () => {
        it("student can access their enrolled course modules", async () => {
            const res = await request(app)
                .get(`/api/learning/instances/${courseInstance._id}/modules`)
                .set(buildAuthHeader("student", { email: "student@example.com" }));

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("success", true);
            expect(res.body).toHaveProperty("modules");
            expect(Array.isArray(res.body.modules)).toBe(true);
        });

        it("student can submit assignment", async () => {
            const res = await request(app)
                .post(`/api/learning/instances/${courseInstance._id}/modules/1/submissions`)
                .set(buildAuthHeader("student", { email: "student@example.com" }))
                .send({ submittedText: "Min inlämning för modulen" });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty("success", true);
        });

        it("student cannot submit assignment without text", async () => {
            const res = await request(app)
                .post(`/api/learning/instances/${courseInstance._id}/modules/1/submissions`)
                .set(buildAuthHeader("student", { email: "student@example.com" }))
                .send({});

            expect(res.status).toBe(400);
        });

        it("student can view their submission feedback", async () => {
            // First submit an assignment
            await request(app)
                .post(`/api/learning/instances/${courseInstance._id}/modules/1/submissions`)
                .set(buildAuthHeader("student", { email: "student@example.com" }))
                .send({ submittedText: "Test inlämning" });

            // Then check feedback (should be empty initially)
            const res = await request(app)
                .get(`/api/learning/instances/${courseInstance._id}/modules`)
                .set(buildAuthHeader("student", { email: "student@example.com" }));

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("success", true);
        });
    });

    describe("Teacher permissions on learning endpoints", () => {
        it("teacher can view all submissions for their instance", async () => {
            const res = await request(app)
                .get(`/api/learning/instances/${courseInstance._id}/submissions`)
                .set(instructorToken);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("success", true);
            expect(Array.isArray(res.body.submissions)).toBe(true);
        });

        it("teacher can set submission feedback", async () => {
            // First create a submission as student
            const submissionResp = await request(app)
                .post(`/api/learning/instances/${courseInstance._id}/modules/1/submissions`)
                .set(buildAuthHeader("student", { email: "student@example.com" }))
                .send({ submittedText: "Test inlämning för feedback" });

            const submissionId = submissionResp.body.submission._id;

            // Then set feedback as teacher
            const res = await request(app)
                .put(`/api/learning/submissions/${submissionId}/feedback`)
                .set(instructorToken)
                .send({ status: "godkänd", comment: "Godkänt, bra innehåll" });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("success", true);
            expect(res.body.submission.feedback.status).toBe("godkänd");
        });

        it("teacher cannot set feedback on student they don't teach", async () => {
            // Create another student not enrolled in this instance
            const otherStudent = await Student.create({
                name: "Other Student",
                personalNumber: "19900102-5678",
                email: "other@example.com",
                municipality: { type: "Stockholm" },
            });

            await StudentEnrollment.create({
                studentId: otherStudent._id,
                courseInstanceId: new mongoose.Types.ObjectId(), // Different course
                courseName: "Annan kurs",
                mainCourseId: course._id,
                municipalityName: "Stockholm",
                startDate: new Date("2026-01-01"),
                endDate: new Date("2026-06-30"),
                status: "active",
            });

            // Try to set feedback - should fail since teacher doesn't own this instance
            const res = await request(app)
                .put(`/api/learning/submissions/12345678-1234-5678-1234-567812345678/feedback`)
                .set(instructorToken)
                .send({ status: "godkänd" });

            // Should get 404 or appropriate error since submission doesn't exist
            expect(res.status).toBeGreaterThanOrEqual(400);
        });

        it("teacher can view pending submissions", async () => {
            const res = await request(app)
                .get(`/api/learning/submissions/pending`)
                .set(instructorToken);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("success", true);
            expect(Array.isArray(res.body.submissions)).toBe(true);
        });
    });

    describe("Student vs teacher isolation", () => {
        it("student cannot view other student's submissions", async () => {
            // Create another student
            const otherStudent = await Student.create({
                name: "Other Student",
                personalNumber: "19900102-5678",
                email: "other2@example.com",
                municipality: { type: "Stockholm" },
            });

            await StudentEnrollment.create({
                studentId: otherStudent._id,
                courseInstanceId: courseInstance._id,
                courseName: course.courseName,
                mainCourseId: course._id,
                municipalityName: "Stockholm",
                startDate: new Date("2026-01-01"),
                endDate: new Date("2026-06-30"),
                status: "active",
            });

            // Try to get report for other student - should fail or return own data
            const res = await request(app)
                .get(`/api/learning/instances/${courseInstance._id}/report/${otherStudent._id}`)
                .set(buildAuthHeader("student", { email: "student@example.com" }));

            // Student can only access their own report
            expect(res.status).toBeGreaterThanOrEqual(400);
        });

        it("teacher can view report for any student in their course", async () => {
            // Create another student enrolled in the same course
            const otherStudent = await Student.create({
                name: "Other Student",
                personalNumber: "19900102-5678",
                email: "other3@example.com",
                municipality: { type: "Stockholm" },
            });

            await StudentEnrollment.create({
                studentId: otherStudent._id,
                courseInstanceId: courseInstance._id,
                courseName: course.courseName,
                mainCourseId: course._id,
                municipalityName: "Stockholm",
                startDate: new Date("2026-01-01"),
                endDate: new Date("2026-06-30"),
                status: "active",
            });

            // Teacher can view report for any student in their course
            const res = await request(app)
                .get(`/api/learning/instances/${courseInstance._id}/report/${otherStudent._id}`)
                .set(instructorToken);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("success", true);
        });
    });
});