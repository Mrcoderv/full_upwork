import express from "express";
import User from "../models/User.js";
import nodemailer from "nodemailer";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import logger from "../utils/logger.js";


const router = express.Router();

const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: "newmindful.development@gmail.com",
        pass: process.env.GOOGLE_PWD,
    },
});

router.post("/register", async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res
                .status(400)
                .send({ message: "Alla fält är obligatoriska!" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).send({
                message: "Emailadressen finns redan, var vänlig att logga in!",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword });
        await newUser.save();

        return res.status(201).send({ message: "Användare registrerad!" });
    } catch (error) {
        logger.error({ err: error }, "Error during registration");
        return res
            .status(500)
            .send({ message: "Ett fel uppstod vid registrering." });
    }
});

router.post("/reset-password", async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res
                .status(400)
                .send({ message: "Token och nytt lösenord krävs" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await User.findByIdAndUpdate(decoded.id, {
            password: hashedPassword,
        });

        return res.send({ message: "Lösenordet har ändrats!" });
    } catch (error) {
        logger.error({ err: error }, "Error during password reset");
        if (error.name === "TokenExpiredError") {
            return res.status(401).send({ message: "Token har löpt ut." });
        }
        return res
            .status(500)
            .send({ message: "Ett fel uppstod vid lösenordsändring." });
    }
});

router.put(
    "/users/:userId/roles",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        try {
            const { roles } = req.body;
            const { userId } = req.params;

            if (!roles || !Array.isArray(roles)) {
                return res
                    .status(400)
                    .send({ message: "Roles must be an array." });
            }

            const user = await User.findById(userId);

            if (!user) {
                return res.status(404).send({ message: "User not found." });
            }

            user.roles = roles;
            await user.save();

            res.send({ message: "User roles updated successfully.", user });
        } catch (error) {
            logger.error({ err: error }, "Error updating user roles");
            res.status(500).send({
                message: "An error occurred while updating user roles.",
            });
        }
    }
);

/**
 * Update user permissions
 * PUT /api/users/:userId/permissions
 */
router.put(
    "/users/:userId/permissions",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        try {
            const { permissions } = req.body;
            const { userId } = req.params;

            if (!permissions || typeof permissions !== "object") {
                return res
                    .status(400)
                    .send({ message: "Permissions must be an object." });
            }

            const user = await User.findById(userId);

            if (!user) {
                return res.status(404).send({ message: "User not found." });
            }

            user.permissions = permissions;
            await user.save();

            res.send({ message: "User permissions updated successfully.", user });
        } catch (error) {
            logger.error({ err: error }, "Error updating user permissions");
            res.status(500).send({
                message: "An error occurred while updating user permissions.",
            });
        }
    }
);

/**
 * Reset user password and return new temporary password
 * POST /api/users/:userId/reset-password
 */
router.post(
    "/users/:userId/reset-password",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        try {
            const { userId } = req.params;

            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).send({ message: "User not found." });
            }

            // Generate a new temporary password
            const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase();
            const hashedPassword = await bcrypt.hash(tempPassword, 10);

            user.password = hashedPassword;
            await user.save();

            res.send({
                message: "Password reset successfully.",
                tempPassword: tempPassword, // Return the plain text password for admin display
            });
        } catch (error) {
            logger.error({ err: error }, "Error resetting password");
            res.status(500).send({
                message: "An error occurred while resetting password.",
            });
        }
    }
);

/**
 * Create a user account for a student
 * POST /api/users/create-for-student
 */
router.post(
    "/users/create-for-student",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        try {
            const { studentId, email, name } = req.body;
            const Student = (await import("../models/Student.js")).default;

            if (!studentId || !email) {
                return res.status(400).send({
                    message: "Student ID and email are required.",
                });
            }

            // Check if student exists
            const student = await Student.findById(studentId);
            if (!student) {
                return res.status(404).send({ message: "Student not found." });
            }

            // Check if user already exists
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(409).send({
                    message: "A user with this email already exists.",
                    user: existingUser,
                });
            }

            // Generate a temporary password
            const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase();
            const hashedPassword = await bcrypt.hash(tempPassword, 10);

            // Create user with student role by default
            const newUser = new User({
                username: name || student.name,
                email: email,
                password: hashedPassword,
                roles: ["student"],
            });

            await newUser.save();

            res.status(201).send({
                message: "User created successfully for student.",
                user: {
                    _id: newUser._id,
                    email: newUser.email,
                    username: newUser.username,
                    roles: newUser.roles,
                },
                // Note: In production, you might want to send the password via email
                tempPassword: tempPassword, // Only for development/admin use
            });
        } catch (error) {
            logger.error({ err: error }, "Error creating user for student");
            res.status(500).send({
                message: "An error occurred while creating user for student.",
            });
        }
    }
);

export default router;
