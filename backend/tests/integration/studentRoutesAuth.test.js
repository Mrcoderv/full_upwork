import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    vi,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import express from "express";
import Program from "../../src/models/Program.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import Course from "../../src/models/Course.js";
import Student from "../../src/models/Student.js";
import studentRoutes from "../../src/router/studentRoutes.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

let app;
let staffApp;

const mockAuthenticateUser = vi.hoisted(() => (req, _res, next) => {
    const roleHeader = req.headers["x-test-role"];
    const role = Array.isArray(roleHeader) ? roleHeader[0] : roleHeader;

    if (!role) {
        return _res.status(401).json({ error: "Ingen giltig token angiven." });
    }

    req.user = {
        role,
        roles: [role],
        userId: "test-user",
    };
    req.userId = req.user.userId;
    next();
});

vi.mock("../../src/controllers/authController.js", () => ({
    authenticateUser: mockAuthenticateUser,
}));

vi.mock("../../src/controllers/notificationController.js", () => ({
    sendDropoutNotification: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("Student Routes Auth Enforcement", () => {
    beforeAll(async () => {
        await connectTestDatabase();

        app = express();
        app.use(express.json());
        app.use("/api", studentRoutes);

        staffApp = express();
        staffApp.use(express.json());
        staffApp.use("/api", studentRoutes);
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            Program.deleteMany({}),
            CoursePackage.deleteMany({}),
            Course.deleteMany({}),
            Student.deleteMany({}),
        ]);
    });

    describe("GET /api/all-programs", () => {
        it("returns 401 without auth token", async () => {
            await request(app).get("/api/all-programs").expect(401);
        });

        it("returns 403 for student role", async () => {
            await request(app)
                .get("/api/all-programs")
                .set("x-test-role", "student")
                .expect(403);
        });

        it("returns 200 for admin role", async () => {
            await Program.create({ programName: "Test Program" });

            const res = await request(app)
                .get("/api/all-programs")
                .set("x-test-role", "admin")
                .expect(200);

            expect(res.body).toHaveLength(1);
            expect(res.body[0].programName).toBe("Test Program");
        });

        it("returns 200 for teacher role", async () => {
            await Program.create({ programName: "Teacher Program" });

            const res = await request(app)
                .get("/api/all-programs")
                .set("x-test-role", "teacher")
                .expect(200);

            expect(res.body).toHaveLength(1);
        });
    });

    describe("GET /api/all-course-packages", () => {
        it("returns 401 without auth token", async () => {
            await request(app).get("/api/all-course-packages").expect(401);
        });

        it("returns 403 for student role", async () => {
            await request(app)
                .get("/api/all-course-packages")
                .set("x-test-role", "student")
                .expect(403);
        });

        it("returns 200 for admin role", async () => {
            await CoursePackage.create({
                coursePackageName: "Test Package",
                coursePackageCode: "TP01",
                coursePackagePoints: "10",
                coursePackageExtent: "1",
            });

            const res = await request(app)
                .get("/api/all-course-packages")
                .set("x-test-role", "admin")
                .expect(200);

            expect(res.body).toHaveLength(1);
            expect(res.body[0].coursePackageName).toBe("Test Package");
        });
    });

    describe("GET /api/all-courses", () => {
        it("returns 401 without auth token", async () => {
            await request(app).get("/api/all-courses").expect(401);
        });

        it("returns 403 for student role", async () => {
            await request(app)
                .get("/api/all-courses")
                .set("x-test-role", "student")
                .expect(403);
        });

        it("returns 200 for admin role", async () => {
            await Course.create({ courseName: "Test Course", courseCode: "TC01" });

            const res = await request(app)
                .get("/api/all-courses")
                .set("x-test-role", "admin")
                .expect(200);

            expect(res.body).toHaveLength(1);
            expect(res.body[0].courseName).toBe("Test Course");
        });
    });

    describe("POST /api/student", () => {
        it("returns 401 without auth token", async () => {
            await request(app)
                .post("/api/student")
                .send({ name: "Test", email: "test@test.com", personalNumber: "12345678901" })
                .expect(401);
        });

        it("returns 403 for student role", async () => {
            await request(app)
                .post("/api/student")
                .set("x-test-role", "student")
                .send({ name: "Test", email: "test@test.com", personalNumber: "12345678901" })
                .expect(403);
        });
    });

    describe("PUT /api/student/:id", () => {
        it("returns 401 without auth token", async () => {
            const id = new mongoose.Types.ObjectId();
            await request(app)
                .put(`/api/student/${id}`)
                .send({ name: "Updated" })
                .expect(401);
        });

        it("returns 403 for student role", async () => {
            const id = new mongoose.Types.ObjectId();
            await request(app)
                .put(`/api/student/${id}`)
                .set("x-test-role", "student")
                .send({ name: "Updated" })
                .expect(403);
        });
    });

    describe("DELETE /api/student/:id", () => {
        it("returns 401 without auth token", async () => {
            const id = new mongoose.Types.ObjectId();
            await request(app).delete(`/api/student/${id}`).expect(401);
        });

        it("returns 403 for student role", async () => {
            const id = new mongoose.Types.ObjectId();
            await request(app)
                .delete(`/api/student/${id}`)
                .set("x-test-role", "student")
                .expect(403);
        });
    });
});
