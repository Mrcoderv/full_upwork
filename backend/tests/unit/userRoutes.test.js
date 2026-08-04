import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const userInstances = [];

vi.mock("../../src/middleware/auth.js", () => ({
    isAuthenticated: (req, _res, next) => {
        req.user = { role: "admin", userId: "admin-user-id" };
        next();
    },
    hasRole: () => (_req, _res, next) => next(),
}));

vi.mock("bcrypt", () => ({
    __esModule: true,
    default: {
        hash: vi.fn().mockResolvedValue("hashed-password"),
    },
}));

vi.mock("../../src/models/User.js", () => {
    const constructor = vi.fn(function (data) {
        const instance = {
            ...data,
            _id: data?._id || `user-${userInstances.length + 1}`,
            save: vi.fn().mockResolvedValue(true),
        };
        userInstances.push(instance);
        return instance;
    });

    constructor.findById = vi.fn();
    constructor.findOne = vi.fn();
    constructor.findByIdAndUpdate = vi.fn();

    return {
        __esModule: true,
        default: constructor,
    };
});

vi.mock("../../src/models/Student.js", () => ({
    __esModule: true,
    default: {
        findById: vi.fn(),
    },
}));

import bcrypt from "bcrypt";
import User from "../../src/models/User.js";
import Student from "../../src/models/Student.js";
import userRoutes from "../../src/router/userRoutes.js";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api", userRoutes);
    return app;
};

describe("userRoutes", () => {
    let app;

    beforeEach(() => {
        app = buildApp();
        userInstances.length = 0;
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("PUT /api/users/:userId/roles", () => {
        it("returns 400 when roles are not an array", async () => {
            const res = await request(app)
                .put("/api/users/user-1/roles")
                .send({ roles: "admin" })
                .expect(400);

            expect(res.body).toEqual({ message: "Roles must be an array." });
        });

        it("returns 404 when user does not exist", async () => {
            User.findById.mockResolvedValueOnce(null);

            const res = await request(app)
                .put("/api/users/user-1/roles")
                .send({ roles: ["admin"] })
                .expect(404);

            expect(res.body).toEqual({ message: "User not found." });
        });

        it("updates user roles when input is valid", async () => {
            const user = { _id: "user-1", roles: ["teacher"], save: vi.fn() };
            User.findById.mockResolvedValueOnce(user);
            user.save.mockResolvedValueOnce(true);

            const res = await request(app)
                .put("/api/users/user-1/roles")
                .send({ roles: ["admin", "systemadmin"] })
                .expect(200);

            expect(user.roles).toEqual(["admin", "systemadmin"]);
            expect(user.save).toHaveBeenCalled();
            expect(res.body.message).toBe("User roles updated successfully.");
        });

        it("returns 500 when update throws", async () => {
            User.findById.mockRejectedValueOnce(new Error("boom"));

            const res = await request(app)
                .put("/api/users/user-1/roles")
                .send({ roles: ["admin"] })
                .expect(500);

            expect(res.body.message).toBe(
                "An error occurred while updating user roles."
            );
        });
    });

    describe("PUT /api/users/:userId/permissions", () => {
        it("returns 400 when permissions are not an object", async () => {
            const res = await request(app)
                .put("/api/users/user-1/permissions")
                .send({ permissions: "invalid" })
                .expect(400);

            expect(res.body).toEqual({
                message: "Permissions must be an object.",
            });
        });

        it("returns 404 when user does not exist", async () => {
            User.findById.mockResolvedValueOnce(null);

            const res = await request(app)
                .put("/api/users/user-1/permissions")
                .send({ permissions: { "students:read": true } })
                .expect(404);

            expect(res.body).toEqual({ message: "User not found." });
        });

        it("updates user permissions when input is valid", async () => {
            const user = {
                _id: "user-1",
                permissions: {},
                save: vi.fn().mockResolvedValue(true),
            };
            User.findById.mockResolvedValueOnce(user);

            const res = await request(app)
                .put("/api/users/user-1/permissions")
                .send({ permissions: { "students:read": true } })
                .expect(200);

            expect(user.permissions).toEqual({ "students:read": true });
            expect(user.save).toHaveBeenCalled();
            expect(res.body.message).toBe(
                "User permissions updated successfully."
            );
        });

        it("returns 500 when update throws", async () => {
            User.findById.mockRejectedValueOnce(new Error("boom"));

            const res = await request(app)
                .put("/api/users/user-1/permissions")
                .send({ permissions: { "students:read": true } })
                .expect(500);

            expect(res.body.message).toBe(
                "An error occurred while updating user permissions."
            );
        });
    });

    describe("POST /api/users/:userId/reset-password", () => {
        it("returns 404 when user does not exist", async () => {
            User.findById.mockResolvedValueOnce(null);

            const res = await request(app)
                .post("/api/users/user-1/reset-password")
                .expect(404);

            expect(res.body).toEqual({ message: "User not found." });
        });

        it("resets password and returns a temporary password", async () => {
            const user = { _id: "user-1", password: "old", save: vi.fn() };
            User.findById.mockResolvedValueOnce(user);
            user.save.mockResolvedValueOnce(true);

            vi.spyOn(Math, "random").mockReturnValue(0.123456789);

            const res = await request(app)
                .post("/api/users/user-1/reset-password")
                .expect(200);

            expect(res.body.message).toBe("Password reset successfully.");
            expect(res.body.tempPassword).toBeTruthy();
            expect(bcrypt.hash).toHaveBeenCalled();
            expect(user.password).toBe("hashed-password");
            expect(user.mustChangePassword).toBe(true);
            expect(user.save).toHaveBeenCalled();
        });

        it("returns 500 when reset throws", async () => {
            User.findById.mockRejectedValueOnce(new Error("boom"));

            const res = await request(app)
                .post("/api/users/user-1/reset-password")
                .expect(500);

            expect(res.body.message).toBe(
                "An error occurred while resetting password."
            );
        });
    });

    describe("POST /api/users/create-for-student", () => {
        it("returns 400 when studentId or email is missing", async () => {
            const res = await request(app)
                .post("/api/users/create-for-student")
                .send({ studentId: "stu-1" })
                .expect(400);

            expect(res.body.message).toBe("Student ID and email are required.");
        });

        it("returns 404 when student is not found", async () => {
            Student.findById.mockResolvedValueOnce(null);

            const res = await request(app)
                .post("/api/users/create-for-student")
                .send({ studentId: "stu-1", email: "student@example.com" })
                .expect(404);

            expect(res.body).toEqual({ message: "Student not found." });
        });

        it("returns 409 when user already exists for the email", async () => {
            Student.findById.mockResolvedValueOnce({ _id: "stu-1", name: "Stu" });
            User.findOne.mockResolvedValueOnce({ _id: "existing-user" });

            const res = await request(app)
                .post("/api/users/create-for-student")
                .send({ studentId: "stu-1", email: "student@example.com" })
                .expect(409);

            expect(res.body.message).toBe(
                "A user with this email already exists."
            );
            expect(res.body.user).toEqual({ _id: "existing-user" });
        });

        it("creates a user for a student when valid", async () => {
            Student.findById.mockResolvedValueOnce({ _id: "stu-1", name: "Stu" });
            User.findOne.mockResolvedValueOnce(null);
            vi.spyOn(Math, "random").mockReturnValue(0.987654321);

            const res = await request(app)
                .post("/api/users/create-for-student")
                .send({
                    studentId: "stu-1",
                    email: "student@example.com",
                    name: "Student User",
                })
                .expect(201);

            expect(res.body.message).toBe("User created successfully for student.");
            expect(res.body.user).toMatchObject({
                email: "student@example.com",
                username: "Student User",
                roles: ["student"],
            });
            expect(res.body.tempPassword).toBeTruthy();
        });

        it("returns 500 when creation throws", async () => {
            Student.findById.mockRejectedValueOnce(new Error("boom"));

            const res = await request(app)
                .post("/api/users/create-for-student")
                .send({ studentId: "stu-1", email: "student@example.com" })
                .expect(500);

            expect(res.body.message).toBe(
                "An error occurred while creating user for student."
            );
        });
    });
});
