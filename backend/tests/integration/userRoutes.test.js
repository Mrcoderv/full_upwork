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
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import User from "../../src/models/User.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

describe("User Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
        process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await User.deleteMany({});
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await User.deleteMany({});
    });

    describe("POST /api/register", () => {
        it("rejects missing fields", async () => {
            const response = await request(app)
                .post("/api/register")
                .send({ email: "user@example.com", password: "Secret123" })
                .expect(400);

            expect(response.body).toEqual({
                message: "Alla fält är obligatoriska!",
            });
        });

        it("rejects existing users", async () => {
            await User.create({
                name: "Existing User",
                email: "user@example.com",
                password: "hashed",
            });

            const response = await request(app)
                .post("/api/register")
                .send({
                    name: "Existing User",
                    email: "user@example.com",
                    password: "Secret123!",
                })
                .expect(409);

            expect(response.body).toEqual({
                message:
                    "Emailadressen finns redan, var vänlig att logga in!",
            });
        });

        it("creates a new user with a hashed password", async () => {
            const response = await request(app)
                .post("/api/register")
                .send({
                    name: "New User",
                    email: "new@example.com",
                    password: "Secret123!",
                })
                .expect(201);

            expect(response.body).toEqual({
                message: "Användare registrerad!",
            });

            const savedUser = await User.findOne({ email: "new@example.com" });
            expect(savedUser).not.toBeNull();
            expect(savedUser?.name).toBe("New User");
            expect(savedUser?.password).not.toBe("Secret123!");
        });

        it("returns 500 when registration fails", async () => {
            vi.spyOn(User, "findOne").mockRejectedValueOnce(
                new Error("Lookup failed")
            );

            const response = await request(app)
                .post("/api/register")
                .send({
                    name: "New User",
                    email: "new@example.com",
                    password: "Secret123!",
                })
                .expect(500);

            expect(response.body).toEqual({
                message: "Ett fel uppstod vid registrering.",
            });
        });
    });

    describe("POST /api/reset-password", () => {
        it("rejects missing token or password", async () => {
            const response = await request(app)
                .post("/api/reset-password")
                .send({ token: "token-only" })
                .expect(400);

            expect(response.body).toEqual({
                message: "Alla fält är obligatoriska!",
            });
        });

        it("updates the password when the token is valid", async () => {
            const user = await User.create({
                name: "Reset User",
                email: "reset@example.com",
                password: "old-password",
            });

            const token = jwt.sign(
                { id: user._id.toString() },
                process.env.JWT_SECRET
            );

            const response = await request(app)
                .post("/api/reset-password")
                .send({ token, newPassword: "NewSecret123!" })
                .expect(200);

            expect(response.body).toEqual({
                message: "Lösenordet har ändrats!",
            });

            const updatedUser = await User.findById(user._id);
            expect(updatedUser).not.toBeNull();
            const passwordMatches = await bcrypt.compare(
                "NewSecret123!",
                updatedUser?.password || ""
            );
            expect(passwordMatches).toBe(true);
        });

        it("returns 401 when the token is expired", async () => {
            const expiredError = new Error("Token expired");
            expiredError.name = "TokenExpiredError";
            vi.spyOn(jwt, "verify").mockImplementationOnce(() => {
                throw expiredError;
            });

            const response = await request(app)
                .post("/api/reset-password")
                .send({ token: "expired-token", newPassword: "NewSecret123!" })
                .expect(401);

            expect(response.body).toEqual({ message: "Token har löpt ut." });
        });

        it("returns 500 when the reset process fails", async () => {
            vi.spyOn(jwt, "verify").mockImplementationOnce(() => {
                throw new Error("Invalid token");
            });

            const response = await request(app)
                .post("/api/reset-password")
                .send({ token: "bad-token", newPassword: "NewSecret123!" })
                .expect(500);

            expect(response.body).toEqual({
                message: "Ett fel uppstod vid lösenordsändring.",
            });
        });
    });
});
