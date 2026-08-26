import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
    {
        questionText: {
            type: String,
            required: true,
            trim: true,
        },

        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: true,
        },

        subject: {
            type: String,
            enum: [
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
            ],
            default: "Övrig",
        },

        questionType: {
            type: String,
            required: true,
            enum: [
                "multipleChoice",
                "trueFalse",
                "essay",
                "shortAnswer",
                "matching",
                "ordering",
            ],
        },

        // For multiple choice and true/false questions
        options: {
            type: [String],
            validate: {
                validator: function (options) {
                    if (!options || options.length === 0) return true;
                    return this.questionType !== "essay" && this.questionType !== "shortAnswer";
                },
                message: "Options are only supported for multipleChoice and trueFalse question types",
            },
        },

        // The correct answer
        correctAnswer: {
            type: String,
            required: function () {
                // Required for multipleChoice, trueFalse; optional for essay/shortAnswer
                return this.questionType === "multipleChoice" || this.questionType === "trueFalse";
            },
        },

        // For essay/short answer: guidelines for what constitutes a good answer
        answerGuidelines: {
            type: String,
            default: "",
        },

        // Metadata
        moduleNumber: {
            type: Number,
            min: 1,
            max: 5,
            description: "Which module this question belongs to (1-5)",
        },

        difficulty: {
            type: String,
            enum: ["easy", "medium", "hard"],
            default: "medium",
        },

        // Active/inactive status - inactive questions are not shown in generation but kept for history
        active: {
            type: Boolean,
            default: true,
        },

        // Creator
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // Timestamps
    },
    { timestamps: true }
);

// Index for searching by course and active status
questionSchema.index({ course: 1, active: 1, questionType: 1 });
questionSchema.index({ subject: 1, active: 1 });

export default mongoose.model("Question", questionSchema, "questions");
