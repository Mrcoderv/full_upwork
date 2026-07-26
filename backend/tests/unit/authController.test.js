import { describe, it, expect, afterEach, vi } from "vitest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import * as authController from "../../src/controllers/authController.js";
import User from "../../src/models/User.js";

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
        };
        vi.spyOn(User, "findOne").mockResolvedValueOnce(user);
        vi.spyOn(bcrypt, "compare").mockResolvedValueOnce(true);
        const token = "jwt-token";
        vi.spyOn(jwt, "sign").mockReturnValueOnce(token);

        const req = { body: { email: "u@example.com", password: "secret" } };
        const res = buildRes();

        await authController.login(req, res);

        expect(res.cookies.token.value).toBe(token);
        expect(res.body).toEqual({
            message: "Login successful",
            user: {
                userId: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                roles: user.roles,
            },
        });
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

        const req = { cookies: { token }, headers: {} };
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
        const req = { cookies: { token: "t" }, headers: {} };
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
        const req = { cookies: { token: "t" }, headers: {} };
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
            name: "token",
            opts: {
                httpOnly: true,
                sameSite: "lax",
                secure: false,
            },
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
        };
        vi.spyOn(User, "findById").mockReturnValueOnce({
            select: vi.fn().mockResolvedValueOnce(user),
        });

        const req = { cookies: { token: "t" } };
        const res = buildRes();

        await authController.getSession(req, res);

        expect(res.body).toEqual({
            user: {
                userId: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                roles: user.roles,
            },
        });
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

        const req = { cookies: { token: "t" } };
        const res = buildRes();

        await authController.getSession(req, res);

        expect(res.statusCode).toBe(404);
        expect(res.body).toEqual({ error: "User not found" });
    });

    it("returns 403 when session token invalid", async () => {
        vi.spyOn(jwt, "verify").mockImplementation(() => {
            throw new Error("boom");
        });
        const req = { cookies: { token: "t" } };
        const res = buildRes();

        await authController.getSession(req, res);

        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({ error: "Invalid session" });
    });
});
