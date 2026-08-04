import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../src/models/User.js";

// Fix __dirname in ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the correct path
dotenv.config({ path: path.resolve(__dirname, "../.env.production") });

export const DEFAULT_SYSTEM_ADMIN_PASSWORD = "mindful";

export async function createSystemAdmin(options = {}) {
    const {
        username = "Mindful Systemadmin",
        email = process.env.SYSTEM_ADMIN_EMAIL || "admin@mindful.com",
        password = process.env.SYSTEM_ADMIN_PASSWORD || DEFAULT_SYSTEM_ADMIN_PASSWORD,
        mongoUri = process.env.MONGODB_URI,
    } = options;

    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(mongoUri);
    }
    console.log("✅ Connected to MongoDB");

    // Check if a systemadmin already exists
    const existingAdmin = await User.findOne({ roles: "systemadmin" });
    if (existingAdmin) {
        console.log("⚠️ System Admin already exists:", existingAdmin.email);
        throw new Error("System admin already exists");
    }

    // Enforce a password change when the known default password is used —
    // a terminal log reminder is not enough, the account itself carries the flag.
    const usesDefaultPassword = password === DEFAULT_SYSTEM_ADMIN_PASSWORD;
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create System Admin User
    const systemAdmin = new User({
        username,
        email,
        password: hashedPassword,
        role: "systemadmin",
        mustChangePassword: usesDefaultPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    await systemAdmin.save();
    console.log("🎉 System Admin created successfully!");
    console.log(`🔑 Login Email: ${email}`);
    if (usesDefaultPassword) {
        console.log(
            `🔑 Password: ${DEFAULT_SYSTEM_ADMIN_PASSWORD} — MUST be changed on first login (enforced: mustChangePassword=true).`
        );
    } else {
        console.log(
            "🔑 Password: supplied via SYSTEM_ADMIN_PASSWORD (no forced change)."
        );
    }

    return systemAdmin;
}

const isDirectRun =
    process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
    createSystemAdmin()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Error creating system admin:", error);
            process.exit(1);
        });
}
