import express from "express";
import mongoose from "mongoose";
import Question from "../models/Question.js";
import ExamAttempt from "../models/ExamAttempt.js";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";

const router = express.Router();

const STAFF_ROLES = ["systemadmin", "admin", "teacher", "coordinator", "syv", "specped"];

// GET /api/question-bank - Fetch questions with filtering
// Query params: subject, questionType, course, active, search, page, limit
router.get(
    "/",
    isAuthenticated,
    asyncHandler(async (req, res) => {
        try {
            const {
                subject,
                questionType,
                course,
                active,
                search,
                page = 1,
                limit = 20,
            } = req.query;

            const filter = {};

            if (subject) {
                filter.subject = subject;
            }

            if (questionType) {
                filter.questionType = questionType;
            }

            if (course) {
                if (!mongoose.isValidObjectId(course)) {
                    return res.status(400).json({ message: "Ogiltigt kurs-ID" });
                }
                filter.course = course;
            }

            if (active !== undefined) {
                filter.active = active === "true";
            }

            if (search) {
                filter.questionText = { $regex: search, $options: "i" };
            }

            const skip = (Number(page) - 1) * Number(limit);
            const questions = await Question.find(filter)
                .populate("course", "courseName courseCode")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit));

            const total = await Question.countDocuments(filter);

            res.json({
                success: true,
                questions,
                total,
                page: Number(page),
                pages: Math.ceil(total / Number(limit)),
            });
        } catch (error) {
            logger.error({ err: error }, "Error fetching questions");
            res.status(500).json({ message: "Intern servererror" });
        }
    })
);

// GET /api/question-bank/categories - Get available subjects
router.get(
    "/categories",
    isAuthenticated,
    asyncHandler(async (req, res) => {
        try {
            const subjects = [
                "Matematik",
                "Svenska",
                "Engelska",
                "Naturkunskap",
                "Samhällskunskap",
                "Histori",
                "Geografi",
                "Idrott",
                "Kemi",
                "Fysik",
                "Biologi",
                "Teknik",
                "Musik",
                "Slöjd",
                "Konst",
                "Övrig",
            ];

            res.json({
                success: true,
                subjects,
            });
        } catch (error) {
            logger.error({ err: error }, "Error fetching subject categories");
            res.status(500).json({ message: "Intern servererror" });
        }
    })
);

// GET /api/question-bank/types - Get available question types
router.get(
    "/types",
    isAuthenticated,
    asyncHandler(async (req, res) => {
        try {
            const types = [
                { value: "multipleChoice", label: "Multiple Choice" },
                { value: "trueFalse", label: "Sant/Falskt" },
                { value: "essay", label: "Essayfråga" },
                { value: "shortAnswer", label: "Kort svar" },
                { value: "matching", label: "Matchning" },
                { value: "ordering", label: "Ordning" },
            ];

            res.json({
                success: true,
                types,
            });
        } catch (error) {
            logger.error({ err: error }, "Error fetching question types");
            res.status(500).json({ message: "Intern servererror" });
        }
    })
);

// POST /api/question-bank - Create new question (staff/admin only)
router.post(
    "/",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(async (req, res) => {
        try {
            const {
                questionText,
                course,
                subject,
                questionType,
                options,
                correctAnswer,
                answerGuidelines,
                moduleNumber,
                difficulty,
            } = req.body;

            if (!questionText) {
                return res.status(400).json({ message: "Frågetext är obligatorisk" });
            }

            if (!questionType) {
                return res.status(400).json({ message: "Frågetyp är obligatorisk" });
            }

            if (!course) {
                return res.status(400).json({ message: "Kurs är obligatorisk" });
            }

            if (!mongoose.isValidObjectId(course)) {
                return res.status(400).json({ message: "Ogiltigt kurs-ID" });
            }

            const questionData = {
                questionText,
                course,
                subject: subject || "Övrig",
                questionType,
                createdBy: req.user._id,
            };

            // Add options only for supported types
            if (options && questionType !== "essay" && questionType !== "shortAnswer") {
                questionData.options = options;
            }

            // Add correct answer only for supported types
            if (correctAnswer && (questionType === "multipleChoice" || questionType === "trueFalse")) {
                questionData.correctAnswer = correctAnswer;
            }

            if (answerGuidelines) {
                questionData.answerGuidelines = answerGuidelines;
            }

            if (moduleNumber) {
                questionData.moduleNumber = moduleNumber;
            }

            if (difficulty) {
                questionData.difficulty = difficulty;
            }

            const question = new Question(questionData);
            await question.save();

            res.status(201).json({
                success: true,
                message: "Fråga skapad",
                question,
            });
        } catch (error) {
            logger.error({ err: error }, "Error creating question");
            res.status(500).json({ message: "Intern servererror" });
        }
    })
);

// GET /api/question-bank/:id - Get single question
router.get(
    "/:id",
    isAuthenticated,
    asyncHandler(async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) {
                return res.status(400).json({ message: "Ogiltigt fråge-ID" });
            }

            const question = await Question.findById(req.params.id)
                .populate("course", "courseName courseCode");

            if (!question) {
                return res.status(404).json({ message: "Fråga hittades inte" });
            }

            res.json({
                success: true,
                question,
            });
        } catch (error) {
            logger.error({ err: error }, "Error fetching question");
            res.status(500).json({ message: "Intern servererror" });
        }
    })
);

// PUT /api/question-bank/:id - Edit question (staff/admin only)
router.put(
    "/:id",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) {
                return res.status(400).json({ message: "Ogiltigt fråge-ID" });
            }

            const {
                questionText,
                subject,
                questionType,
                options,
                correctAnswer,
                answerGuidelines,
                moduleNumber,
                difficulty,
                active,
            } = req.body;

            const updateData = {};

            if (questionText !== undefined) {
                updateData.questionText = questionText;
            }

            if (subject !== undefined) {
                updateData.subject = subject;
            }

            if (questionType !== undefined) {
                updateData.questionType = questionType;
            }

            if (options !== undefined) {
                if (updateData.questionType === "multipleChoice" || updateData.questionType === "trueFalse") {
                    updateData.options = options;
                }
            }

            if (correctAnswer !== undefined) {
                if (updateData.questionType === "multipleChoice" || updateData.questionType === "trueFalse") {
                    updateData.correctAnswer = correctAnswer;
                }
            }

            if (answerGuidelines !== undefined) {
                updateData.answerGuidelines = answerGuidelines;
            }

            if (moduleNumber !== undefined) {
                updateData.moduleNumber = moduleNumber;
            }

            if (difficulty !== undefined) {
                updateData.difficulty = difficulty;
            }

            if (active !== undefined) {
                updateData.active = active;
            }

            const question = await Question.findByIdAndUpdate(req.params.id, updateData, {
                new: true,
                runValidators: true,
            });

            if (!question) {
                return res.status(404).json({ message: "Fråga hittades inte" });
            }

            res.json({
                success: true,
                message: "Fråga uppdaterad",
                question,
            });
        } catch (error) {
            logger.error({ err: error }, "Error updating question");
            res.status(500).json({ message: "Intern servererror" });
        }
    })
);

// DELETE /api/question-bank/:id - Archive question (soft delete)
router.delete(
    "/:id",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) {
                return res.status(400).json({ message: "Ogiltigt fråge-ID" });
            }

            const question = await Question.findByIdAndUpdate(
                req.params.id,
                { active: false },
                { new: true }
            );

            if (!question) {
                return res.status(404).json({ message: "Fråga hittades inte" });
            }

            res.json({
                success: true,
                message: "Fråga har tagits bort ur frågebanken",
                question,
            });
        } catch (error) {
            logger.error({ err: error }, "Error deleting question");
            res.status(500).json({ message: "Intern servererror" });
        }
    })
);

// POST /api/question-bank/generate-exam - Generate exam from question bank
router.post(
    "/generate-exam",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(async (req, res) => {
        try {
            const {
                courseId,
                subject,
                questionType,
                numberOfQuestions,
                includeInactive = false,
            } = req.body;

            if (!courseId) {
                return res.status(400).json({ message: "Kurs-ID är obligatorisk" });
            }

            if (!mongoose.isValidObjectId(courseId)) {
                return res.status(400).json({ message: "Ogiltigt kurs-ID" });
            }

            // Build filter
            const filter = { course: courseId, active: includeInactive !== false };

            if (subject && subject !== "Alla") {
                filter.subject = subject;
            }

            if (questionType) {
                filter.questionType = questionType;
            }

            // Get available questions
            const questions = await Question.find(filter)
                .sort({ difficulty: 1, createdAt: 1 });

            if (questions.length === 0) {
                return res.status(400).json({
                    message: "Inga frågor hittades med angivna filter",
                });
            }

            // If more questions available than needed, select first N
            const totalNeeded = Number(numberOfQuestions) || questions.length;
            const selectedQuestions = questions.slice(0, totalNeeded);

            // Save the generated exam attempt
            const examAttempt = new ExamAttempt({
                title: `Exam - ${courseId}`,
                courseId,
                selectedQuestions: selectedQuestions.map((q) => q._id),
                totalQuestions: questions.length,
                selectedCount: selectedQuestions.length,
                generatedBy: req.user._id,
                status: "generated",
            });

            await examAttempt.save();

            res.json({
                success: true,
                message: "Exam genererad ur frågebank",
                courseId,
                subject,
                questionType,
                totalAvailable: questions.length,
                selectedCount: selectedQuestions.length,
                questions: selectedQuestions,
                examAttemptId: examAttempt._id,
            });
        } catch (error) {
            logger.error({ err: error }, "Error generating exam");
            res.status(500).json({ message: "Intern servererror" });
        }
    })
);

// GET /api/question-bank/exam-attempts - Fetch generated exam attempts
router.get(
    "/exam-attempts",
    isAuthenticated,
    asyncHandler(async (req, res) => {
        try {
            const examAttempts = await ExamAttempt.find()
                .sort({ createdAt: -1 })
                .limit(20);

            res.json({
                success: true,
                examAttempts,
            });
        } catch (error) {
            logger.error({ err: error }, "Error fetching exam attempts");
            res.status(500).json({ message: "Intern servererror" });
        }
    })
);

export default router;
