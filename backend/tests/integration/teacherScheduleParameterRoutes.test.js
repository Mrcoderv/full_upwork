import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import User from "../../src/models/User.js";
import Teacher from "../../src/models/Teacher.js";
import TeacherScheduleParameters from "../../src/models/TeacherScheduleParameters.js";
import AuditLog from "../../src/models/AuditLog.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const VALID_OFFSETS = [0, 1, 2, 3, 4];

let authCookie;
let adminUserId;
let teacherId;

const makeToken = (user) =>
    jwt.sign(
        {
            userId: user._id.toString(),
            role: "admin",
            roles: ["admin"],
            name: user.name,
            email: user.email,
        },
        process.env.JWT_SECRET || "test-secret"
    );

describe("teacherScheduleParameterRoutes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            TeacherScheduleParameters.deleteMany({}),
            User.deleteMany({}),
            Teacher.deleteMany({}),
            AuditLog.deleteMany({}),
        ]);

        const hashed = await bcrypt.hash("testPassword123!", 10);
        const adminUser = await User.create({
            name: "Test Admin",
            email: "testadmin@example.com",
            password: hashed,
            roles: ["admin"],
        });
        adminUserId = adminUser._id;
        authCookie = `token=${makeToken(adminUser)}`;

        const teacherUser = await User.create({
            name: "Test Teacher",
            email: "testteacher@example.com",
            password: hashed,
            roles: ["teacher"],
        });
        const teacher = await Teacher.create({
            userId: teacherUser._id,
            subject: "Matematik",
        });
        teacherId = teacher._id;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const createParams = async (overrides = {}) =>
        TeacherScheduleParameters.create({
            teacherId: teacherId,
            courseId: new mongoose.Types.ObjectId().toString(),
            lengthWeeks: 10,
            sectionOffsets: VALID_OFFSETS,
            ...overrides,
        });

    describe("auth", () => {
        it("returns 401 for unauthenticated list", async () => {
            const response = await request(app)
                .get("/api/teacher-schedule-parameters")
                .expect(401);
            expect(response.body).toHaveProperty("error");
        });

        it("returns 403 for a non-admin user", async () => {
            const hashed = await bcrypt.hash("testPassword123!", 10);
            const teacherUser = await User.create({
                name: "Teacher Only",
                email: "teacheronly@example.com",
                password: hashed,
                roles: ["teacher"],
            });
            const token = jwt.sign(
                {
                    userId: teacherUser._id.toString(),
                    role: "teacher",
                    roles: ["teacher"],
                    name: teacherUser.name,
                    email: teacherUser.email,
                },
                process.env.JWT_SECRET || "test-secret"
            );

            const response = await request(app)
                .get("/api/teacher-schedule-parameters")
                .set("Cookie", `token=${token}`)
                .expect(403);
            expect(response.body).toHaveProperty("error");
        });
    });

    describe("GET /api/teacher-schedule-parameters", () => {
        it("lists all parameters", async () => {
            await createParams();
            const response = await request(app)
                .get("/api/teacher-schedule-parameters")
                .set("Cookie", authCookie)
                .expect(200);
            expect(response.body).toHaveLength(1);
            expect(response.body[0].sectionOffsets).toEqual(VALID_OFFSETS);
        });
    });

    describe("POST /api/teacher-schedule-parameters", () => {
        it("returns 400 when required fields are missing", async () => {
            const response = await request(app)
                .post("/api/teacher-schedule-parameters")
                .set("Cookie", authCookie)
                .send({})
                .expect(400);
            expect(response.body).toEqual({ message: "Alla fält är obligatoriska!" });
        });

        it("returns 400 for an invalid lengthWeeks", async () => {
            const response = await request(app)
                .post("/api/teacher-schedule-parameters")
                .set("Cookie", authCookie)
                .send({
                    teacherId: teacherId.toString(),
                    courseId: new mongoose.Types.ObjectId().toString(),
                    lengthWeeks: 7,
                })
                .expect(400);
            expect(response.body).toEqual({
                success: false,
                error: { message: "Validation failed", details: { lengthWeeks: "måste vara 5, 10 eller 20" } },
            });
        });

        it("returns 400 for invalid sectionOffsets", async () => {
            const response = await request(app)
                .post("/api/teacher-schedule-parameters")
                .set("Cookie", authCookie)
                .send({
                    teacherId: teacherId.toString(),
                    courseId: new mongoose.Types.ObjectId().toString(),
                    lengthWeeks: 10,
                    sectionOffsets: [0, 1],
                })
                .expect(400);
            expect(response.body).toEqual({
                success: false,
                error: { message: "Validation failed", details: { sectionOffsets: "måste ha exakt 5 värden (en per modul)" } },
            });
        });

        it("creates parameters and writes an audit log", async () => {
            const response = await request(app)
                .post("/api/teacher-schedule-parameters")
                .set("Cookie", authCookie)
                .send({
                    teacherId: teacherId.toString(),
                    courseId: new mongoose.Types.ObjectId().toString(),
                    lengthWeeks: 10,
                    sectionOffsets: VALID_OFFSETS,
                })
                .expect(201);

            expect(response.body.lengthWeeks).toBe(10);

            const audit = await AuditLog.findOne({ entityType: "TeacherScheduleParameters", action: "create" });
            expect(audit).not.toBeNull();
            expect(audit.performedBy.userId.toString()).toBe(adminUserId.toString());
        });

        it("returns 409 when the combination already exists", async () => {
            const existing = await createParams();
            const response = await request(app)
                .post("/api/teacher-schedule-parameters")
                .set("Cookie", authCookie)
                .send({
                    teacherId: teacherId.toString(),
                    courseId: existing.courseId,
                    lengthWeeks: 10,
                    sectionOffsets: VALID_OFFSETS,
                })
                .expect(409);
            expect(response.body).toHaveProperty("message");
        });
    });

    describe("PUT /api/teacher-schedule-parameters/:teacherId/:courseId/:lengthWeeks", () => {
        it("updates offsets and writes an audit log", async () => {
            const existing = await createParams();
            const newOffsets = [0, 2, 4, 6, 8];

            const response = await request(app)
                .put(`/api/teacher-schedule-parameters/${existing.teacherId}/${existing.courseId}/${existing.lengthWeeks}`)
                .set("Cookie", authCookie)
                .send({ sectionOffsets: newOffsets })
                .expect(200);

            expect(response.body.sectionOffsets).toEqual(newOffsets);

            const audit = await AuditLog.findOne({ entityType: "TeacherScheduleParameters", action: "update" });
            expect(audit).not.toBeNull();
            expect(audit.performedBy.userId.toString()).toBe(adminUserId.toString());
        });

        it("returns 404 for a missing combination", async () => {
            const response = await request(app)
                .put(`/api/teacher-schedule-parameters/${teacherId}/${new mongoose.Types.ObjectId().toString()}/5`)
                .set("Cookie", authCookie)
                .send({ sectionOffsets: VALID_OFFSETS })
                .expect(404);
            expect(response.body).toEqual({ message: "Schedule parameters not found" });
        });
    });

    describe("DELETE /api/teacher-schedule-parameters/:teacherId/:courseId/:lengthWeeks", () => {
        it("deletes parameters and writes an audit log", async () => {
            const existing = await createParams();
            const response = await request(app)
                .delete(`/api/teacher-schedule-parameters/${existing.teacherId}/${existing.courseId}/${existing.lengthWeeks}`)
                .set("Cookie", authCookie)
                .expect(200);
            expect(response.body).toEqual({ message: "Schedule parameters deleted successfully" });
            expect(await TeacherScheduleParameters.findById(existing._id)).toBeNull();

            const audit = await AuditLog.findOne({ entityType: "TeacherScheduleParameters", action: "delete" });
            expect(audit).not.toBeNull();
        });

        it("returns 404 for a missing combination", async () => {
            const response = await request(app)
                .delete(`/api/teacher-schedule-parameters/${teacherId}/${new mongoose.Types.ObjectId().toString()}/5`)
                .set("Cookie", authCookie)
                .expect(404);
            expect(response.body).toEqual({ message: "Schedule parameters not found" });
        });
    });
});
