import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { GridFSBucket } from "mongodb";
import { Readable } from "stream";
import Question from "../models/Question.js";
import ExamAttempt from "../models/ExamAttempt.js";
import QuestionBankPdf from "../models/QuestionBankPdf.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";
import logger from "../utils/logger.js";

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
            const filter = { course: courseId };
            if (!includeInactive) {
                filter.active = true;
            }

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
                generatedBy: req.user.userId || req.user._id,
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

// PUT /api/question-bank/exam-attempts/:id/questions - Attach selected questions to an exam attempt
router.put(
    "/exam-attempts/:id/questions",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) {
                return res.status(400).json({ message: "Ogiltigt exam-ID" });
            }
            const { questionIds } = req.body;
            if (!Array.isArray(questionIds)) {
                return res.status(400).json({ message: "questionIds måste vara en array" });
            }

            const validIds = questionIds.filter((id) => mongoose.isValidObjectId(id));
            const examAttempt = await ExamAttempt.findByIdAndUpdate(
                req.params.id,
                {
                    selectedQuestions: validIds,
                    selectedCount: validIds.length,
                },
                { new: true }
            );

            if (!examAttempt) {
                return res.status(404).json({ message: "Exam hittades inte" });
            }

            res.json({ success: true, examAttempt });
        } catch (error) {
            logger.error({ err: error }, "Error updating exam questions");
            res.status(500).json({ message: "Intern servererror" });
        }
    })
);

// GET /api/question-bank/by-course/:courseId - List questions for a specific course
router.get(
    "/by-course/:courseId",
    isAuthenticated,
    asyncHandler(async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.courseId)) {
                return res.status(400).json({ message: "Ogiltigt kurs-ID" });
            }
            const { subject, questionType } = req.query;
            const filter = { course: req.params.courseId, active: true };
            if (subject && subject !== "Alla") filter.subject = subject;
            if (questionType && questionType !== "Alla") filter.questionType = questionType;

            const questions = await Question.find(filter)
                .populate("course", "courseName courseCode")
                .sort({ subject: 1, difficulty: 1, createdAt: -1 });

            res.json({ success: true, questions });
        } catch (error) {
            logger.error({ err: error }, "Error fetching questions by course");
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
                createdBy: req.user.userId || req.user._id,
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

// --- Question Bank PDF endpoints ---

const pdfUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === "application/pdf") {
            cb(null, true);
        } else {
            cb(new Error("Endast PDF-filer är tillåtna"));
        }
    },
});

function handlePdfMulterError(err, _req, res, next) {
    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ message: "Filen är för stor. Maxstorlek är 10 MB." });
        }
        return res.status(400).json({ message: `Uppladdningsfel: ${err.message}` });
    }
    if (err) {
        return res.status(400).json({ message: err.message || "Uppladdningsfel" });
    }
    next();
}

// POST /api/question-bank/pdfs - Upload question and/or answer PDFs for a course
router.post(
    "/pdfs",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    pdfUpload.fields([
        { name: "questionPdf", maxCount: 1 },
        { name: "answerPdf", maxCount: 1 },
    ]),
    handlePdfMulterError,
    asyncHandler(async (req, res) => {
        try {
            const { course } = req.body;
            if (!course || !mongoose.Types.ObjectId.isValid(course)) {
                return res.status(400).json({ message: "Kurs krävs" });
            }

            const db = mongoose.connection.db;
            if (!db) {
                return res.status(500).json({ message: "Databasen inte ansluten" });
            }
            const bucket = new GridFSBucket(db, { bucketName: "fs" });

            const files = req.files;
            if (!files?.questionPdf?.[0] && !files?.answerPdf?.[0]) {
                return res.status(400).json({ message: "Inga filer uppladdade" });
            }

            const record =
                (await QuestionBankPdf.findOne({ course })) ||
                new QuestionBankPdf({ course, uploadedBy: req.user.userId || req.user._id });

            const uploadToGridFS = (file) =>
                new Promise((resolve, reject) => {
                    const stream = Readable.from(file.buffer);
                    const uploadStream = bucket.openUploadStream(
                        file.originalname,
                        {
                            contentType: file.mimetype,
                            metadata: {
                                uploadedBy: req.user.userId || req.user._id,
                                purpose: "questionBank",
                                course,
                            },
                        }
                    );
                    stream.pipe(uploadStream);
                    uploadStream.on("error", (err) => {
                        logger.error({ err }, "GridFS upload stream error");
                        reject(err);
                    });
                    uploadStream.on("finish", () =>
                        resolve({ id: uploadStream.id, name: file.originalname })
                    );
                });

            if (files.questionPdf?.[0]) {
                const old = record.questionPdfFileId;
                const result = await uploadToGridFS(files.questionPdf[0]);
                record.questionPdfFileId = result.id;
                record.questionPdfName = result.name;
                if (old) {
                    await bucket.delete(old).catch(() => {});
                }
            }

            if (files.answerPdf?.[0]) {
                const old = record.answerPdfFileId;
                const result = await uploadToGridFS(files.answerPdf[0]);
                record.answerPdfFileId = result.id;
                record.answerPdfName = result.name;
                if (old) {
                    await bucket.delete(old).catch(() => {});
                }
            }

            record.uploadedBy = req.user.userId || req.user._id;
            await record.save();

            res.json({
                success: true,
                questionPdfName: record.questionPdfName,
                answerPdfName: record.answerPdfName,
            });
        } catch (error) {
            logger.error({ err: error, message: error.message, stack: error.stack }, "Error uploading question bank PDFs");
            res.status(500).json({ message: error.message || "Intern servererror" });
        }
    })
);

// GET /api/question-bank/pdfs - Get PDF metadata for a course
router.get(
    "/pdfs",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(async (req, res) => {
        try {
            const { course } = req.query;
            if (!course) {
                return res.status(400).json({ message: "Kurs krävs" });
            }
            const record = await QuestionBankPdf.findOne({ course });
            res.json({
                questionPdfName: record?.questionPdfName || null,
                answerPdfName: record?.answerPdfName || null,
                questionPdfFileId: record?.questionPdfFileId || null,
                answerPdfFileId: record?.answerPdfFileId || null,
                updatedAt: record?.updatedAt || null,
            });
        } catch (error) {
            logger.error({ err: error }, "Error fetching question bank PDFs");
            res.status(500).json({ message: "Intern servererror" });
        }
    })
);

// GET /api/question-bank/pdfs/:type/download - Download a PDF (type = question | answer)
router.get(
    "/pdfs/:type/download",
    isAuthenticated,
    asyncHandler(async (req, res) => {
        try {
            const { type } = req.params;
            const { course } = req.query;
            if (type !== "question" && type !== "answer") {
                return res.status(400).json({ message: "Ogiltig filtyp" });
            }
            if (!course) {
                return res.status(400).json({ message: "Kurs krävs" });
            }

            const record = await QuestionBankPdf.findOne({ course });
            if (!record) {
                return res.status(404).json({ message: "Inga PDF-filer uppladdade" });
            }

            const fileId =
                type === "question"
                    ? record.questionPdfFileId
                    : record.answerPdfFileId;
            const fileName =
                type === "question"
                    ? record.questionPdfName
                    : record.answerPdfName;

            if (!fileId) {
                return res.status(404).json({ message: "Filen hittades inte" });
            }

            const db = mongoose.connection.db;
            const bucket = new GridFSBucket(db, { bucketName: "fs" });
            const file = await db
                .collection("fs.files")
                .findOne({ _id: new mongoose.Types.ObjectId(fileId) });

            if (!file) {
                return res.status(404).json({ message: "Filen hittades inte i databasen" });
            }

            res.setHeader("Content-Type", file.contentType || "application/pdf");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
            );
            res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

            bucket.openDownloadStream(file._id).pipe(res);
        } catch (error) {
            logger.error({ err: error }, "Error downloading question bank PDF");
            res.status(500).json({ message: "Intern servererror" });
        }
    })
);

// DELETE /api/question-bank/pdfs/:type - Delete a PDF (type = question | answer | both)
router.delete(
    "/pdfs/:type",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(async (req, res) => {
        try {
            const { type } = req.params;
            const { course } = req.query;
            if (!course || !mongoose.Types.ObjectId.isValid(course)) {
                return res.status(400).json({ message: "Kurs krävs" });
            }

            const record = await QuestionBankPdf.findOne({ course });
            if (!record) {
                return res.status(404).json({ message: "Inga PDF-filer hittades" });
            }

            const db = mongoose.connection.db;
            const bucket = new GridFSBucket(db, { bucketName: "fs" });

            if (type === "question" || type === "both") {
                if (record.questionPdfFileId) {
                    await bucket.delete(new mongoose.Types.ObjectId(record.questionPdfFileId)).catch(() => {});
                    record.questionPdfFileId = undefined;
                    record.questionPdfName = undefined;
                }
            }
            if (type === "answer" || type === "both") {
                if (record.answerPdfFileId) {
                    await bucket.delete(new mongoose.Types.ObjectId(record.answerPdfFileId)).catch(() => {});
                    record.answerPdfFileId = undefined;
                    record.answerPdfName = undefined;
                }
            }

            if (!record.questionPdfFileId && !record.answerPdfFileId) {
                await QuestionBankPdf.deleteOne({ _id: record._id });
            } else {
                await record.save();
            }

            res.json({ success: true, message: "PDF borttagen" });
        } catch (error) {
            logger.error({ err: error }, "Error deleting question bank PDF");
            res.status(500).json({ message: "Intern servererror" });
        }
    })
);

// --- Student-facing endpoints ---

// GET /api/question-bank/student/courses - Get student's enrolled courses with questions + PDFs
router.get(
    "/student/courses",
    isAuthenticated,
    asyncHandler(async (req, res) => {
        try {
            const user = req.user;
            const userRoles = user.roles || (user.role ? [user.role] : []);
            const isStudent = userRoles.includes("student");

            if (!isStudent) {
                return res.status(403).json({ message: "Åtkast nekad" });
            }

            const Student = mongoose.model("Student");
            const student = await Student.findOne({ email: user.email });
            if (!student) {
                return res.status(404).json({ message: "Elev hittades inte" });
            }

            const enrollments = await StudentEnrollment.find({
                studentId: student._id,
                status: { $in: ["enrolled", "active"] },
            })
                .populate("mainCourseId", "courseName courseCode")
                .lean();

            const courseIds = enrollments
                .map((e) => e.mainCourseId?._id)
                .filter(Boolean);

            const questions = await Question.find({
                course: { $in: courseIds },
                active: true,
            })
                .sort({ subject: 1, difficulty: 1, createdAt: -1 })
                .lean();

            const pdfs = await QuestionBankPdf.find({
                course: { $in: courseIds },
            }).lean();

            const pdfMap = {};
            for (const pdf of pdfs) {
                const cId = pdf.course.toString();
                pdfMap[cId] = {
                    questionPdfName: pdf.questionPdfName,
                    answerPdfName: pdf.answerPdfName,
                    questionPdfFileId: pdf.questionPdfFileId,
                    answerPdfFileId: pdf.answerPdfFileId,
                };
            }

            const courses = enrollments.map((enrollment) => {
                const cId = enrollment.mainCourseId?._id?.toString();
                return {
                    course: enrollment.mainCourseId,
                    enrollment: {
                        status: enrollment.status,
                        startDate: enrollment.startDate,
                        endDate: enrollment.endDate,
                    },
                    questions: questions.filter((q) => q.course?.toString() === cId),
                    pdfs: pdfMap[cId] || null,
                };
            });

            res.json({ courses });
        } catch (error) {
            logger.error({ err: error }, "Error fetching student question bank");
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

export default router;
