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
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import User from "../../src/models/User.js";
import Student from "../../src/models/Student.js";
import AuditLog from "../../src/models/AuditLog.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

let authCookie;
let teacherCookie;
let adminUserId;

const makeToken = (user) =>
    jwt.sign(
        {
            userId: user._id.toString(),
            role: user.roles[0],
            roles: user.roles,
            name: user.name,
            email: user.email,
        },
        process.env.JWT_SECRET || "test-secret"
    );

const createStudent = async () =>
    Student.create({
        name: "Logbook Student",
        personalNumber: "19900101-1234",
        email: `logbook${new mongoose.Types.ObjectId()}@example.com`,
    });

describe("logbook routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            Student.deleteMany({}),
            User.deleteMany({}),
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
        teacherCookie = `token=${makeToken(teacherUser)}`;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("GET /api/students/:studentId/logbook", () => {
        it("returns 401 without authentication", async () => {
            const student = await createStudent();
            const response = await request(app)
                .get(`/api/students/${student._id}/logbook`)
                .expect(401);
            expect(response.body).toHaveProperty("error");
        });

        it("returns 400 for an invalid studentId", async () => {
            const response = await request(app)
                .get("/api/students/not-a-valid-id/logbook")
                .set("Cookie", authCookie)
                .expect(400);
            expect(response.body).toHaveProperty("success", false);
        });

        it("returns an empty logbook when none exists", async () => {
            const student = await createStudent();
            const response = await request(app)
                .get(`/api/students/${student._id}/logbook`)
                .set("Cookie", authCookie)
                .expect(200);
            expect(response.body).toEqual({ success: true, logbook: [] });
        });

        it("returns 404 for a missing student", async () => {
            const response = await request(app)
                .get(`/api/students/${new mongoose.Types.ObjectId()}/logbook`)
                .set("Cookie", authCookie)
                .expect(404);
            expect(response.body).toEqual({ message: "Student not found." });
        });
    });

    describe("POST /api/students/:studentId/logbook", () => {
        it("returns 400 when title is missing", async () => {
            const student = await createStudent();
            const response = await request(app)
                .post(`/api/students/${student._id}/logbook`)
                .set("Cookie", authCookie)
                .send({})
                .expect(400);
            expect(response.body).toEqual({ message: "Titel krävs." });
        });

        it("adds a kit, persists it and writes an audit log", async () => {
            const student = await createStudent();
            const response = await request(app)
                .post(`/api/students/${student._id}/logbook`)
                .set("Cookie", authCookie)
                .send({
                    title: "Introduktionskit",
                    description: "Välkommen till praktiken",
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.logbook).toHaveLength(1);
            expect(response.body.logbook[0].title).toBe("Introduktionskit");

            const persisted = await Student.findById(student._id).lean();
            expect(persisted.logbook).toHaveLength(1);

            const audit = await AuditLog.findOne({ entityType: "Student", action: "logbook:create" });
            expect(audit).not.toBeNull();
            expect(audit.entityId.toString()).toBe(student._id.toString());
            expect(audit.performedBy.userId.toString()).toBe(adminUserId.toString());
        });

        it("allows a teacher to add a kit", async () => {
            const student = await createStudent();
            const response = await request(app)
                .post(`/api/students/${student._id}/logbook`)
                .set("Cookie", teacherCookie)
                .send({ title: "Introduktionskit" })
                .expect(200);
            expect(response.body.logbook).toHaveLength(1);
        });
    });

    describe("GET /api/student-details/:studentId/logbook", () => {
        it("returns 401 without authentication", async () => {
            const student = await createStudent();
            const response = await request(app)
                .get(`/api/student-details/${student._id}/logbook`)
                .expect(401);
            expect(response.body).toHaveProperty("error");
        });

        it("returns the logbook for a student", async () => {
            const student = await createStudent();
            student.logbook = [
                {
                    id: new mongoose.Types.ObjectId(),
                    title: "Introduktionskit",
                    status: "pending",
                },
            ];
            await student.save();

            const response = await request(app)
                .get(`/api/student-details/${student._id}/logbook`)
                .set("Cookie", authCookie)
                .expect(200);
            expect(response.body.success).toBe(true);
            expect(response.body.logbook).toHaveLength(1);
        });
    });
});
