import mongoose from "mongoose";

const questionBankPdfSchema = new mongoose.Schema(
    {
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: true,
        },
        questionPdfFileId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        questionPdfName: {
            type: String,
            default: null,
        },
        answerPdfFileId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        answerPdfName: {
            type: String,
            default: null,
        },
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

questionBankPdfSchema.index({ course: 1 }, { unique: true });

export default mongoose.model(
    "QuestionBankPdf",
    questionBankPdfSchema,
    "question_bank_pdfs"
);
