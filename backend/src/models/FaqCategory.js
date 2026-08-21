import mongoose from "mongoose";

const faqCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
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
  },
  { timestamps: true }
);

// Unique case-insensitive category names (collation-strength 2) and fast
// lookups for the student chatbot (status + displayOrder sorting).
faqCategorySchema.index(
  { name: 1 },
  { unique: true, collation: { locale: "sv", strength: 2 } }
);
faqCategorySchema.index({ status: 1, displayOrder: 1, name: 1 });

export default mongoose.model("FaqCategory", faqCategorySchema, "faqcategories");
