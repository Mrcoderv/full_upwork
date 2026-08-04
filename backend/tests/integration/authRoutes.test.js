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
import cookieParser from "cookie-parser";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../../src/models/User.js";
import authRoutes, { requireUser } from "../../src/router/authRoutes.js";
import { authRateLimiter } from "../../src/middleware/security.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const TEST_IP = "127.0.0.1";

let app;

describe("Auth Routes", () => {
    beforeAll(async () => {
        process.env.JWT_SECRET = "test-secret";
        await connectTestDatabase();
        app = express();
        app.use(express.json());
        app.use(cookieParser());
        app.use("/api", authRoutes);
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await User.deleteMany({});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        authRateLimiter.resetKey(TEST_IP);
    });

    describe("POST /api/auth/register", () => {
        it("rejects missing fields", async () => {
            const response = await request(app)
                .post("/api/auth/register")
                .send({ email: "user@example.com" })
                .expect(400);

            expect(response.body).toEqual({
                message: "Alla fält är obligatoriska!",
            });
        });

        it("rejects existing users", async () => {
            await User.create({
                username: "Existing",
                email: "existing@example.com",
                password: "hashed",
            });

            const response = await request(app)
                .post("/api/auth/register")
                .send({
                    email: "existing@example.com",
                    password: "Password123!",
                    username: "Existing",
                })
                .expect(409);

            expect(response.body).toEqual({
                message: "Emailadressen finns redan, var vänlig att logga in!",
            });
        });

        it("registers a new user", async () => {
            const response = await request(app)
                .post("/api/auth/register")
                .send({
                    email: "new@example.com",
                    password: "Password123!",
                    username: "NewUser",
                })
                .expect(201);

            expect(response.body).toEqual({
                message: "Användare registrerad!",
            });

            const savedUser = await User.findOne({
                email: "new@example.com",
            });
            expect(savedUser).toBeTruthy();
            expect(savedUser.username).toBe("NewUser");
            const passwordMatches = await bcrypt.compare(
                "Password123!",
                savedUser.password
            );
            expect(passwordMatches).toBe(true);
        });

        it("returns 500 when registration fails", async () => {
            vi.spyOn(User, "findOne").mockRejectedValue(new Error("boom"));

            const response = await request(app)
                .post("/api/auth/register")
                .send({
                    email: "fail@example.com",
                    password: "Password123!",
                    username: "FailUser",
                })
                .expect(500);

            expect(response.body).toEqual({
                message: "Ett fel uppstod vid registreringen.",
            });
        });
    });

    describe("requireUser middleware", () => {
        const buildRes = () => ({
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
        });

        it("rejects requests without a token", () => {
            const req = { cookies: {} };
            const res = buildRes();
            const next = vi.fn();

            requireUser(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: "Not authenticated",
            });
            expect(next).not.toHaveBeenCalled();
        });

        it("rejects invalid tokens", () => {
            const req = { cookies: { token: "invalid-token" } };
            const res = buildRes();
            const next = vi.fn();

            requireUser(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid token",
            });
            expect(next).not.toHaveBeenCalled();
        });

        it("accepts valid tokens and sets req.user", () => {
            const payload = {
                userId: new mongoose.Types.ObjectId().toString(),
                name: "Token User",
                role: "admin",
                email: "token@example.com",
            };
            const token = jwt.sign(payload, process.env.JWT_SECRET);

            const req = { cookies: { token } };
            const res = buildRes();
            const next = vi.fn();

            requireUser(req, res, next);

            expect(req.user).toMatchObject(payload);
            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });
    });

    describe("mustChangePassword enforced flow", () => {
        const login = (email, password) =>
            request(app).post("/api/auth/login").send({ email, password });

        it("login returns requiresPasswordChange and change-password clears the flag", async () => {
            await User.create({
                username: "Bootstrap Admin",
                email: "bootstrap@example.com",
                password: await bcrypt.hash("mindful", 10),
                roles: ["systemadmin"],
                mustChangePassword: true,
            });

            const loginRes = await login(
                "bootstrap@example.com",
                "mindful"
            ).expect(200);

            expect(loginRes.body.requiresPasswordChange).toBe(true);

            const cookies = loginRes.headers["set-cookie"];

            const changeRes = await request(app)
                .put("/api/auth/change-password")
                .set("Cookie", cookies)
                .send({
                    currentPassword: "mindful",
                    newPassword: "NewPassword123!",
                })
                .expect(200);

            expect(changeRes.body.requiresPasswordChange).toBe(false);

            const saved = await User.findOne({ email: "bootstrap@example.com" });
            expect(saved.mustChangePassword).toBe(false);
            expect(
                await bcrypt.compare("NewPassword123!", saved.password)
            ).toBe(true);

            const secondLogin = await login(
                "bootstrap@example.com",
                "NewPassword123!"
            ).expect(200);
            expect(secondLogin.body.requiresPasswordChange).toBe(false);
        });

        it("change-password rejects a wrong current password", async () => {
            const user = await User.create({
                username: "Flag Admin",
                email: "flag@example.com",
                password: await bcrypt.hash("mindful", 10),
                roles: ["systemadmin"],
                mustChangePassword: true,
            });
            const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);

            const res = await request(app)
                .put("/api/auth/change-password")
                .set("Cookie", [`token=${token}`])
                .send({
                    currentPassword: "wrong-password",
                    newPassword: "NewPassword123!",
                })
                .expect(401);

            expect(res.body.error).toBe("Nuvarande lösenord är felaktigt.");
            const saved = await User.findById(user._id);
            expect(saved.mustChangePassword).toBe(true);
        });

        it("change-password requires authentication", async () => {
            await request(app)
                .put("/api/auth/change-password")
                .send({
                    currentPassword: "mindful",
                    newPassword: "NewPassword123!",
                })
                .expect(401);
        });

        it("rejects a weak new password", async () => {
            const user = await User.create({
                username: "Weak Admin",
                email: "weak@example.com",
                password: await bcrypt.hash("mindful", 10),
                roles: ["systemadmin"],
                mustChangePassword: true,
            });
            const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);

            await request(app)
                .put("/api/auth/change-password")
                .set("Cookie", [`token=${token}`])
                .send({
                    currentPassword: "mindful",
                    newPassword: "short",
                })
                .expect(400);
        });
    });
});
