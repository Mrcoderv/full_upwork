import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
    },
    subject: {
      type: String,
      trim: true,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index for performance
conversationSchema.index({ participants: 1 });
conversationSchema.index({ studentId: 1 });
conversationSchema.index({ lastMessageAt: -1 });
// Main inbox query: a user's conversations, newest first.
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

export default mongoose.model("Conversation", conversationSchema, "conversations");
