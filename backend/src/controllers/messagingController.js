import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { validateParticipants, dispatchMessageEmailCopies } from "../services/messagingService.js";
import logger from "../utils/logger.js";

// Resolve the authenticated user's id across the shapes the app produces:
// req.userId / req.user.userId (JWT, set by authenticateUser) or req.user._id
// (plain-object mocks and legacy flows).
const getCurrentUserId = (req) => req.userId || req.user?.userId || req.user?._id || req.user?.id;

// Aggregation pipelines do NOT schema-cast query values, so a string userId
// must be converted to an ObjectId before matching against _id/readBy.userId.
const toObjectId = (value) =>
  typeof value === "string" && mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(value)
    : value;

/**
 * Get all conversations for the authenticated user.
 *
 * Unread counts and newest-message previews are loaded with two batched
 * aggregations instead of a per-conversation query pair, so the endpoint stays
 * O(1) in the number of conversations (important at ~1000+ users).
 */
export const getConversations = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);

    const conversations = await Conversation.find({
      participants: userId,
    })
      .populate("participants", "name email roles")
      .populate("studentId", "name personalNumber")
      .sort({ lastMessageAt: -1 });

    if (conversations.length === 0) {
      return res.json([]);
    }

    const conversationIds = conversations.map((c) => c._id);
    const userIdObjectId = toObjectId(userId);

    // One batched query: unread count per conversation.
    const unreadRows = await Message.aggregate([
      {
        $match: {
          conversationId: { $in: conversationIds },
          senderId: { $ne: userIdObjectId },
          "readBy.userId": { $ne: userIdObjectId },
        },
      },
      { $group: { _id: "$conversationId", count: { $sum: 1 } } },
    ]);

    // One batched query: the newest message per conversation.
    const lastRows = await Message.aggregate([
      { $match: { conversationId: { $in: conversationIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$conversationId",
          body: { $first: "$body" },
          createdAt: { $first: "$createdAt" },
          senderId: { $first: "$senderId" },
        },
      },
    ]);

    const unreadByConv = new Map(unreadRows.map((r) => [String(r._id), r.count]));
    const lastByConv = new Map(lastRows.map((r) => [String(r._id), r]));

    const conversationsWithUnread = conversations.map((conv) => ({
      ...conv.toObject(),
      unreadCount: unreadByConv.get(String(conv._id)) || 0,
      lastMessage: lastByConv.get(String(conv._id)) || null,
    }));

    res.json(conversationsWithUnread);
  } catch (error) {
    logger.error({ err: error }, "Error fetching conversations");
    res.status(500).json({ message: "Internt serverfel vid hämtning av konversationer" });
  }
};

/**
 * Get messages for a specific conversation.
 *
 * Keyset-paginated: pass ?before=<oldest loaded message _id> and ?limit=N to
 * page backwards through long threads. Without any params the newest
 * DEFAULT_MESSAGE_PAGE_SIZE messages are returned (the full-thread behavior is
 * removed so a huge thread can never be loaded into memory unboundedly).
 */
const DEFAULT_MESSAGE_PAGE_SIZE = 50;
const MAX_MESSAGE_PAGE_SIZE = 200;

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = getCurrentUserId(req);

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });

    if (!conversation) {
      return res.status(404).json({ message: "Konversationen hittades inte eller så har du inte tillgång till den" });
    }

    const limit = Math.min(
      parseInt(req.query.limit, 10) || DEFAULT_MESSAGE_PAGE_SIZE,
      MAX_MESSAGE_PAGE_SIZE
    );
    const before = req.query.before || null;

    const query = { conversationId };
    if (before) {
      const cursorMessage = await Message.findById(before).select("_id");
      if (!cursorMessage) {
        return res.status(400).json({ message: "Ogiltig markör för meddelandehämtning" });
      }
      query._id = { $lt: cursorMessage._id };
    }

    // Fetch limit+1 so we can report whether older messages exist.
    const page = await Message.find(query)
      .populate("senderId", "name email roles")
      .sort({ _id: -1 })
      .limit(limit + 1);

    const hasMore = page.length > limit;
    const slice = page.slice(0, limit).reverse();

    res.json({
      messages: slice,
      hasMore,
      nextBefore: hasMore && slice.length > 0 ? String(slice[0]._id) : null,
    });
  } catch (error) {
    logger.error({ err: error, conversationId: req.params.conversationId }, "Error fetching messages");
    res.status(500).json({ message: "Internt serverfel vid hämtning av meddelanden" });
  }
};

/**
 * Send a message. Creates a conversation if one doesn't exist.
 */
export const sendMessage = async (req, res) => {
  try {
    const { participantIds, body, studentId, subject, conversationId } = req.body;
    const senderId = getCurrentUserId(req);

    if (!body || body.trim() === "") {
      return res.status(400).json({ message: "Meddelandetexten får inte vara tom" });
    }

    let conversation;

    if (conversationId) {
      // Send to existing conversation
      conversation = await Conversation.findOne({
        _id: conversationId,
        participants: senderId,
      });

      if (!conversation) {
        return res.status(404).json({ message: "Konversationen hittades inte eller så har du inte tillgång till den" });
      }
    } else {
      // Create new conversation
      if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
        return res.status(400).json({ message: "Deltagare måste anges" });
      }

      // Ensure sender is included in participants
      const allParticipantIds = [...new Set([...participantIds, senderId.toString()])];

      // Validate participants (RBAC)
      const isValid = await validateParticipants(req.user, allParticipantIds);
      if (!isValid) {
        return res.status(403).json({ message: "Du har inte behörighet att starta en konversation med dessa deltagare" });
      }

      // Check if conversation already exists between these EXACT participants (ignoring studentId/subject for now)
      // Actually, let's just create a new one if it's a new thread.
      conversation = new Conversation({
        participants: allParticipantIds,
        studentId: studentId || null,
        subject: subject || "Inget ämne",
      });
      await conversation.save();
    }

    const newMessage = new Message({
      conversationId: conversation._id,
      senderId,
      body,
      readBy: [{ userId: senderId, readAt: new Date() }],
    });

    await newMessage.save();

    // Update conversation's lastMessageAt
    conversation.lastMessageAt = new Date();
    await conversation.save();

    // Email copies to student recipients (best-effort; never blocks the
    // in-platform message from being saved).
    await dispatchMessageEmailCopies({
      message: newMessage,
      conversation,
      senderName: req.user?.name,
    });

    res.status(201).json(newMessage);
  } catch (error) {
    logger.error({ err: error }, "Error sending message");
    res.status(500).json({ message: "Internt serverfel vid sändning av meddelande" });
  }
};

/**
 * Mark messages in a conversation as read.
 */
export const markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = getCurrentUserId(req);

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    });

    if (!conversation) {
      return res.status(404).json({ message: "Konversationen hittades inte" });
    }

    // Update all messages in this conversation where this user is NOT the sender and hasn't read it yet
    await Message.updateMany(
      {
        conversationId,
        senderId: { $ne: userId },
        "readBy.userId": { $ne: userId },
      },
      {
        $push: { readBy: { userId, readAt: new Date() } },
      }
    );

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error, conversationId: req.params.conversationId }, "Error marking messages as read");
    res.status(500).json({ message: "Internt serverfel" });
  }
};

/**
 * Get total unread message count for the authenticated user.
 */
export const getUnreadCount = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);

    // Find all conversations the user is part of
    const conversations = await Conversation.find({ participants: userId }).select("_id");
    const conversationIds = conversations.map(c => c._id);

    const unreadCount = await Message.countDocuments({
      conversationId: { $in: conversationIds },
      senderId: { $ne: userId },
      "readBy.userId": { $ne: userId },
    });

    res.json({ unreadCount });
  } catch (error) {
    logger.error({ err: error }, "Error getting unread count");
    res.status(500).json({ message: "Internt serverfel" });
  }
};

/**
 * Get available recipients for the authenticated user based on RBAC rules.
 * Accepts an optional ?search= term that filters server-side by name/email so
 * the dropdown stays responsive at ~1000+ users.
 */
export const getRecipients = async (req, res) => {
  try {
    const user = req.user;
    const userRole = user.role || (user.roles && user.roles[0]);
    const staffRoles = ["admin", "systemadmin", "teacher", "syv", "specped", "coordinator"];

    let query = { _id: { $ne: user._id } };

    if (staffRoles.includes(userRole)) {
      // Staff can message staff or students
      query.roles = { $in: [...staffRoles, "student"] };
    } else if (userRole === "student") {
      // Students can only message staff
      query.roles = { $in: staffRoles };
    } else {
      query.roles = { $in: staffRoles };
    }

    const search = (req.query?.search || "").trim();
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const recipients = await User.find(query).select("name email roles").sort({ name: 1 });
    res.json(recipients);
  } catch (error) {
    logger.error({ err: error }, "Error fetching recipients");
    res.status(500).json({ message: "Internt serverfel vid hämtning av mottagare" });
  }
};

