/**
 * Utility functions for calculating slutprovDate (final test date) based on teacher and course end date
 */
import logger from "./logger.js";

/**
 * Get the teacher's username from a Teacher document (populated or not)
 * @param {Object} teacher - Teacher document (may be populated with userId)
 * @returns {Promise<string|null>} - Teacher's username or null if not found
 */
async function getTeacherUsername(teacher) {
    if (!teacher) return null;

    // If teacher is already populated with userId and has username
    if (
        teacher.userId &&
        typeof teacher.userId === "object" &&
        teacher.userId.username
    ) {
        return teacher.userId.username;
    }

    // If teacher is a Teacher document (with _id) but userId is not populated
    if (
        teacher._id ||
        (teacher.userId &&
            typeof teacher.userId === "object" &&
            !teacher.userId.username)
    ) {
        const { default: Teacher } = await import("../models/Teacher.js");
        const teacherId = teacher._id || teacher;
        const teacherDoc = await Teacher.findById(teacherId).populate(
            "userId",
            "username"
        );
        if (teacherDoc && teacherDoc.userId && teacherDoc.userId.username) {
            return teacherDoc.userId.username;
        }
    }

    // If teacher is just an ObjectId (string or mongoose ObjectId)
    if (
        typeof teacher === "string" ||
        (teacher && !teacher._id && !teacher.userId)
    ) {
        const { default: Teacher } = await import("../models/Teacher.js");
        const teacherDoc = await Teacher.findById(teacher).populate(
            "userId",
            "username"
        );
        if (teacherDoc && teacherDoc.userId && teacherDoc.userId.username) {
            return teacherDoc.userId.username;
        }
    }

    return null;
}

/**
 * Calculate the slutprovDate based on teacher name and course end date
 *
 * Rules:
 * - Allan/Iman/Maja/Mette - Saturday the week before course end
 * - Eva - Thursday the day before course end
 * - Mirsada - Wednesday the week before course end
 * - Elham/Linnéa/Ulrika/Jonathan - Sunday the week before course end
 * - Angelina - Plans her own (default: Wednesday the week before course end)
 *
 * @param {Object|string} teacher - Teacher document or teacherId
 * @param {Date} courseEndDate - The course end date
 * @returns {Promise<Date|null>} - Calculated slutprovDate or null if teacher not found or no rule applies
 */
export async function calculateSlutprovDate(teacher, courseEndDate) {
    if (!teacher || !courseEndDate) {
        return null;
    }

    const teacherUsername = await getTeacherUsername(teacher);
    if (!teacherUsername) {
        return null;
    }

    // Normalize teacher name for comparison (case-insensitive, trim)
    const normalizedName = teacherUsername.trim().toLowerCase();
    
    // Debug logging
    logger.debug({ teacherUsername, normalizedName }, "Calculating slutprovDate for teacher");
    logger.debug({ courseEndDate: courseEndDate.toISOString().split('T')[0] }, "Course end date");

    // Helper function to get a specific day of the week before a date
    const getDayOfWeekBefore = (date, targetDay) => {
        // targetDay: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        const d = new Date(date);
        const currentDay = d.getDay();
        let daysToSubtract = (currentDay - targetDay + 7) % 7;

        // If the target day is the same as current day, go back a week
        if (daysToSubtract === 0) {
            daysToSubtract = 7;
        }

        d.setDate(d.getDate() - daysToSubtract);
        d.setHours(0, 0, 0, 0);
        return d;
    };

    // Helper function to get a specific day of the week in the week before
    const getDayOfWeekInPreviousWeek = (date, targetDay) => {
        // Find the week that contains the course end date
        // Then go to the previous week and find the target day
        const d = new Date(date);
        const currentDayOfWeek = d.getDay(); // 0 = Sunday, 6 = Saturday

        // Go to the start of the current week (Sunday)
        d.setDate(d.getDate() - currentDayOfWeek);

        // Go back one more week to get to the previous week
        d.setDate(d.getDate() - 7);

        // Add the target day (0 = Sunday, 6 = Saturday)
        d.setDate(d.getDate() + targetDay);
        d.setHours(0, 0, 0, 0);
        return d;
    };

    // Helper function to get the day before
     
    const getDayBefore = (date) => {
        const d = new Date(date);
        d.setDate(d.getDate() - 1);
        d.setHours(0, 0, 0, 0);
        return d;
    };

    // Check teacher name and apply appropriate rule
    // Get the first word of the name (in case it's "Allan Smith" or "Maja Andersson")
    const firstName = normalizedName.split(/\s+/)[0];
    
    // Helper function to check if name matches (exact first name match or whole name contains the name as a word)
    const nameMatches = (targetName) => {
        // Exact first name match
        if (firstName === targetName) return true;
        // Check if the normalized name contains the target name as a whole word (not substring)
        const nameRegex = new RegExp(`\\b${targetName}\\b`, 'i');
        return nameRegex.test(normalizedName);
    };
    
    // Allan/Iman/Maja/Mette - Saturday the week before course end
    if (["allan", "iman", "maja", "mette"].some(name => nameMatches(name))) {
        const result = getDayOfWeekInPreviousWeek(courseEndDate, 6); // 6 = Saturday
        logger.debug({ teacherUsername, calculatedDate: result.toISOString().split('T')[0] }, "Matched Allan/Iman/Maja/Mette rule - Calculated Saturday");
        return result;
    }

    // Eva - Thursday the day before course end
    if (nameMatches("eva")) {
        // Thursday the day before course end
        // Find the Thursday that is immediately before the course end date
        // If course ends on Friday, test is Thursday (day before)
        // If course ends on another day, find the previous Thursday
        const result = getDayOfWeekBefore(courseEndDate, 4); // 4 = Thursday
        logger.debug({ teacherUsername, calculatedDate: result.toISOString().split('T')[0] }, "Matched Eva rule - Calculated Thursday");
        return result;
    }

    // Mirsada - Wednesday the week before course end
    if (nameMatches("mirsada")) {
        const result = getDayOfWeekInPreviousWeek(courseEndDate, 3); // 3 = Wednesday
        logger.debug({ teacherUsername, calculatedDate: result.toISOString().split('T')[0] }, "Matched Mirsada rule - Calculated Wednesday");
        return result;
    }

    // Elham/Linnéa/Ulrika/Jonathan - Sunday the week before course end
    if (["elham", "linnea", "linnéa", "ulrika", "jonathan"].some(name => nameMatches(name))) {
        const result = getDayOfWeekInPreviousWeek(courseEndDate, 0); // 0 = Sunday
        logger.debug({ teacherUsername, calculatedDate: result.toISOString().split('T')[0] }, "Matched Elham/Linea/Ulrika/Jonathan rule - Calculated Sunday");
        return result;
    }

    // Angelina - Plans her own (default: Wednesday the week before course end)
    if (nameMatches("angelina")) {
        const result = getDayOfWeekInPreviousWeek(courseEndDate, 3); // 3 = Wednesday
        logger.debug({ teacherUsername, calculatedDate: result.toISOString().split('T')[0] }, "Matched Angelina rule - Calculated Wednesday");
        return result;
    }

    // No matching rule
    logger.warn({ teacherUsername }, "No matching rule found for teacher");
    return null;
}

/**
 * Check if a teacher name matches any of the automatic assignment rules
 * @param {string} teacherUsername - Teacher's username
 * @returns {boolean} - True if teacher has an automatic assignment rule
 */
export function hasAutomaticSlutprovRule(teacherUsername) {
    if (!teacherUsername) return false;

    const normalizedName = teacherUsername.trim().toLowerCase();

    return [
        "allan",
        "iman",
        "maja",
        "mette",
        "eva",
        "mirsada",
        "elham",
        "linnea",
        "linnéa",
        "ulrika",
        "jonathan",
        "angelina",
    ].some((name) => normalizedName.includes(name));
}
