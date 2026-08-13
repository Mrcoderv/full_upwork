import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { validateParticipants, sendEmailCopyOfMessage } from "../services/messagingService.js";
import logger from "../utils/logger.js";

// Resolve the authenticated user's id across the shapes the app produces:
// req.userId / req.user.userId (JWT, set by authenticateUser) or req.user._id
// (plain-object mocks and legacy flows).
const getCurrentUserId = (req) => req.userId || req.user?.userId || req.user?._id || req.user?.id;

/**
 * Get all conversations for the authenticated user.
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

    // For each conversation, find if there are unread messages for this user
    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await Message.countDocuments({
          conversationId: conv._id,
          senderId: { $ne: userId },
          "readBy.userId": { $ne: userId },
        });
        
        const lastMessage = await Message.findOne({ conversationId: conv._id })
          .sort({ createdAt: -1 })
          .select("body createdAt senderId");

        return {
          ...conv.toObject(),
          unreadCount,
          lastMessage,
        };
      })
    );

    res.json(conversationsWithUnread);
  } catch (error) {
    logger.error({ err: error }, "Error fetching conversations");
    res.status(500).json({ message: "Internt serverfel vid hämtning av konversationer" });
  }
};

/**
 * Get messages for a specific conversation.
 */
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

    const messages = await Message.find({ conversationId })
      .populate("senderId", "name email roles")
      .sort({ createdAt: 1 });

    res.json(messages);
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

    // Trigger Part B stub for recipients
    const recipients = await User.find({
      _id: { $in: conversation.participants, $ne: senderId },
    });

    for (const recipient of recipients) {
      await sendEmailCopyOfMessage(newMessage, recipient, {
        senderName: req.user?.name,
      });
    }

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

    const recipients = await User.find(query).select("name email roles").sort({ name: 1 });
    res.json(recipients);
  } catch (error) {
    logger.error({ err: error }, "Error fetching recipients");
    res.status(500).json({ message: "Internt serverfel vid hämtning av mottagare" });
  }
};

