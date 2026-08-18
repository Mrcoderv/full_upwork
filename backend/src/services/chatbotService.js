import logger from "../utils/logger.js";
import Student from "../models/Student.js";
import CourseInstance from "../models/CourseInstance.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import User from "../models/User.js";
import mongoose from "mongoose";

const MAX_CONTEXT_MODULES = 5;

/**
 * Chatbot answer source - returned from search operations.
 * Properties:
 *   content: The content/text that formed the basis of the answer
 *   source: Source identification (course, document, policy, etc.)
 *   confidence: Confidence score 0-1; lower means "ask a human"
 *   isApproved: Whether the source is approved/verified
 *
 * @typedef {Object} ChatbotSource
 * @property {string} content - The content/text that formed the basis of the answer
 * @property {string} source - Source identification (course, document, policy, etc.)
 * @property {number} confidence - Confidence score 0-1
 * @property {boolean} isApproved - Whether the source is approved/verified
 */

/**
 * Chatbot service interface - defines the contract for question answering.
 * Implementations must provide `ask` and `logInteraction` methods.
 *
 * @typedef {Object} ChatbotServiceInterface
 * @param {string} studentId - The student's ID
 * @param {string} question - The student's question
 * @param {string} [courseInstanceId] - Optional: restrict search to a specific course
 * @returns {Promise<Object>} - Object with answer, sources, confidence, approved, sessionId
 * @param {string} studentId - The student's ID
 * @param {string} question - The student's question
 * @param {string|null} answer - The answer provided (null if fallback)
 * @param {Array<ChatbotSource>} sources - The sources used
 * @param {boolean} success - Whether the answer was successfully generated
 */

/**
 * Chatbot result returned from ask() method.
 *
 * @typedef {Object} ChatbotResult
 * @property {string} answer - The generated answer
 * @property {Array<ChatbotSource>} sources - Sources used for the answer
 * @property {number} confidence - Confidence score 0-1
 * @property {boolean} approved - Whether the answer uses approved sources
 * @property {string} sessionId - Unique session identifier
 */

/**
 * Chatbot error types for consistent error handling.
 *
 * @enum {string} ChatbotErrorType
 * @property {string} NO_ENROLLMENT - Student not enrolled in any courses
 * @property {string} QUESTION_TOO_COMPLEX - Question beyond system knowledge
 * @property {string} NO_APPROVED_SOURCE - No approved information found
 * @property {string} SERVICE_UNAVAILABLE - AI provider unavailable
 * @property {string} INTERNAL_ERROR - Unexpected error
 */

/**
 * Generate a unique session ID for tracking the chat session.
 * @param {string} [prefix] - Optional prefix for the session ID
 * @returns {string} Unique session ID
 */
function generateSessionId(prefix = "") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Check if a date is valid (not NaN, not epoch).
 * @param {*} val - Value to check
 * @returns {boolean} True if valid date
 */
function isValidDate(val) {
  return val && !isNaN(new Date(val).getTime()) && new Date(val).getFullYear() > 1970;
}

/**
 * Base chatbot service with common functionality:
 * - Student permission checking (only enrolled courses)
 * - Interaction logging
 * - Source validation
 * - Context building from course modules
 *
 * Subclasses must implement the `searchAndAnswer` method to provide
 * the actual question-answering logic (e.g., via external AI provider,
 * knowledge base search, etc.).
 *
 * @augments {BaseChatbotService}
 */
class BaseChatbotService {
  /**
   * Get the student's enrolled course instances.
   * Only content from these courses will be included in the answer context.
   *
   * @param {string} studentId - The student's ID
   * @returns {Promise<Array<string>>} Array of course instance IDs the student is enrolled in
   */
  async getEnrolledCourseInstances(studentId) {
    const student = await Student.findById(studentId).lean();
    if (!student) return [];

    const enrollmentIds = (student.enrollments || [])
      .filter((e) => e.status && ["enrolled", "active"].includes(e.status))
      .map((e) => e.courseInstanceId?.toString())
      .filter((id) => id);

    const courseInstances = await CourseInstance.find({
      _id: { $in: enrollmentIds },
    })
      .select("_id")
      .lean();

    return courseInstances.map((ci) => ci._id.toString());
  }

  /**
   * Check if a student is enrolled in a specific course instance.
   *
   * @param {string} studentId - The student's ID
   * @param {string} courseInstanceId - The course instance ID
   * @returns {Promise<boolean>} Boolean indicating enrollment
   */
  async isEnrolledIn(studentId, courseInstanceId) {
    const enrollment = await StudentEnrollment.findOne({
      studentId,
      courseInstanceId,
      status: { $in: ["enrolled", "active"] },
    }).lean();
    return !!enrollment;
  }

  /**
   * Log a chatbot interaction for analytics.
   * Fail-soft: a logging failure must never break the answer flow.
   *
   * @param {string} studentId - The student's ID
   * @param {string} question - The student's question
   * @param {string|null} answer - The answer provided (null if fallback/human)
   * @param {Array} sources - The sources used (may be empty if fallback)
   * @param {boolean} success - Whether the answer was successfully generated
   */
  async logInteraction(studentId, question, answer, sources, success) {
    try {
      logger.info({
        event: "chatbot_interaction",
        studentId,
        questionLength: question.length,
        answerLength: answer ? answer.length : 0,
        sourcesCount: sources ? sources.length : 0,
        success,
      }, "Chatbot interaction logged");
    } catch (error) {
      logger.warn({ err: error }, "Failed to log chatbot interaction (non-fatal)");
    }
  }

  /**
   * Validate that sources contain only approved/verified information.
   * Implementations should mark sources as approved when they come from
   * official system documents, course materials, or policy texts.
   *
   * @param {Array} sources - The sources to validate
   * @returns {Array} Filtered sources with only approved entries
   */
  filterApprovedSources(sources) {
    return sources.filter((s) => s.isApproved);
  }

  /**
   * Build a context string from course modules that are relevant to the question.
   * This helps focus the answer on course-specific information.
   *
   * @param {string} studentId - The student's ID
   * @param {string} question - The student's question
   * @param {string} [courseInstanceId] - Optional specific course to focus on
   * @returns {Promise<string>} Context string with module information, or empty string
   */
  async buildContext(studentId, question, courseInstanceId) {
    const courseIds = courseInstanceId
      ? [courseInstanceId]
      : await this.getEnrolledCourseInstances(studentId);

    if (courseIds.length === 0) {
      return "";
    }

    const pipeline = [
      { $match: { _id: { $in: courseIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
      { $limit: MAX_CONTEXT_MODULES },
    ];

    const instances = await CourseInstance.aggregate(pipeline);

    const contextParts = [];
    for (const instance of instances) {
      const modules = (instance.modules || []).slice(0, MAX_CONTEXT_MODULES);
      for (const module of modules) {
        if (module.title || module.instructions) {
          const title = module.title || "Modul";
          const instructions = module.instructions || "";
          contextParts.push(`${title}: ${instructions}`);
        }
      }
    }

    return contextParts.length > 0 ? contextParts.join("\n\n") : "";
  }
}

export default BaseChatbotService;