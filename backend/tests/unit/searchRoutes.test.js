import { describe, it, expect, afterEach, vi } from "vitest";
import mongoose from "mongoose";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import Teacher from "../../src/models/Teacher.js";
import User from "../../src/models/User.js";
import router from "../../src/router/searchRoutes.js";

const buildRes = () => {
    const res = {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    return res;
};

const getRouteHandler = (path) => {
    const layer = router.stack.find((item) => item.route?.path === path);
    if (!layer) {
        throw new Error(`Route ${path} not found`);
    }
    return layer.route.stack[layer.route.stack.length - 1].handle;
};

describe("searchRoutes handlers", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("GET /course-enrollments", () => {
        it("returns deduplicated courses for non-teachers", async () => {
            const studentId = new mongoose.Types.ObjectId();
            const courseId = new mongoose.Types.ObjectId();
            const students = [{ _id: studentId }];
            vi.spyOn(Student, "find").mockResolvedValueOnce(students);

            const enrollments = [
                { mainCourseId: { _id: courseId, courseName: "Alpha" } },
            ];
            const leanMock = vi.fn().mockResolvedValue(enrollments);
            const populateMock = vi.fn().mockReturnValue({ lean: leanMock });
            vi.spyOn(StudentEnrollment, "find").mockReturnValue({
                populate: populateMock,
            });

            const handler = getRouteHandler("/course-enrollments");
            const req = { user: { role: "admin" } };
            const res = buildRes();

            await handler(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual([
                { _id: courseId.toString(), name: "Alpha" },
            ]);
            expect(Student.find).toHaveBeenCalledWith({
                "education.type": "Course",
                "education.refId": { $exists: true },
            });
        });

        it("returns 403 when teacher profile is missing", async () => {
            vi.spyOn(Teacher, "findOne").mockResolvedValueOnce(null);
            const handler = getRouteHandler("/course-enrollments");
            const req = { user: { role: "teacher", userId: "user-1" } };
            const res = buildRes();

            await handler(req, res);

            expect(res.statusCode).toBe(403);
            expect(res.body).toEqual({ error: "Teacher profile not found" });
        });

        it("filters students by teacher when profile exists", async () => {
            const teacherId = new mongoose.Types.ObjectId();
            vi.spyOn(Teacher, "findOne").mockResolvedValueOnce({
                _id: teacherId,
            });
            vi.spyOn(Student, "find").mockResolvedValueOnce([{ _id: "s" }]);

            const enrollments = [
                { mainCourseId: { _id: "c", courseName: "Beta" } },
            ];
            const leanMock = vi.fn().mockResolvedValue(enrollments);
            const populateMock = vi.fn().mockReturnValue({ lean: leanMock });
            vi.spyOn(StudentEnrollment, "find").mockReturnValue({
                populate: populateMock,
            });

            const handler = getRouteHandler("/course-enrollments");
            const req = { user: { role: "teacher", userId: "user-2" } };
            const res = buildRes();

            await handler(req, res);

            expect(Student.find).toHaveBeenCalledWith({
                "education.type": "Course",
                "education.refId": { $exists: true },
                teacherId,
            });
            expect(res.statusCode).toBe(200);
        });
    });

    describe("GET /details/:type/:id", () => {
        it("returns student data when type is Elev", async () => {
            const studentId = new mongoose.Types.ObjectId();
            vi.spyOn(Student, "findById").mockResolvedValueOnce({
                _id: studentId,
                name: "Test",
                email: "test@example.com",
                education: [],
                startDate: "2021-01-01",
                endDate: "2021-06-01",
            });

            const handler = getRouteHandler("/details/:type/:id");
            const req = { params: { type: "Elev", id: studentId.toString() } };
            const res = buildRes();

            await handler(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toMatchObject({
                _id: studentId,
                name: "Test",
            });
        });

        it("returns 400 for unknown type", async () => {
            const handler = getRouteHandler("/details/:type/:id");
            const req = { params: { type: "Unknown", id: "123" } };
            const res = buildRes();

            await handler(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({ message: "Ogiltig typ av objekt" });
        });
    });
});
