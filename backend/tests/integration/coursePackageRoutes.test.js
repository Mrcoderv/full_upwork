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
import CoursePackage from "../../src/models/CoursePackage.js";
import Course from "../../src/models/Course.js";
import User from "../../src/models/User.js";
import AuditLog from "../../src/models/AuditLog.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

let coursePackageId;
let authCookie;

describe("Course Package Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            CoursePackage.deleteMany({}),
            Course.deleteMany({}),
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

        const courseOne = await Course.create({
            courseName: "Course One",
            courseCode: "C001",
            coursePoints: "5",
            courseExtent: "5 weeks",
        });

        const courseTwo = await Course.create({
            courseName: "Course Two",
            courseCode: "C002",
            coursePoints: "10",
            courseExtent: "10 weeks",
        });

        const coursePackage = await CoursePackage.create({
            coursePackageName: "Package One",
            coursePackageCode: "P001",
            coursePackagePoints: "15",
            coursePackageExtent: "15 weeks",
            coursePackageCourses: [courseOne._id, courseTwo._id],
        });

        coursePackageId = coursePackage._id;
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await CoursePackage.deleteMany({});
        await Course.deleteMany({});
        await User.deleteMany({});
        await AuditLog.deleteMany({});
    });

    describe("GET /api/coursepackages", () => {
        it("returns all course packages with populated courses", async () => {
            const response = await request(app)
                .get("/api/coursepackages")
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body).toHaveLength(1);
            expect(response.body[0]).toHaveProperty(
                "coursePackageName",
                "Package One"
            );

            const courseNames = response.body[0].coursePackageCourses.map(
                (course) => course.courseName
            );
            expect(courseNames).toEqual(
                expect.arrayContaining(["Course One", "Course Two"])
            );
        });

        it("handles database errors", async () => {
            vi.spyOn(CoursePackage, "find").mockImplementationOnce(() => {
                throw new Error("Database failure");
            });

            const response = await request(app)
                .get("/api/coursepackages")
                .expect(500);

            expect(response.body).toEqual({
                error: "Internal Server Error",
            });
        });
    });

    describe("GET /api/coursepackages/:id", () => {
        it("returns a single course package with courses", async () => {
            const response = await request(app)
                .get(`/api/coursepackages/${coursePackageId}`)
                .expect(200);

            expect(response.body).toHaveProperty(
                "coursePackageName",
                "Package One"
            );
            expect(response.body.coursePackageCourses).toHaveLength(2);
        });

        it("returns 404 when the course package does not exist", async () => {
            const missingId = new mongoose.Types.ObjectId();

            const response = await request(app)
                .get(`/api/coursepackages/${missingId}`)
                .expect(404);

            expect(response.body).toEqual({
                error: "Course Package not found",
            });
        });

        it("returns 400 for invalid ids", async () => {
            const response = await request(app)
                .get("/api/coursepackages/not-a-valid-id")
                .expect(400);

            expect(response.body).toEqual({
                success: false,
                error: { message: "Invalid id format" },
            });
        });
    });

    describe("GET /api/coursepackages/:id/courses", () => {
        it("returns courses for the requested course package", async () => {
            const response = await request(app)
                .get(`/api/coursepackages/${coursePackageId}/courses`)
                .expect(200);

            expect(response.body).toHaveLength(2);
            const courseNames = response.body.map((course) => course.courseName);
            expect(courseNames).toEqual(
                expect.arrayContaining(["Course One", "Course Two"])
            );
        });

        it("returns 404 when the course package does not exist", async () => {
            const missingId = new mongoose.Types.ObjectId();

            const response = await request(app)
                .get(`/api/coursepackages/${missingId}/courses`)
                .expect(404);

            expect(response.body).toEqual({
                error: "Course Package not found",
            });
        });

        it("returns 400 for invalid ids", async () => {
            const response = await request(app)
                .get("/api/coursepackages/not-a-valid-id/courses")
                .expect(400);

            expect(response.body).toEqual({
                success: false,
                error: { message: "Invalid id format" },
            });
        });
    });

    describe("POST /api/coursepackages", () => {
        it("returns 401 without authentication", async () => {
            const response = await request(app)
                .post("/api/coursepackages")
                .send({
                    coursePackageName: "No Auth",
                    coursePackageCode: "NA001",
                    coursePackagePoints: "5",
                    coursePackageExtent: "5 weeks",
                })
                .expect(401);
            expect(response.body).toHaveProperty("error");
        });

        it("returns 400 when required fields are missing", async () => {
            const response = await request(app)
                .post("/api/coursepackages")
                .set("Cookie", authCookie)
                .send({ coursePackageName: "Missing fields" })
                .expect(400);
            expect(response.body).toEqual({ message: "Alla fält är obligatoriska!" });
        });

        it("creates a course package and writes an audit log", async () => {
            const course = await Course.findOne({ courseCode: "C001" });
            const response = await request(app)
                .post("/api/coursepackages")
                .set("Cookie", authCookie)
                .send({
                    coursePackageName: "New Package",
                    coursePackageCode: "NP001",
                    coursePackagePoints: "10",
                    coursePackageExtent: "10 weeks",
                    coursePackageCourses: [course._id.toString()],
                })
                .expect(201);

            expect(response.body.coursePackageCode).toBe("NP001");

            const audit = await AuditLog.findOne({ entityType: "CoursePackage", action: "create" });
            expect(audit).not.toBeNull();
            expect(audit.performedBy.role).toBe("admin");
        });

        it("rejects invalid course ids in coursePackageCourses", async () => {
            const response = await request(app)
                .post("/api/coursepackages")
                .set("Cookie", authCookie)
                .send({
                    coursePackageName: "Bad Package",
                    coursePackageCode: "BP001",
                    coursePackagePoints: "10",
                    coursePackageExtent: "10 weeks",
                    coursePackageCourses: ["not-an-objectid"],
                })
                .expect(400);
            expect(response.body).toHaveProperty("error");
        });
    });

    describe("PUT /api/coursepackages/:id", () => {
        it("updates a course package and writes an audit log", async () => {
            const response = await request(app)
                .put(`/api/coursepackages/${coursePackageId}`)
                .set("Cookie", authCookie)
                .send({ coursePackageName: "Renamed Package" })
                .expect(200);

            expect(response.body.coursePackageName).toBe("Renamed Package");

            const audit = await AuditLog.findOne({ entityType: "CoursePackage", action: "update" });
            expect(audit).not.toBeNull();
            expect(audit.entityId.toString()).toBe(coursePackageId.toString());
        });

        it("returns 404 for a missing course package", async () => {
            const response = await request(app)
                .put(`/api/coursepackages/${new mongoose.Types.ObjectId()}`)
                .set("Cookie", authCookie)
                .send({ coursePackageName: "Renamed" })
                .expect(404);
            expect(response.body).toEqual({ error: "Course Package not found" });
        });
    });

    describe("DELETE /api/coursepackages/:id", () => {
        it("deletes a course package and writes an audit log", async () => {
            const response = await request(app)
                .delete(`/api/coursepackages/${coursePackageId}`)
                .set("Cookie", authCookie)
                .expect(200);

            expect(response.body).toEqual({
                message: "Course Package deleted",
                id: coursePackageId.toString(),
            });
            expect(await CoursePackage.findById(coursePackageId)).toBeNull();

            const audit = await AuditLog.findOne({ entityType: "CoursePackage", action: "delete" });
            expect(audit).not.toBeNull();
        });

        it("returns 404 for a missing course package", async () => {
            const response = await request(app)
                .delete(`/api/coursepackages/${new mongoose.Types.ObjectId()}`)
                .set("Cookie", authCookie)
                .expect(404);
            expect(response.body).toEqual({ error: "Course Package not found" });
        });
    });
});
