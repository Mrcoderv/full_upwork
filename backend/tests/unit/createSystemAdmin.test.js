import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import User from "../../src/models/User.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";
import { createSystemAdmin, DEFAULT_SYSTEM_ADMIN_PASSWORD } from "../../scripts/createSystemAdmin.js";

describe("createSystemAdmin", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    afterEach(async () => {
        await User.deleteMany({});
    });

    it("creates a systemadmin with mustChangePassword when using the default password", async () => {
        const admin = await createSystemAdmin({
            email: "default@example.com",
            password: DEFAULT_SYSTEM_ADMIN_PASSWORD,
        });

        expect(admin.role).toBe("systemadmin");
        expect(admin.email).toBe("default@example.com");
        expect(admin.mustChangePassword).toBe(true);

        const saved = await User.findOne({ email: "default@example.com" });
        expect(saved.mustChangePassword).toBe(true);
        expect(saved.roles).toContain("systemadmin");
    });

    it("creates a systemadmin without the flag when a custom password is supplied", async () => {
        const admin = await createSystemAdmin({
            email: "custom@example.com",
            password: "SuperStrongPassword123!",
        });

        expect(admin.mustChangePassword).toBe(false);

        const saved = await User.findOne({ email: "custom@example.com" });
        expect(saved.mustChangePassword).toBe(false);
    });

    it("throws when a systemadmin already exists", async () => {
        await User.create({
            username: "Existing",
            email: "existing@example.com",
            password: "hash",
            roles: ["systemadmin"],
        });

        await expect(
            createSystemAdmin({
                email: "new@example.com",
                password: DEFAULT_SYSTEM_ADMIN_PASSWORD,
            })
        ).rejects.toThrow("System admin already exists");
    });
});
