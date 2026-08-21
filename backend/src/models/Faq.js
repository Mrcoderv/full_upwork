import mongoose from "mongoose";

const MAX_KEYWORDS = 30;
const MAX_ALTERNATE_QUESTIONS = 20;

const faqSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FaqCategory",
      required: true,
    },
    question: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 500,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 5000,
    },
    // Short matching hints, e.g. "betala", "avgift", "faktura"
    keywords: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => v.length <= MAX_KEYWORDS,
        message: `Max ${MAX_KEYWORDS} nyckelord är tillåtna.`,
      },
    },
    // Alternative phrasings of the same question
    alternateQuestions: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => v.length <= MAX_ALTERNATE_QUESTIONS,
        message: `Max ${MAX_ALTERNATE_QUESTIONS} alternativa frågor är tillåtna.`,
      },
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    displayOrder: {
      type: Number,
      default: 0,
      min: 0,
      max: 10000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // Soft delete (same pattern as student comments)
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Chatbot listing per category and admin filtering
faqSchema.index({ categoryId: 1, isDeleted: 1, status: 1, displayOrder: 1 });
// Free-text lookup from the chatbot ask flow (question + alternates + keywords)
faqSchema.index({ question: "text", alternateQuestions: "text", keywords: "text" });
faqSchema.index({ createdBy: 1, updatedAt: -1 });

export const FAQ_LIMITS = { MAX_KEYWORDS, MAX_ALTERNATE_QUESTIONS };

export default mongoose.model("Faq", faqSchema, "faqs");
