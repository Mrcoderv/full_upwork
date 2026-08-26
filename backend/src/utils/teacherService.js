import Teacher from "../models/Teacher.js";
import User from "../models/User.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import logger from "./logger.js";

/**
 * Generate a strong random password
 */
function generateStrongPassword(length = 12) {
    const charset =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
    let password = "";

    // Ensure at least one character from each category
    const categories = [
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ", // uppercase
        "abcdefghijklmnopqrstuvwxyz", // lowercase
        "0123456789", // numbers
        "!@#$%^&*()_+-=[]{}|;:,.<>?", // special characters
    ];

    // Add one character from each category
    categories.forEach((category) => {
        password += category[crypto.randomInt(0, category.length)];
    });

    // Fill the rest with random characters
    for (let i = password.length; i < length; i++) {
        password += charset[crypto.randomInt(0, charset.length)];
    }

    // Shuffle the password to randomize the order
    return password
        .split("")
        .sort(() => crypto.randomInt(0, 3) - 1)
        .join("");
}

// Predefined color list for teacher profiles
const TEACHER_COLORS = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', 
    '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080', 
    '#ffffff', '#000000'
];

/**
 * Get the next available color from the predefined list
 * Ensures each teacher gets a unique color
 */
async function getNextAvailableColor() {
    try {
        // Get all existing teachers and their colors
        const existingTeachers = await Teacher.find({}, 'colorCode');
        const usedColors = new Set(existingTeachers.map(t => t.colorCode).filter(Boolean));
        
        // Find the first color in the list that's not used
        for (const color of TEACHER_COLORS) {
            if (!usedColors.has(color)) {
                return color;
            }
        }
        
        // If all colors are used, cycle through the list
        // This shouldn't happen with 22 colors, but handle it gracefully
        const index = existingTeachers.length % TEACHER_COLORS.length;
        return TEACHER_COLORS[index];
    } catch (error) {
        logger.error({ err: error }, "Error getting next available color");
        // Fallback to first color if there's an error
        return TEACHER_COLORS[0];
    }
}

/**
 * Create or find teacher by name
 * @param {string} teacherName - The teacher's name
 * @param {string} createdByUserId - ID of the user who created this teacher
 * @param {string} subject - The subject for the teacher (optional)
 * @returns {Object} - { teacher, wasCreated, password }
 */
export async function createOrFindTeacher(
    teacherName,
    _createdByUserId = null,
    subject = "Övrigt"
) {
    try {
        // First, try to find existing teacher by name
        const allTeachers = await Teacher.find().populate(
            "userId",
            "username email"
        );
        const existingTeacher = allTeachers.find((t) => {
            if (!t.userId || !t.userId.username) {
                logger.warn({ teacher: t }, "Teacher found without valid userId or username");
                return false;
            }
            return (
                t.userId.username.toLowerCase() === teacherName.toLowerCase()
            );
        });

        if (existingTeacher) {
            return {
                teacher: existingTeacher,
                wasCreated: false,
                password: null,
            };
        }

        // Create new user account
        const username = teacherName.trim();
        const email = `${username
            .toLowerCase()
            .replace(/\s+/g, ".")}@mindful.se`;

        // Generate password
        const plainPassword = generateStrongPassword();
        const hashedPassword = await bcrypt.hash(plainPassword, 12);

        // Create new User
        const user = new User({
            username,
            email,
            password: hashedPassword,
            roles: ["teacher"],
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const savedUser = await user.save();

        // Create new Teacher linked to the User
        const teacherColor = await getNextAvailableColor();
        const teacher = new Teacher({
            userId: savedUser._id,
            colorCode: teacherColor,
            subject: subject || "Övrigt",
        });

        const savedTeacher = await teacher.save();

        // Log the creation
        logger.info({ username, email }, "Auto-created teacher");

        return {
            teacher: savedTeacher,
            wasCreated: true,
            password: plainPassword,
        };
    } catch (error) {
        logger.error({ err: error }, "Error creating or finding teacher");
        throw error;
    }
}
