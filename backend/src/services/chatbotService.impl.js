import BaseChatbotService from "./chatbotService.js";
import mongoose from "mongoose";
import Student from "../models/Student.js";
import CourseInstance from "../models/CourseInstance.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import logger from "../utils/logger.js";

const CONFIDENCE_HIGH = 0.8;
const CONFIDENCE_MEDIUM = 0.5;
const CONFIDENCE_LOW = 0.2;

/**
 * Concrete chatbot implementation that searches course content
 * for students enrolled in those courses.
 *
 * The ask method:
 * 1. Identifies the student's enrolled courses
 * 2. Searches module titles and instructions for relevant content
 * 3. Generates an answer from the retrieved content
 * 4. Returns sources with confidence scores
 *
 * This is designed to be extended with an external AI provider
 * (OpenAI, Anthropic, etc.) while maintaining the same interface.
 */
class ConcreteChatbotService extends BaseChatbotService {
  /**
   * Receive a student question and return an answer with sources.
   * Only searches content from courses the student is enrolled in.
   *
   * @param {string} studentId - The student's ID
   * @param {string} question - The student's question
   * @param {string} [courseInstanceId] - Optional: restrict search to a specific course
   * @returns {Promise<Object>} - Object with answer, sources, confidence, approved, sessionId
   */
  async ask(studentId, question, courseInstanceId) {
    // Input validation
    if (!studentId || !question || question.trim().length === 0) {
      return {
        answer: "Ogiltig fråga. Vänligen ställ en giltig fråga.",
        sources: [],
        confidence: 0,
        approved: false,
        sessionId: generateSessionId(),
      };
    }

    try {
      // Determine which courses to search
      const targetCourseIds = courseInstanceId
        ? [courseInstanceId]
        : await this.getEnrolledCourseInstances(studentId);

      if (targetCourseIds.length === 0) {
        return {
          answer: "Du är inte inskriven på några kurser just nu, så jag kan inte svara på frågor om specifika kurser. Kontakta din lärare om du har frågor om dina studier.",
          sources: [],
          confidence: 0,
          approved: false,
          sessionId: generateSessionId(),
        };
      }

      // If a specific course was requested, verify enrollment
      if (courseInstanceId && !(await this.isEnrolledIn(studentId, courseInstanceId))) {
        return {
          answer: "Du är inte inskriven på den kursen. Jag kan bara svara på frågor om kurser du är inskriven på.",
          sources: [],
          confidence: 0,
          approved: false,
          sessionId: generateSessionId(),
        };
      }

      // Search course content for relevant information
      const sources = await this.searchContent(studentId, question, targetCourseIds);

      // If no approved sources found, try broader search
      const approvedSources = this.filterApprovedSources(sources);
      if (approvedSources.length === 0) {
        // Return a generic answer indicating no course-specific information found
        return {
          answer: "Jag hittar ingen specifik information om din fråga i kursmaterialet just nu. Kontakta din lärare för hjälp med kursrelaterade frågor.",
          sources: [],
          confidence: CONFIDENCE_LOW,
          approved: false,
          sessionId: generateSessionId(),
        };
      }

      // Generate answer from the retrieved sources
      const answer = this.generateAnswer(question, approvedSources);
      const confidence = this.calculateConfidence(approvedSources);

      // Log the interaction
      await this.logInteraction(
        studentId,
        question,
        answer,
        approvedSources,
        true
      );

      return {
        answer,
        sources: approvedSources,
        confidence,
        approved: true,
        sessionId: generateSessionId(),
      };
    } catch (error) {
      logger.error({ err: error, studentId }, "Error in chatbot ask");
      await this.logInteraction(
        studentId,
        question,
        null,
        [],
        false
      );

      return {
        answer: "Ett fel uppstod vid bearbetning av din fråga. Vänligen försök igen eller kontakta support.",
        sources: [],
        confidence: 0,
        approved: false,
        sessionId: generateSessionId(),
      };
    }
  }

  /**
   * Search course content for information relevant to the student's question.
   * Looks at module titles and instructions from the student's enrolled courses.
   *
   * @param {string} studentId - The student's ID
   * @param {string} question - The student's question
   * @param {Array<string>} targetCourseIds - Course instance IDs to search within
   * @returns {Promise<Array>} Array of sources with content, source identification, and confidence
   */
  async searchContent(studentId, question, targetCourseIds) {
    const sources = [];
    const questionLower = question.toLowerCase();

    // Query course instances for the relevant modules
    const courseFilter = {};
    if (targetCourseIds.length > 0) {
      courseFilter._id = {
        $in: targetCourseIds.map((id) => new mongoose.Types.ObjectId(id)),
      };
    }

    const instances = await CourseInstance.find(courseFilter)
      .select("modules")
      .lean();

    for (const instance of instances) {
      const modules = instance.modules || [];

      for (const module of modules) {
        // Search in module title
        if (module.title) {
          const titleLower = module.title.toLowerCase();
          if (titleLower.includes(questionLower) || this.isRelatedToQuestion(module.title, question)) {
            sources.push({
              content: `Modul: ${module.title}\nInstruktioner: ${module.instructions || ""}`,
              source: `CourseInstance ${instance._id.toString()}`,
              confidence: CONFIDENCE_MEDIUM,
              isApproved: true,
            });
          }
        }

        // Search in instructions
        if (module.instructions) {
          const instrLower = module.instructions.toLowerCase();
          if (instrLower.includes(questionLower)) {
            sources.push({
              content: `Instruktioner: ${module.instructions}`,
              source: `CourseInstance ${instance._id.toString()}, modul "${module.title || "okänd modul"}"`,
              confidence: CONFIDENCE_MEDIUM,
              isApproved: true,
            });
          }
        }

        // Search in assignment descriptions
        if (module.assignment && module.assignment.title) {
          const assignmentLower = module.assignment.title.toLowerCase();
          if (assignmentLower.includes(questionLower)) {
            sources.push({
              content: `Inlämningsuppgift: ${module.assignment.title}\nBeskrivning: ${module.assignment.description || ""}`,
              source: `CourseInstance ${instance._id.toString()}, inlämningsuppgift`,
              confidence: CONFIDENCE_HIGH,
              isApproved: true,
            });
          }
        }
      }
    }

    // Deduplicate sources by content hash (keep the highest confidence)
    const deduped = this.deduplicateSources(sources);

    return deduped;
  }

  /**
   * Check if a module title is related to the question (fuzzy matching).
   */
  isRelatedToQuestion(title, question) {
    const titleLower = title.toLowerCase();
    const questionLower = question.toLowerCase();

    // Keyword overlap check
    const titleWords = titleLower.split(/\s+/).filter((w) => w.length > 2);
    const questionWords = questionLower.split(/\s+/).filter((w) => w.length > 2);

    if (titleWords.length === 0) return false;

    const overlap = titleWords.filter((w) => questionWords.includes(w));
    return overlap.length >= Math.min(2, titleWords.length);
  }

  /**
   * Generate a human-readable answer from the retrieved sources.
   * This is the core QA logic - in a production system, this would be
   * replaced by an LLM call, but here we synthesize from the sources.
   */
  generateAnswer(question, sources) {
    if (sources.length === 0) {
      return "Jag hittar ingen relevant information för din fråga i kursmaterialet.";
    }

    // If we have a single high-confidence source, use it directly
    if (sources.length === 1 && sources[0].confidence >= CONFIDENCE_HIGH) {
      return this.extractDirectAnswer(sources[0].content, question);
    }

    // Synthesize from multiple sources
    const answerParts = [];

    // Check if the question is about assignments/deadlines
    const isAboutAssignment =
      /(inlammning|deadline|avge| när är)/.test(question.toLowerCase());

    if (isAboutAssignment && sources.some((s) => s.content.includes("inlämningsuppgift"))) {
      const assignmentSources = sources.filter(
        (s) => s.content.includes("inlämningsuppgift")
      );
      for (const source of assignmentSources) {
        answerParts.push(source.content);
      }
      if (answerParts.length > 0) {
        return answerParts.join("\n\n");
      }
    }

    // Check if the question is about course structure/content
    if (sources.length > 0) {
      // Take the first source's content as a basis, but limit length
      const firstSource = sources[0];
      const content = firstSource.content.substring(0, 500);
      answerParts.push(content);
    }

    // If we have multiple sources, mention that more information is available
    if (sources.length > 1) {
      answerParts.push(
        "\n...och ytterligare " + (sources.length - 1) + " källor finns tillgängliga i kursmaterialet."
      );
    }

    return answerParts.join("\n");
  }

  /**
   * Extract a direct answer from content by looking for question-related info.
   */
  extractDirectAnswer(content, question) {
    const questionLower = question.toLowerCase();
    const lines = content.split("\n");

    // Look for lines that contain question keywords
    const relevantLines = [];
    for (const line of lines) {
      const lineLower = line.toLowerCase();
      const keywords = [
        "deadline",
        "inlämning",
        "veckor",
        "poäng",
        "start",
        "slut",
        "termin",
      ];
      const hasKeyword = keywords.some((k) => lineLower.includes(k));
      if (hasKeyword) {
        relevantLines.push(line.trim());
      }
    }

    if (relevantLines.length > 0) {
      return relevantLines.join("\n");
    }

    // Return first 300 chars as fallback
    return content.substring(0, 300);
  }

  /**
   * Calculate confidence based on the number and quality of sources.
   */
  calculateConfidence(sources) {
    if (sources.length === 0) return CONFIDENCE_LOW;

    const highCount = sources.filter(
      (s) => s.confidence >= CONFIDENCE_HIGH
    ).length;
    const mediumCount = sources.filter(
      (s) => s.confidence >= CONFIDENCE_MEDIUM && s.confidence < CONFIDENCE_HIGH
    ).length;

    if (highCount > 0) return CONFIDENCE_HIGH;
    if (mediumCount >= 2) return CONFIDENCE_MEDIUM;
    if (sources.length >= 2) return CONFIDENCE_MEDIUM;
    return CONFIDENCE_LOW;
  }

  /**
   * Deduplicate sources by content, keeping the highest confidence entry.
   */
  deduplicateSources(sources) {
    const seen = new Map();
    for (const source of sources) {
      const contentKey = source.content.substring(0, 100); // Use first 100 chars as key
      if (!seen.has(contentKey) || source.confidence > seen.get(contentKey).confidence) {
        seen.set(contentKey, source);
      }
    }
    return Array.from(seen.values());
  }

  /**
   * Generate a unique session ID for tracking the chat session.
   */
  generateSessionId() {
    return generateSessionId("session");
  }
}

/**
 * Export the concrete service as the default chatbot service.
 * This can be swapped out for an external AI provider implementation
 * that implements the same BaseChatbotService pattern.
 */
export default new ConcreteChatbotService();