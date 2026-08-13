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
import express from "express";
import Course from "../../src/models/Course.js";
import CourseTemplate from "../../src/models/CourseTemplate.js";
import User from "../../src/models/User.js";
import courseTemplateRoutes from "../../src/router/courseTemplateRoutes.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const mockAuthenticateUser = vi.hoisted(() => (req, _res, next) => {
    const roleHeader = req.headers["x-test-role"];
    const userHeader = req.headers["x-test-userid"];
    const role = Array.isArray(roleHeader) ? roleHeader[0] : roleHeader;
    const userId = Array.isArray(userHeader) ? userHeader[0] : userHeader;

    req.user = {
        role: role || "admin",
        roles: role ? [role] : ["admin"],
        userId: userId || "test-user",
        permissions: [],
    };
    req.userId = req.user.userId;
    next();
});

vi.mock("../../src/controllers/authController.js", () => ({
    authenticateUser: mockAuthenticateUser,
}));

let app;

const createCourse = async (overrides = {}) =>
    Course.create({
        courseName: overrides.courseName ?? "Test Course",
        courseCode: overrides.courseCode ?? "TC101",
        coursePoints: overrides.coursePoints ?? "5",
        courseExtent: overrides.courseExtent ?? "10 weeks",
    });

describe("Course Template Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
        app = express();
        app.use(express.json());
        app.use("/api", courseTemplateRoutes);
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await CourseTemplate.deleteMany({});
        await Course.deleteMany({});
        await User.deleteMany({});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("GET /api/course-templates", () => {
        it("returns 403 for a role without template permissions", async () => {
            const response = await request(app)
                .get("/api/course-templates")
                .set("x-test-role", "student")
                .expect(403);

            expect(response.body.message).toContain("Forbidden");
        });

        it("lists templates for an admin and populates creator", async () => {
            const creator = await User.create({
                email: "anna@example.com",
                username: "Anna",
                password: "hashed-placeholder",
            });
            await CourseTemplate.create({
                templateName: "Demo Template",
                modules: [],
                createdBy: creator._id,
            });

            const response = await request(app)
                .get("/api/course-templates")
                .set("x-test-role", "admin")
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.templates).toHaveLength(1);
            expect(response.body.templates[0].templateName).toBe("Demo Template");
            expect(response.body.templates[0].createdBy?.username).toBe("Anna");
        });

        it("filters inactive templates by default", async () => {
            await CourseTemplate.create({ templateName: "Active", modules: [], isActive: true });
            await CourseTemplate.create({ templateName: "Inactive", modules: [], isActive: false });

            const response = await request(app)
                .get("/api/course-templates")
                .set("x-test-role", "admin")
                .expect(200);

            expect(response.body.templates).toHaveLength(1);
            expect(response.body.templates[0].templateName).toBe("Active");
        });
    });

    describe("POST /api/course-templates", () => {
        it("creates a template with the default 5-module structure", async () => {
            const course = await createCourse();

            const response = await request(app)
                .post("/api/course-templates")
                .set("x-test-role", "teacher")
                .send({ templateName: "New Template", courseId: String(course._id) })
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.template.templateName).toBe("New Template");
            expect(response.body.template.modules).toHaveLength(5);
            expect(response.body.template.modules[2].isPartialExam).toBe(true);
            expect(response.body.template.modules[4].isCaseStudy).toBe(true);
            expect(response.body.template.modules[0].sections).toHaveLength(2);
        });

        it("returns 400 when template name is missing", async () => {
            const response = await request(app)
                .post("/api/course-templates")
                .set("x-test-role", "teacher")
                .send({ courseId: "" })
                .expect(400);

            expect(response.body.error).toBe("Template name is required");
        });

        it("returns 404 when the linked course does not exist", async () => {
            const response = await request(app)
                .post("/api/course-templates")
                .set("x-test-role", "teacher")
                .send({
                    templateName: "Orphan",
                    courseId: String(new mongoose.Types.ObjectId()),
                })
                .expect(404);

            expect(response.body.error).toBe("Course not found");
        });
    });

    describe("PUT /api/course-templates/:templateId", () => {
        it("updates the template", async () => {
            const template = await CourseTemplate.create({
                templateName: "Before",
                modules: [],
                createdBy: new mongoose.Types.ObjectId(),
            });

            const response = await request(app)
                .put(`/api/course-templates/${template._id}`)
                .set("x-test-role", "admin")
                .send({ templateName: "After", isActive: false })
                .expect(200);

            expect(response.body.template.templateName).toBe("After");
            expect(response.body.template.isActive).toBe(false);
        });

        it("returns 404 for a missing template", async () => {
            const response = await request(app)
                .put(`/api/course-templates/${new mongoose.Types.ObjectId()}`)
                .set("x-test-role", "admin")
                .send({ templateName: "Nope" })
                .expect(404);

            expect(response.body.error).toBe("Course template not found");
        });
    });

    describe("DELETE /api/course-templates/:templateId", () => {
        it("deletes the template", async () => {
            const template = await CourseTemplate.create({
                templateName: "To Delete",
                modules: [],
                createdBy: new mongoose.Types.ObjectId(),
            });

            const response = await request(app)
                .delete(`/api/course-templates/${template._id}`)
                .set("x-test-role", "admin")
                .expect(200);

            expect(response.body.success).toBe(true);

            const remaining = await CourseTemplate.findById(template._id);
            expect(remaining).toBeNull();
        });

        it("returns 404 for a missing template", async () => {
            const response = await request(app)
                .delete(`/api/course-templates/${new mongoose.Types.ObjectId()}`)
                .set("x-test-role", "admin")
                .expect(404);

            expect(response.body.error).toBe("Course template not found");
        });
    });
});
