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
import jwt from "jsonwebtoken";
import app from "../../index.js";
import Notification from "../../src/models/Notification.js";
import Teacher from "../../src/models/Teacher.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const signToken = (overrides = {}) => {
    const payload = {
        userId: new mongoose.Types.ObjectId().toString(),
        role: "admin",
        name: "Test User",
        email: "test@example.com",
        ...overrides,
    };

    return jwt.sign(payload, process.env.JWT_SECRET || "test-secret");
};

describe("Notification Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Notification.deleteMany({});
        await Teacher.deleteMany({});
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await Notification.deleteMany({});
        await Teacher.deleteMany({});
    });

    describe("GET /api/notifications", () => {
        it("returns unique notifications for admin users", async () => {
            const adminUserId = new mongoose.Types.ObjectId();
            const studentId = new mongoose.Types.ObjectId();
            const otherAdminUserId = new mongoose.Types.ObjectId();

            await Notification.create([
                {
                    type: "action_plan_required",
                    message: "Action plan required",
                    resolved: false,
                },
                {
                    type: "action_plan_required",
                    message: "Action plan required again",
                    resolved: false,
                },
                {
                    type: "grades_pending",
                    message: "Grades pending",
                    resolved: false,
                },
                {
                    type: "grades_pending",
                    message: "Grades pending again",
                    resolved: false,
                },
                {
                    type: "dropout",
                    message: "Dropout alert",
                    resolved: false,
                    createdByAdmin: adminUserId,
                    meta: { studentId },
                },
                {
                    type: "dropout",
                    message: "Dropout alert duplicate",
                    resolved: false,
                    createdByAdmin: otherAdminUserId,
                    meta: { studentId },
                },
                {
                    type: "custom",
                    message: "Custom notification",
                    resolved: false,
                },
            ]);

            const token = signToken({ userId: adminUserId.toString() });
            const response = await request(app)
                .get("/api/notifications")
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body).toHaveLength(4);

            const types = response.body.map((note) => note.type);
            expect(types.filter((type) => type === "action_plan_required"))
                .toHaveLength(1);
            expect(types.filter((type) => type === "grades_pending")).toHaveLength(
                1
            );
            expect(types.filter((type) => type === "dropout")).toHaveLength(1);
            expect(types.filter((type) => type === "custom")).toHaveLength(1);
        });

        it("returns 403 when teacher profile is missing", async () => {
            const token = signToken({
                role: "teacher",
                userId: new mongoose.Types.ObjectId().toString(),
            });

            const response = await request(app)
                .get("/api/notifications")
                .set("Authorization", `Bearer ${token}`)
                .expect(403);

            expect(response.body).toEqual({
                error: "Teacher profile not found",
            });
        });

        it("executes teacher dropout debug loop when dropout notifications exist", async () => {
            const userId = new mongoose.Types.ObjectId();
            const teacher = await Teacher.create({
                userId,
                subject: "math",
            });

            await Notification.create({
                type: "dropout",
                message: "Dropout alert",
                resolved: false,
                teacher: teacher._id,
                meta: { studentId: new mongoose.Types.ObjectId() },
            });

            const token = signToken({
                role: "teacher",
                userId: userId.toString(),
            });

            const response = await request(app)
                .get("/api/notifications")
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body).toHaveLength(1);
            expect(response.body[0].type).toBe("dropout");
        });

        it("returns notifications for a teacher with a profile", async () => {
            const userId = new mongoose.Types.ObjectId();
            const teacher = await Teacher.create({
                userId,
                subject: "math",
            });
            await Notification.collection.insertOne({
                type: "custom",
                message: "Teacher-specific note",
                resolved: false,
                teacher: teacher._id,
            });

            const token = signToken({
                role: "teacher",
                userId: userId.toString(),
            });

            const response = await request(app)
                .get("/api/notifications")
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
        });

        it("handles server errors", async () => {
            vi.spyOn(Notification, "find").mockRejectedValueOnce(
                new Error("DB failure")
            );

            const token = signToken();
            const response = await request(app)
                .get("/api/notifications")
                .set("Authorization", `Bearer ${token}`)
                .expect(500);

            expect(response.body).toEqual({ message: "Server error" });
        });
    });

    describe("PUT /api/notifications/resolve/:studentId", () => {
        it("marks notifications resolved for the student", async () => {
            const studentId = new mongoose.Types.ObjectId().toString();
            await Notification.collection.insertOne({
                type: "action_plan_required",
                message: "Action plan",
                resolved: false,
                studentId,
            });

            const token = signToken();
            const response = await request(app)
                .put(`/api/notifications/resolve/${studentId}`)
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(response.body).toEqual({ message: "Notification resolved" });

            const updated = await Notification.collection.findOne({
                studentId,
            });
            expect(updated.resolved).toBe(true);
        });

        it("returns 500 when update fails", async () => {
            vi.spyOn(Notification, "updateMany").mockRejectedValueOnce(
                new Error("DB failure")
            );

            const token = signToken();
            const response = await request(app)
                .put(
                    `/api/notifications/resolve/${new mongoose.Types.ObjectId()}`
                )
                .set("Authorization", `Bearer ${token}`)
                .expect(500);

            expect(response.body).toHaveProperty(
                "message",
                "Error resolving notification"
            );
        });
    });

    describe("PUT /api/notifications/:id/resolve", () => {
        it("resolves a notification", async () => {
            const note = await Notification.create({
                type: "custom",
                message: "Resolve me",
                resolved: false,
            });

            const userId = new mongoose.Types.ObjectId();
            const token = signToken({ userId: userId.toString() });
            const response = await request(app)
                .put(`/api/notifications/${note._id}/resolve`)
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(response.body).toHaveProperty(
                "message",
                "Notis markerad som hanterad"
            );
            expect(response.body.note.resolvedByUsers).toEqual(
                expect.arrayContaining([userId.toString()])
            );
        });

        it("does not add duplicate resolvedByUsers entries and evaluates action plan status when meta is present", async () => {
            const userId = new mongoose.Types.ObjectId();
            const studentId = new mongoose.Types.ObjectId();
            const courseId = new mongoose.Types.ObjectId();

            const note = await Notification.create({
                type: "custom",
                message: "Already resolved",
                resolved: false,
                resolvedByUsers: [userId],
                meta: { studentId, courseId },
            });

            const token = signToken({ userId: userId.toString() });
            const response = await request(app)
                .put(`/api/notifications/${note._id}/resolve`)
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(response.body.note.resolvedByUsers).toHaveLength(1);
            expect(response.body.note.resolvedByUsers[0].toString()).toBe(
                userId.toString()
            );
        });

        it("returns 404 when notification is missing", async () => {
            const token = signToken();
            const response = await request(app)
                .put(
                    `/api/notifications/${new mongoose.Types.ObjectId()}/resolve`
                )
                .set("Authorization", `Bearer ${token}`)
                .expect(404);

            expect(response.text).toBe("Notis hittades inte");
        });

        it("returns 500 for invalid ids", async () => {
            const token = signToken();
            const response = await request(app)
                .put("/api/notifications/not-a-valid-id/resolve")
                .set("Authorization", `Bearer ${token}`)
                .expect(500);

            expect(response.body).toHaveProperty("message");
        });
    });

    describe("PUT /api/notifications/:id/reset", () => {
        it("resets a notification", async () => {
            const userId = new mongoose.Types.ObjectId();
            const token = signToken({ userId: userId.toString() });
            const note = await Notification.create({
                type: "custom",
                message: "Reset me",
                resolvedByUsers: [userId],
            });

            const response = await request(app)
                .put(`/api/notifications/${note._id}/reset`)
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(response.body.note.resolvedByUsers).not.toContain(
                userId.toString()
            );
        });

        it("returns 404 when notification is missing", async () => {
            const token = signToken();
            const response = await request(app)
                .put(`/api/notifications/${new mongoose.Types.ObjectId()}/reset`)
                .set("Authorization", `Bearer ${token}`)
                .expect(404);

            expect(response.text).toBe("Notis hittades inte");
        });

        it("returns 500 for invalid ids", async () => {
            const token = signToken();
            const response = await request(app)
                .put("/api/notifications/not-a-valid-id/reset")
                .set("Authorization", `Bearer ${token}`)
                .expect(500);

            expect(response.text).toBe("Serverfel");
        });
    });
});
