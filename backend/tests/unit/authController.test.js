import { describe, it, expect, afterEach, vi } from "vitest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import * as authController from "../../src/controllers/authController.js";
import User from "../../src/models/User.js";
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from "../../src/config/cookies.js";

const buildRes = () => {
    const res = {
        statusCode: 200,
        body: undefined,
        cookies: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        cookie(name, value, opts) {
            this.cookies[name] = { value, opts };
        },
        clearCookie(name, opts) {
            this.cleared = { name, opts };
        },
    };
    return res;
};

describe("authController", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("registers a user with hashed password", async () => {
        const hashedPassword = "hash";
        vi.spyOn(bcrypt, "hash").mockResolvedValueOnce(hashedPassword);
        const createdUser = {
            _id: "userId",
            name: "Name",
            email: "email@example.com",
            role: "admin",
            roles: ["admin"],
        };
        vi.spyOn(User, "create").mockResolvedValueOnce(createdUser);

        const req = {
            body: {
                name: "Name",
                email: "email@example.com",
                password: "secret",
                role: "admin",
            },
        };
        const res = buildRes();

        await authController.register(req, res);

        expect(res.statusCode).toBe(201);
        expect(res.body).toEqual({
            message: "User registered successfully",
            user: {
                id: createdUser._id,
                name: createdUser.name,
                email: createdUser.email,
                role: createdUser.role,
                roles: createdUser.roles,
            },
        });
    });

    it("returns 500 when register fails", async () => {
        vi.spyOn(bcrypt, "hash").mockResolvedValueOnce("hash");
        vi.spyOn(User, "create").mockRejectedValueOnce(new Error("boom"));

        const req = { body: { name: "n", email: "e", password: "p" } };
        const res = buildRes();

        await authController.register(req, res);

        expect(res.statusCode).toBe(500);
        expect(res.body).toEqual({ error: "Server error" });
    });

    it("logs in when credentials match", async () => {
        const user = {
            _id: "u1",
            name: "User",
            email: "u@example.com",
            role: "teacher",
            roles: ["teacher"],
            password: "hashed",
            mustChangePassword: false,
        };
        vi.spyOn(User, "findOne").mockResolvedValueOnce(user);
        vi.spyOn(bcrypt, "compare").mockResolvedValueOnce(true);
        vi.spyOn(User, "updateOne").mockResolvedValueOnce({ modifiedCount: 1 });
        const token = "jwt-token";
        vi.spyOn(jwt, "sign").mockReturnValueOnce(token);

        const req = { body: { email: "u@example.com", password: "secret" } };
        const res = buildRes();

        await authController.login(req, res);

        expect(User.updateOne).toHaveBeenCalledWith(
            { _id: user._id },
            expect.objectContaining({ $set: expect.objectContaining({ lastLoginAt: expect.any(Date) }) })
        );

        expect(res.cookies[AUTH_COOKIE_NAME].value).toBe(token);
        expect(res.body).toEqual({
            message: "Login successful",
            requiresPasswordChange: false,
            user: {
                userId: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                roles: user.roles,
            },
        });
    });

    it("logs in with requiresPasswordChange true when mustChangePassword is set", async () => {
        const user = {
            _id: "u1",
            name: "Admin",
            email: "admin@example.com",
            role: "systemadmin",
            roles: ["systemadmin"],
            password: "hashed",
            mustChangePassword: true,
        };
        vi.spyOn(User, "findOne").mockResolvedValueOnce(user);
        vi.spyOn(bcrypt, "compare").mockResolvedValueOnce(true);
        vi.spyOn(User, "updateOne").mockResolvedValueOnce({ modifiedCount: 1 });
        vi.spyOn(jwt, "sign").mockReturnValueOnce("jwt-token");

        const req = { body: { email: "admin@example.com", password: "mindful" } };
        const res = buildRes();

        await authController.login(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.requiresPasswordChange).toBe(true);
    });

    it("returns 401 when login user not found", async () => {
        vi.spyOn(User, "findOne").mockResolvedValueOnce(null);
        const req = { body: { email: "noone" } };
        const res = buildRes();

        await authController.login(req, res);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "Fel email eller lösenord" });
    });

    it("returns 401 when password mismatch", async () => {
        vi.spyOn(User, "findOne").mockResolvedValueOnce({ password: "hash" });
        vi.spyOn(bcrypt, "compare").mockResolvedValueOnce(false);
        const req = { body: { email: "x", password: "p" } };
        const res = buildRes();

        await authController.login(req, res);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "Fel email eller lösenord" });
    });

    it("returns 500 when login throws", async () => {
        vi.spyOn(User, "findOne").mockRejectedValueOnce(new Error("boom"));
        const req = { body: { email: "x", password: "p" } };
        const res = buildRes();

        await authController.login(req, res);

        expect(res.statusCode).toBe(500);
        expect(res.body).toEqual({ error: "Server error" });
    });

    it("authenticates token from cookie", () => {
        const token = "token";
        const decoded = { userId: "id", role: "user" };
        vi.spyOn(jwt, "verify").mockReturnValueOnce(decoded);

        const req = { cookies: { [AUTH_COOKIE_NAME]: token }, headers: {} };
        const res = buildRes();
        const next = vi.fn();

        authController.authenticateUser(req, res, next);

        expect(req.user).toMatchObject(decoded);
        expect(req.user).toHaveProperty("roles", ["user"]);
        expect(req.userId).toBe(decoded.userId);
        expect(next).toHaveBeenCalled();
    });

    it("returns 401 when no token provided", () => {
        const req = { cookies: {}, headers: {} };
        const res = buildRes();
        const next = vi.fn();

        authController.authenticateUser(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "Ingen giltig token angiven." });
        expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 when token missing userId", () => {
        vi.spyOn(jwt, "verify").mockReturnValueOnce({});
        const req = { cookies: { [AUTH_COOKIE_NAME]: "t" }, headers: {} };
        const res = buildRes();
        const next = vi.fn();

        authController.authenticateUser(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({
            error: "Autentisering saknas (No userId in token).",
        });
        expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 when token invalid", () => {
        vi.spyOn(jwt, "verify").mockImplementation(() => {
            throw new Error("bad");
        });
        const req = { cookies: { [AUTH_COOKIE_NAME]: "t" }, headers: {} };
        const res = buildRes();
        const next = vi.fn();

        authController.authenticateUser(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "Ogiltig token." });
    });

    it("clears cookie on logout", async () => {
        const res = buildRes();
        await authController.logout({}, res);
        expect(res.cleared).toEqual({
            name: AUTH_COOKIE_NAME,
            opts: AUTH_COOKIE_OPTIONS,
        });
        expect(res.body).toEqual({ message: "Logout successful" });
    });

    it("returns session when token valid and user exists", async () => {
        const decoded = { userId: "u" };
        vi.spyOn(jwt, "verify").mockReturnValueOnce(decoded);
        const user = {
            _id: "u",
            name: "Name",
            email: "email",
            role: "role",
            roles: ["role"],
            mustChangePassword: false,
        };
        vi.spyOn(User, "findById").mockReturnValueOnce({
            select: vi.fn().mockResolvedValueOnce(user),
        });

        const req = { cookies: { [AUTH_COOKIE_NAME]: "t" } };
        const res = buildRes();

        await authController.getSession(req, res);

        expect(res.body).toEqual({
            requiresPasswordChange: false,
            user: {
                userId: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                roles: user.roles,
            },
        });
    });

    it("returns requiresPasswordChange true from session when flag is set", async () => {
        const decoded = { userId: "u" };
        vi.spyOn(jwt, "verify").mockReturnValueOnce(decoded);
        const user = {
            _id: "u",
            name: "Name",
            email: "email",
            role: "systemadmin",
            roles: ["systemadmin"],
            mustChangePassword: true,
        };
        vi.spyOn(User, "findById").mockReturnValueOnce({
            select: vi.fn().mockResolvedValueOnce(user),
        });

        const req = { cookies: { [AUTH_COOKIE_NAME]: "t" } };
        const res = buildRes();

        await authController.getSession(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.requiresPasswordChange).toBe(true);
    });

    it("returns 401 when session token missing", async () => {
        const req = { cookies: {} };
        const res = buildRes();

        await authController.getSession(req, res);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "No active session" });
    });

    it("returns 404 when user not found", async () => {
        const decoded = { userId: "u" };
        vi.spyOn(jwt, "verify").mockReturnValueOnce(decoded);
        vi.spyOn(User, "findById").mockReturnValueOnce({
            select: vi.fn().mockResolvedValueOnce(null),
        });

        const req = { cookies: { [AUTH_COOKIE_NAME]: "t" } };
        const res = buildRes();

        await authController.getSession(req, res);

        expect(res.statusCode).toBe(404);
        expect(res.body).toEqual({ error: "User not found" });
    });

    it("returns 403 when session token invalid", async () => {
        vi.spyOn(jwt, "verify").mockImplementation(() => {
            throw new Error("boom");
        });
        const req = { cookies: { [AUTH_COOKIE_NAME]: "t" } };
        const res = buildRes();

        await authController.getSession(req, res);

        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({ error: "Invalid session" });
    });

    it("changes password and clears mustChangePassword", async () => {
        const user = {
            _id: "u1",
            email: "admin@example.com",
            password: "old-hash",
            mustChangePassword: true,
            save: vi.fn().mockResolvedValue(true),
        };
        vi.spyOn(User, "findById").mockResolvedValueOnce(user);
        vi.spyOn(bcrypt, "compare").mockResolvedValueOnce(true);
        vi.spyOn(bcrypt, "hash").mockResolvedValueOnce("new-hash");

        const req = {
            userId: "u1",
            body: { currentPassword: "mindful", newPassword: "NewPassword123!" },
        };
        const res = buildRes();

        await authController.changePassword(req, res);

        expect(user.password).toBe("new-hash");
        expect(user.mustChangePassword).toBe(false);
        expect(user.save).toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({
            message: "Lösenordet har ändrats.",
            requiresPasswordChange: false,
        });
    });

    it("returns 401 when current password is wrong", async () => {
        const user = {
            _id: "u1",
            password: "old-hash",
            mustChangePassword: true,
        };
        vi.spyOn(User, "findById").mockResolvedValueOnce(user);
        vi.spyOn(bcrypt, "compare").mockResolvedValueOnce(false);

        const req = {
            userId: "u1",
            body: { currentPassword: "wrong", newPassword: "NewPassword123!" },
        };
        const res = buildRes();

        await authController.changePassword(req, res);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "Nuvarande lösenord är felaktigt." });
        expect(user.mustChangePassword).toBe(true);
    });

    it("returns 400 when fields are missing", async () => {
        const req = { userId: "u1", body: { newPassword: "NewPassword123!" } };
        const res = buildRes();

        await authController.changePassword(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({
            error: "Nuvarande och nytt lösenord krävs.",
        });
    });

    it("returns 404 when user not found", async () => {
        vi.spyOn(User, "findById").mockResolvedValueOnce(null);

        const req = {
            userId: "missing",
            body: { currentPassword: "x", newPassword: "NewPassword123!" },
        };
        const res = buildRes();

        await authController.changePassword(req, res);

        expect(res.statusCode).toBe(404);
        expect(res.body).toEqual({ error: "Användaren hittades inte." });
    });

    it("returns 500 when changePassword throws", async () => {
        vi.spyOn(User, "findById").mockRejectedValueOnce(new Error("boom"));

        const req = {
            userId: "u1",
            body: { currentPassword: "x", newPassword: "NewPassword123!" },
        };
        const res = buildRes();

        await authController.changePassword(req, res);

        expect(res.statusCode).toBe(500);
        expect(res.body).toEqual({ error: "Server error" });
    });
});
