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
import app from "../../index.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import Course from "../../src/models/Course.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

let coursePackageId;

describe("Course Package Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await CoursePackage.deleteMany({});
        await Course.deleteMany({});

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
});
