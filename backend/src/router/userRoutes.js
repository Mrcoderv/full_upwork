import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Student from "../models/Student.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { validate, validateId } from "../middleware/validation.js";
import { asyncHandler } from "../utils/errorHandler.js";
import { recordAudit } from "../utils/auditLog.js";
import logger from "../utils/logger.js";

const LOGBOOK_ROLES = ["admin", "systemadmin", "teacher"];


const router = express.Router();

const registerSchema = {
    name: { type: "string", required: true, min: 1, max: 100, sanitize: true },
    email: { type: "string", required: true, email: true },
    password: { type: "string", required: true, password: true },
};

const resetPasswordSchema = {
    token: { type: "string", required: true },
    newPassword: { type: "string", required: true, password: true },
};

router.post("/register", validate(registerSchema), async (req, res) => {
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

router.post("/reset-password", validate(resetPasswordSchema), async (req, res) => {
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
            mustChangePassword: false,
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
            user.mustChangePassword = true; // temp password — force change on next login
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
                mustChangePassword: true, // temp password — force change on first login
            });

            await newUser.save();

            // Send the temp password to the student (fire-and-log; a failure
            // must never break user creation). The password stays in the
            // response for the admin to see.
            try {
                const { sendEmail, renderTempPasswordEmail } = await import(
                    "../services/emailService.js"
                );
                const { subject, text } = renderTempPasswordEmail({
                    studentName: name || student.name,
                    email,
                    tempPassword,
                });
                await sendEmail({ to: email, subject, text });
            } catch (emailError) {
                logger.warn({ err: emailError }, "Temp-password email skipped (non-fatal)");
            }

            res.status(201).send({
                message: "User created successfully for student.",
                user: {
                    _id: newUser._id,
                    email: newUser.email,
                    username: newUser.username,
                    roles: newUser.roles,
                },
                // The temp password is emailed to the student AND returned here
                // so the admin can pass it along if the mail cannot be delivered.
                tempPassword: tempPassword,
            });
        } catch (error) {
            logger.error({ err: error }, "Error creating user for student");
            res.status(500).send({
                message: "An error occurred while creating user for student.",
            });
        }
    }
);

router.get(
    "/students/:studentId/logbook",
    isAuthenticated,
    hasRole(LOGBOOK_ROLES),
    validateId("studentId"),
    asyncHandler(async (req, res) => {
        try {
            const student = await Student.findById(req.params.studentId);
            if (!student) {
                return res.status(404).send({ message: "Student not found." });
            }
            res.send({
                success: true,
                logbook: student.logbook || [],
            });
        } catch (error) {
            logger.error({ err: error }, "Error fetching student logbook");
            res.status(500).send({ message: "Internal server error." });
        }
    })
);

router.post(
    "/students/:studentId/logbook",
    isAuthenticated,
    hasRole(LOGBOOK_ROLES),
    validateId("studentId"),
    asyncHandler(async (req, res) => {
        try {
            const student = await Student.findById(req.params.studentId);
            if (!student) {
                return res.status(404).send({ message: "Student not found." });
            }

            const { title, description, startDate, endDate, placementId, coursePackageId } = req.body;
            if (!title) {
                return res.status(400).send({ message: "Titel krävs." });
            }

            const newKit = {
                id: new mongoose.Types.ObjectId(),
                title,
                description,
                startDate: startDate || new Date(),
                endDate,
                status: "pending",
                placementId,
                coursePackageId,
            };

            student.logbook = (student.logbook || []).concat(newKit);
            await student.save();

            await recordAudit(req, {
                entityType: "Student",
                entityId: student._id,
                action: "logbook:create",
                description: `Lade till loggboks-kit "${title}" för elev ${student.name || req.params.studentId}`,
            });

            res.send({
                success: true,
                logbook: student.logbook,
                message: "Logboken uppdaterades med ny kit.",
            });
        } catch (error) {
            logger.error({ err: error }, "Error adding logbook kit");
            res.status(500).send({ message: "Internal server error." });
        }
    })
);



router.get(
    "/student-details/:studentId/logbook",
    isAuthenticated,
    hasRole(LOGBOOK_ROLES),
    validateId("studentId"),
    asyncHandler(async (req, res) => {
        try {
            const student = await Student.findById(req.params.studentId);
            if (!student) {
                return res.status(404).send({ message: "Student not found." });
            }
            res.send({
                success: true,
                logbook: student.logbook || [],
                aplStatus: student.aplStatus,
                aplStatusHistory: student.aplStatusHistory,
            });
        } catch (error) {
            logger.error({ err: error }, "Error fetching student logbook details");
            res.status(500).send({ message: "Internal server error." });
        }
    })
);

export default router;
