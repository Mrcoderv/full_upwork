import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

// Index for performance
messageSchema.index({ conversationId: 1, createdAt: 1 });
// Unread-count filter (conversation + not-sender) and per-conversation history.
messageSchema.index({ conversationId: 1, senderId: 1 });
// Keyset pagination on the message thread (sort by _id descending).
messageSchema.index({ conversationId: 1, _id: -1 });
// Per-sender message history (used by inbox unread summaries).
messageSchema.index({ senderId: 1, _id: -1 });

export default mongoose.model("Message", messageSchema, "messages");
