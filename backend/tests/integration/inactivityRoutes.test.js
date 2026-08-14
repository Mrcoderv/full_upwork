import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import User from "../../src/models/User.js";
import Teacher from "../../src/models/Teacher.js";
import AssignmentSubmission from "../../src/models/AssignmentSubmission.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

const dayMs = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * dayMs);
const daysAhead = (days) => new Date(Date.now() + days * dayMs);

const buildAuthHeader = (role, userId = null) => {
    const token = jwt.sign(
        {
            userId: userId || new mongoose.Types.ObjectId().toString(),
            role,
            roles: [role],
        },
        process.env.JWT_SECRET || "test-secret"
    );
    return { Authorization: `Bearer ${token}` };
};

describe("Inactivity Report Routes Integration Tests", () => {
    let studentA;
    let studentB;
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
        await Promise.all([
            Student.deleteMany({}),
            Course.deleteMany({}),
            CourseInstance.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            User.deleteMany({}),
            Teacher.deleteMany({}),
            AssignmentSubmission.deleteMany({}),
        ]);

        course = await Course.create({
            courseName: "Matematik 1",
            courseCode: "MAT101",
        });

        instance = await CourseInstance.create({
            mainCourseId: course._id,
            startDate: daysAgo(60),
            endDate: daysAhead(60),
            courseName: course.courseName,
            courseCode: course.courseCode,
        });

        studentA = await Student.create({
            name: "Anna Svensson",
            personalNumber: "19950101-1234",
            email: "anna@elev.se",
            municipality: { type: "Sollentuna" },
        });

        studentB = await Student.create({
            name: "Erik Karlsson",
            personalNumber: "19960101-5678",
            email: "erik@elev.se",
        });

        await User.create({
            email: "anna@elev.se",
            password: "hashed-placeholder",
            roles: ["student"],
            lastLoginAt: daysAgo(6),
        });

        await User.create({
            email: "erik@elev.se",
            password: "hashed-placeholder",
            roles: ["student"],
            lastLoginAt: daysAgo(2),
        });

        await StudentEnrollment.create({
            studentId: studentA._id,
            courseInstanceId: instance._id,
            mainCourseId: course._id,
            startDate: daysAgo(40),
            endDate: daysAhead(20),
            status: "active",
        });

        await StudentEnrollment.create({
            studentId: studentB._id,
            courseInstanceId: instance._id,
            mainCourseId: course._id,
            startDate: daysAgo(40),
            endDate: daysAhead(20),
            status: "completed",
        });
    });

    describe("Access Control", () => {
        it("returns 401 for unauthenticated request", async () => {
            await request(app).get("/api/inactivity/report").expect(401);
        });

        it("returns 403 for student-role token", async () => {
            await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("student"))
                .expect(403);
        });

        it("allows admin tokens", async () => {
            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(res.body).toHaveProperty("students");
            expect(res.body).toHaveProperty("summary");
            expect(res.body).toHaveProperty("thresholds");
        });

        it("allows teacher tokens", async () => {
            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("teacher"))
                .expect(200);

            expect(res.body).toHaveProperty("students");
        });
    });

    describe("Report content", () => {
        it("flags students who have not logged in for the withdraw threshold", async () => {
            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            const anna = res.body.students.find((s) => s.studentId === studentA._id.toString());
            expect(anna).toBeDefined();
            expect(anna.daysSinceLastLogin).toBe(6);
            expect(anna.mustWithdraw).toBe(true);
            expect(anna.level).toBe("withdraw");
            expect(anna.name).toBe("Anna Svensson");
            expect(anna.municipality).toBe("Sollentuna");
            expect(anna.enrollments[0].courseName).toBe("Matematik 1");
        });

        it("does not flag students whose enrollments are terminal", async () => {
            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            const erik = res.body.students.find(
                (s) => s.studentId === studentB._id.toString()
            );
            expect(erik).toBeUndefined();
        });

        it("reports the warning flag from a stale submission", async () => {
            await User.updateOne(
                { email: "anna@elev.se" },
                { $set: { lastLoginAt: daysAgo(20) } }
            );
            await AssignmentSubmission.create({
                studentId: studentA._id,
                enrollmentId: (
                    await StudentEnrollment.findOne({ studentId: studentA._id }).lean()
                )._id,
                courseInstanceId: instance._id,
                moduleNumber: 1,
                submittedText: "Inlämning",
                submittedAt: daysAgo(20),
                feedback: { status: "", comment: "" },
            });

            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            const anna = res.body.students.find((s) => s.studentId === studentA._id.toString());
            expect(anna).toBeDefined();
            expect(anna.daysSinceLastSubmission).toBe(20);
            expect(anna.inactiveForWarning).toBe(true);
            expect(anna.openSubmissions).toBe(1);
        });

        it("summarizes report counts", async () => {
            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(res.body.summary.evaluated).toBe(1);
            expect(res.body.summary.mustWithdraw).toBe(1);
            expect(res.body.thresholds).toEqual({ withdrawDays: 5, warningDays: 14 });
        });
    });

    describe("Teacher scope", () => {
        it("only shows students on the teacher's own enrollments", async () => {
            const teacherUser = await User.create({
                email: "karin@larare.se",
                password: "hashed-placeholder",
                roles: ["teacher"],
            });
            const teacher = await Teacher.create({
                userId: teacherUser._id,
                subject: "Matematik",
            });

            const otherCourse = await Course.create({
                courseName: "Svenska 1",
                courseCode: "SVE101",
            });
            const otherInstance = await CourseInstance.create({
                mainCourseId: otherCourse._id,
                startDate: daysAgo(60),
                endDate: daysAhead(60),
                courseName: otherCourse.courseName,
                courseCode: otherCourse.courseCode,
            });
            const otherStudent = await Student.create({
                name: "Lisa Nilsson",
                personalNumber: "19970101-0001",
                email: "lisa@elev.se",
            });
            await User.create({
                email: "lisa@elev.se",
                password: "hashed-placeholder",
                roles: ["student"],
                lastLoginAt: daysAgo(30),
            });
            await StudentEnrollment.create({
                studentId: otherStudent._id,
                courseInstanceId: otherInstance._id,
                mainCourseId: otherCourse._id,
                startDate: daysAgo(40),
                endDate: daysAhead(20),
                status: "active",
                teacherId: teacher._id,
            });

            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("teacher", teacherUser._id.toString()))
                .expect(200);

            const studentIds = res.body.students.map((s) => s.studentId);
            expect(studentIds).toEqual([otherStudent._id.toString()]);
            expect(studentIds).not.toContain(studentA._id.toString());

            const adminRes = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            const adminIds = adminRes.body.students.map((s) => s.studentId);
            expect(adminIds).toContain(otherStudent._id.toString());
            expect(adminIds).toContain(studentA._id.toString());
        });

        it("returns an empty report when the teacher has no enrollments", async () => {
            const teacherUser = await User.create({
                email: "noenrollments@larare.se",
                password: "hashed-placeholder",
                roles: ["teacher"],
            });
            await Teacher.create({ userId: teacherUser._id, subject: "Matematik" });

            const res = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("teacher", teacherUser._id.toString()))
                .expect(200);

            expect(res.body.students).toEqual([]);
            expect(res.body.summary.evaluated).toBe(0);
        });
    });

    describe("Warning email action", () => {
        it("returns 401 for unauthenticated request", async () => {
            await request(app)
                .post(`/api/inactivity/${studentA._id}/warning-email`)
                .expect(401);
        });

        it("returns 403 for student tokens", async () => {
            await request(app)
                .post(`/api/inactivity/${studentA._id}/warning-email`)
                .set(buildAuthHeader("student"))
                .expect(403);
        });

        it("returns 403 for teacher tokens (decision UI is admin-only)", async () => {
            await request(app)
                .post(`/api/inactivity/${studentA._id}/warning-email`)
                .set(buildAuthHeader("teacher"))
                .expect(403);
        });

        it("returns 404 for an unknown student", async () => {
            await request(app)
                .post(`/api/inactivity/${new mongoose.Types.ObjectId()}/warning-email`)
                .set(buildAuthHeader("admin"))
                .expect(404);
        });

        it("sends the warning email and records it for the report", async () => {
            const res = await request(app)
                .post(`/api/inactivity/${studentA._id}/warning-email`)
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.warningSentAt).toBeTruthy();
            expect(res.body.withdrawalDate).toBeTruthy();

            const report = await request(app)
                .get("/api/inactivity/report")
                .set(buildAuthHeader("admin"))
                .expect(200);

            const anna = report.body.students.find(
                (s) => s.studentId === studentA._id.toString()
            );
            expect(anna).toBeDefined();
            expect(anna.warningSentAt).toBeTruthy();
            expect(anna.warnedWithdrawalDate).toBeTruthy();
        });
    });
});
