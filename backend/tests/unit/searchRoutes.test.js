import { describe, it, expect, afterEach, vi } from "vitest";
import mongoose from "mongoose";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import Teacher from "../../src/models/Teacher.js";
import User from "../../src/models/User.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import router from "../../src/router/searchRoutes.js";

const buildRes = () => {
    const res = {
        statusCode: 200,
        body: undefined,
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        setHeader(key, val) {
            this.headers[key] = val;
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

        it("returns 404 when student not found", async () => {
            vi.spyOn(Student, "findById").mockResolvedValueOnce(null);
            const handler = getRouteHandler("/details/:type/:id");
            const req = { params: { type: "Elev", id: new mongoose.Types.ObjectId().toString() } };
            const res = buildRes();

            await handler(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ message: "Student not found" });
        });

        it("returns teacher profile with active students and courses", async () => {
            const userId = new mongoose.Types.ObjectId();

            vi.spyOn(User, "findById").mockReturnValue({
                lean: vi.fn().mockResolvedValue({ _id: userId, name: "Teacher User", email: "t@test.com", role: "teacher" }),
            });
            vi.spyOn(Teacher, "findOne").mockReturnValue({
                lean: vi.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId(), userId: userId, subject: "Math" }),
            });
            vi.spyOn(Student, "find").mockReturnValue({
                select: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue([{ _id: "s1", name: "Student 1" }]),
                }),
            });
            vi.spyOn(CourseInstance, "find").mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    sort: vi.fn().mockReturnValue({
                        lean: vi.fn().mockResolvedValue([{ _id: "ci1", courseName: "Math 101" }]),
                    }),
                }),
            });
            vi.spyOn(StudentEnrollment, "find").mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    populate: vi.fn().mockReturnValue({
                        lean: vi.fn().mockResolvedValue([
                            { studentId: { _id: "s1", name: "Student 1", email: "s@test.com" }, mainCourseId: { _id: "c1", courseName: "Math 101" } },
                        ]),
                    }),
                }),
            });

            const handler = getRouteHandler("/details/:type/:id");
            const req = { params: { type: "Lärare", id: userId.toString() } };
            const res = buildRes();

            await handler(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty("students");
            expect(res.body).toHaveProperty("courses");
            expect(res.body).toHaveProperty("courseInstances");
        });
    });

    describe("GET /search - minimum character enforcement", () => {
        it("returns empty results when query is less than 3 characters", async () => {
            const handler = getRouteHandler("/search");
            const req = {
                user: { role: "admin" },
                query: { q: "ab", type: "Användare" },
            };
            const res = buildRes();

            await handler(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual([]);
        });

        it("does not search courses when query is less than 3 characters", async () => {
            const handler = getRouteHandler("/search");
            const req = {
                user: { role: "admin" },
                query: { q: "ab", type: "Kurs" },
            };
            const res = buildRes();

            await handler(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual([]);
        });
    });

    describe("GET /search - teacher scoping", () => {
        it("teacher search is scoped to their students", async () => {
            const teacherId = new mongoose.Types.ObjectId();
            vi.spyOn(Teacher, "findOne").mockResolvedValueOnce({ _id: teacherId });
            vi.spyOn(Student, "find").mockReturnValue({
                select: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue([]),
                }),
            });
            vi.spyOn(User, "find").mockReturnValue({
                select: vi.fn().mockResolvedValue([]),
            });

            const handler = getRouteHandler("/search");
            const req = {
                user: { role: "teacher", userId: "user-123" },
                query: { q: "test", type: "Alla" },
            };
            const res = buildRes();

            await handler(req, res);

            expect(Student.find).toHaveBeenCalledWith(
                expect.objectContaining({ teacherId })
            );
        });

        it("teacher returns 403 when profile not found", async () => {
            vi.spyOn(Teacher, "findOne").mockResolvedValueOnce(null);

            const handler = getRouteHandler("/search");
            const req = {
                user: { role: "teacher", userId: "user-999" },
                query: { q: "test", type: "Alla" },
            };
            const res = buildRes();

            await handler(req, res);

            expect(res.statusCode).toBe(403);
            expect(res.body).toEqual({ error: "Teacher profile not found" });
        });
    });

    describe("GET /search - date search", () => {
        it("searches enrollments by start/end date", async () => {
            vi.spyOn(StudentEnrollment, "find").mockReturnValueOnce({
                populate: vi.fn().mockResolvedValue([]),
            });

            const handler = getRouteHandler("/search");
            const req = {
                user: { role: "admin" },
                query: { type: "Datum", date: "2025-03-15" },
            };
            const res = buildRes();

            await handler(req, res);

            expect(res.statusCode).toBe(200);
            expect(StudentEnrollment.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    $or: expect.arrayContaining([
                        expect.objectContaining({ startDate: expect.any(Object) }),
                    ]),
                })
            );
        });

        it("returns 400 for invalid date", async () => {
            const handler = getRouteHandler("/search");
            const req = {
                user: { role: "admin" },
                query: { type: "Datum", date: "not-a-date" },
            };
            const res = buildRes();

            await handler(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({ message: "Ogiltigt datum" });
        });
    });

    describe("GET /search - course search", () => {
        it("finds courses matching query text", async () => {
            vi.spyOn(Student, "find").mockReturnValue({
                select: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue([{ _id: "s1" }]),
                }),
            });
            vi.spyOn(StudentEnrollment, "find").mockReturnValue({
                populate: vi.fn().mockReturnValue({
                    populate: vi.fn().mockReturnValue({
                        populate: vi.fn().mockResolvedValue([
                            { mainCourseId: { _id: "c1", courseName: "Math 101" }, coursePackageId: null, programId: null },
                        ]),
                    }),
                }),
            });

            const handler = getRouteHandler("/search");
            const req = {
                user: { role: "admin" },
                query: { q: "Math", type: "Kurs" },
            };
            const res = buildRes();

            await handler(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.length).toBeGreaterThanOrEqual(1);
        });
    });
});
