import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

vi.mock("../../src/models/Conversation.js", () => {
  const ConversationMock = vi.fn(function (doc = {}) {
    Object.assign(this, doc);
    this._id = this._id || new mongoose.Types.ObjectId();
    this.save = vi.fn().mockResolvedValue(this);
  });

  Object.assign(ConversationMock, {
    find: vi.fn(),
    findOne: vi.fn(),
  });

  return {
    __esModule: true,
    default: ConversationMock,
  };
});

vi.mock("../../src/models/Message.js", () => {
  const MessageMock = vi.fn(function (doc = {}) {
    Object.assign(this, doc);
    this._id = this._id || new mongoose.Types.ObjectId();
    this.save = vi.fn().mockResolvedValue(this);
  });

  Object.assign(MessageMock, {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
    updateMany: vi.fn(),
  });

  return {
    __esModule: true,
    default: MessageMock,
  };
});

vi.mock("../../src/models/User.js", () => {
  return {
    __esModule: true,
    default: {
      find: vi.fn(),
      findById: vi.fn(),
      findOne: vi.fn(),
    },
  };
});
vi.mock("../../src/services/emailService.js", () => ({
  __esModule: true,
  sendEmail: vi.fn(),
  renderMessageCopyEmail: vi.fn(
    ({ senderName, messageBody, subject }) => ({
      subject:
        subject || `Meddelande från ${senderName || "Mindful Learning"}`,
      text: `${senderName || "Mindful"}: ${messageBody}`,
    })
  ),
}));

import Conversation from "../../src/models/Conversation.js";
import Message from "../../src/models/Message.js";
import User from "../../src/models/User.js";
import {
  getConversations,
  getMessages,
  sendMessage,
  markAsRead,
  getUnreadCount,
  getRecipients,
} from "../../src/controllers/messagingController.js";
import { canMessage, dispatchMessageEmailCopies, sendEmailCopyOfMessage } from "../../src/services/messagingService.js";
import { sendEmail, renderMessageCopyEmail } from "../../src/services/emailService.js";

const createRes = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
};

describe("Messaging Service & Controller", () => {
  const staffUserId = new mongoose.Types.ObjectId();
  const staffUser = {
    _id: staffUserId,
    name: "Anna Lärare",
    email: "anna@skola.se",
    roles: ["teacher"],
    role: "teacher",
  };

  const studentUserId = new mongoose.Types.ObjectId();
  const studentUser = {
    _id: studentUserId,
    name: "Erik Elev",
    email: "erik@elev.se",
    roles: ["student"],
    role: "student",
  };

  const otherStudentId = new mongoose.Types.ObjectId();
  const otherStudent = {
    _id: otherStudentId,
    name: "Lisa Elev",
    email: "lisa@elev.se",
    roles: ["student"],
    role: "student",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("messagingService.canMessage", () => {
    it("allows staff to message staff", async () => {
      const allowed = await canMessage(staffUser, { roles: ["admin"], role: "admin" });
      expect(allowed).toBe(true);
    });

    it("allows staff to message student", async () => {
      const allowed = await canMessage(staffUser, studentUser);
      expect(allowed).toBe(true);
    });

    it("allows student to message staff", async () => {
      const allowed = await canMessage(studentUser, staffUser);
      expect(allowed).toBe(true);
    });

    it("disallows student to message another student", async () => {
      const allowed = await canMessage(studentUser, otherStudent);
      expect(allowed).toBe(false);
    });
  });

  describe("messagingService.sendEmailCopyOfMessage (Part B)", () => {
    it("sends an email copy via the real email service for a student recipient with an email", async () => {
      sendEmail.mockResolvedValue({ success: true });
      const dummyMsg = {
        _id: new mongoose.Types.ObjectId(),
        body: "Kom ihåg inlämningen!",
        conversationSubject: "Inlämning",
      };

      await sendEmailCopyOfMessage(dummyMsg, studentUser, {
        senderName: "Anna Lärare",
      });

      expect(renderMessageCopyEmail).toHaveBeenCalledWith({
        senderName: "Anna Lärare",
        messageBody: "Kom ihåg inlämningen!",
        subject: "Inlämning",
      });
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "erik@elev.se",
          subject: "Inlämning",
          text: "Anna Lärare: Kom ihåg inlämningen!",
        })
      );
    });

    it("skips sending when the student recipient has no email address", async () => {
      const noEmailStudent = { ...studentUser, email: undefined };

      await sendEmailCopyOfMessage(
        { _id: new mongoose.Types.ObjectId(), body: "Hej" },
        noEmailStudent,
        { senderName: "Anna Lärare" }
      );

      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("does not send email copies for non-student recipients", async () => {
      const adminUser = {
        _id: new mongoose.Types.ObjectId(),
        name: "Admin",
        email: "admin@mindful.se",
        roles: ["admin"],
        role: "admin",
      };

      await sendEmailCopyOfMessage(
        { _id: new mongoose.Types.ObjectId(), body: "Hej" },
        adminUser,
        { senderName: "Anna Lärare" }
      );

      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("messagingService.dispatchMessageEmailCopies", () => {
    const makeMessage = () => ({
      _id: new mongoose.Types.ObjectId(),
      senderId: staffUserId,
      body: "Kom ihåg inlämningen!",
    });
    const makeConversation = () => ({
      _id: new mongoose.Types.ObjectId(),
      participants: [studentUserId, staffUserId],
      subject: "Inlämning",
    });

    it("sends an email copy to every student participant except the sender", async () => {
      User.find.mockResolvedValue([studentUser, otherStudent]);

      const result = await dispatchMessageEmailCopies({
        message: makeMessage(),
        conversation: makeConversation(),
        senderName: "Anna Lärare",
      });

      expect(User.find).toHaveBeenCalledWith({
        _id: { $in: [studentUserId, staffUserId], $ne: staffUserId },
      });
      expect(sendEmail).toHaveBeenCalledTimes(2);
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "erik@elev.se" })
      );
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "lisa@elev.se" })
      );
      expect(result).toEqual({ attempted: 2, succeeded: 2 });
    });

    it("propagates the conversation subject into the rendered email copy", async () => {
      User.find.mockResolvedValue([studentUser]);

      await dispatchMessageEmailCopies({
        message: makeMessage(),
        conversation: makeConversation(),
        senderName: "Anna Lärare",
      });

      expect(renderMessageCopyEmail).toHaveBeenCalledWith({
        senderName: "Anna Lärare",
        messageBody: "Kom ihåg inlämningen!",
        subject: "Inlämning",
      });
    });

    it("resolves normally (best-effort) when a single recipient send fails", async () => {
      User.find.mockResolvedValue([studentUser, otherStudent]);
      sendEmail.mockRejectedValueOnce(new Error("SMTP down"));

      const result = await dispatchMessageEmailCopies({
        message: makeMessage(),
        conversation: makeConversation(),
        senderName: "Anna Lärare",
      });

      expect(result).toEqual({ attempted: 2, succeeded: 1 });
      expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    it("resolves normally (best-effort) when the recipient lookup fails", async () => {
      User.find.mockRejectedValue(new Error("db down"));

      const result = await dispatchMessageEmailCopies({
        message: makeMessage(),
        conversation: makeConversation(),
        senderName: "Anna Lärare",
      });

      expect(result).toEqual({ attempted: 0, succeeded: 0 });
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("getConversations", () => {
    it("returns user conversations with unread count", async () => {
      const convId = new mongoose.Types.ObjectId();
      const mockConv = {
        _id: convId,
        participants: [staffUserId, studentUserId],
        toObject: () => ({ _id: convId }),
      };

      const findQuery = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockResolvedValue([mockConv]),
      };
      Conversation.find.mockReturnValue(findQuery);
      Message.aggregate
        .mockResolvedValueOnce([{ _id: convId, count: 2 }])
        .mockResolvedValueOnce([{ _id: convId, body: "Hej", createdAt: new Date() }]);

      const req = { user: staffUser };
      const res = createRes();

      await getConversations(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            _id: convId,
            unreadCount: 2,
            lastMessage: expect.objectContaining({ body: "Hej" }),
          }),
        ])
      );
    });

    it("returns an empty list when the user has no conversations", async () => {
      const findQuery = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockResolvedValue([]),
      };
      Conversation.find.mockReturnValue(findQuery);

      const req = { user: staffUser };
      const res = createRes();

      await getConversations(req, res);

      expect(res.json).toHaveBeenCalledWith([]);
      expect(Message.aggregate).not.toHaveBeenCalled();
    });
  });

  describe("getMessages", () => {
    const convId = new mongoose.Types.ObjectId();

    const messageDoc = (id, body) => ({
      _id: id,
      body,
      senderId: staffUserId,
      createdAt: new Date(),
    });

    it("returns the first page of messages ascending with pagination metadata", async () => {
      Conversation.findOne.mockResolvedValue({ _id: convId, participants: [staffUserId] });
      const newestId = new mongoose.Types.ObjectId();
      const pageQuery = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([messageDoc(newestId, "Nyare"), messageDoc(convId, "Äldre")]),
      };
      Message.find.mockReturnValue(pageQuery);

      const req = { user: staffUser, params: { conversationId: convId.toString() }, query: {} };
      const res = createRes();

      await getMessages(req, res);

      expect(res.json).toHaveBeenCalledWith({
        messages: [
          expect.objectContaining({ body: "Äldre" }),
          expect.objectContaining({ body: "Nyare" }),
        ],
        hasMore: false,
        nextBefore: null,
      });
    });

    it("supports keyset pagination via ?before", async () => {
      Conversation.findOne.mockResolvedValue({ _id: convId, participants: [staffUserId] });
      Message.findById.mockReturnValue({
        select: vi.fn().mockResolvedValue({ _id: convId }),
      });
      const oldestId = new mongoose.Types.ObjectId();
      const pageQuery = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([messageDoc(oldestId, "Äldst")]),
      };
      Message.find.mockReturnValue(pageQuery);

      const req = {
        user: staffUser,
        params: { conversationId: convId.toString() },
        query: { before: convId.toString(), limit: "50" },
      };
      const res = createRes();

      await getMessages(req, res);

      expect(Message.findById).toHaveBeenCalledWith(convId.toString());
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          hasMore: false,
          nextBefore: null,
        })
      );
    });

    it("returns 400 when the cursor message does not exist", async () => {
      Conversation.findOne.mockResolvedValue({ _id: convId, participants: [staffUserId] });
      Message.findById.mockReturnValue({
        select: vi.fn().mockResolvedValue(null),
      });

      const req = {
        user: staffUser,
        params: { conversationId: convId.toString() },
        query: { before: convId.toString() },
      };
      const res = createRes();

      await getMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("reports hasMore and nextBefore when more older messages exist", async () => {
      Conversation.findOne.mockResolvedValue({ _id: convId, participants: [staffUserId] });
      const oldestId = new mongoose.Types.ObjectId();
      // limit+1 rows means there is an older page.
      const pageQuery = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([messageDoc(oldestId, "A"), messageDoc(convId, "B")]),
      };
      Message.find.mockReturnValue(pageQuery);

      const req = {
        user: staffUser,
        params: { conversationId: convId.toString() },
        query: { limit: "1" },
      };
      const res = createRes();

      await getMessages(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          hasMore: true,
          nextBefore: expect.any(String),
        })
      );
    });

    it("returns 404 when the user is not a participant", async () => {
      Conversation.findOne.mockResolvedValue(null);

      const req = { user: staffUser, params: { conversationId: convId.toString() }, query: {} };
      const res = createRes();

      await getMessages(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("sendMessage", () => {
    it("rejects empty body with 400", async () => {
      const req = { user: staffUser, body: { body: "   ", participantIds: [studentUserId.toString()] } };
      const res = createRes();

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/tom/) }));
    });

    it("rejects student messaging student with 403", async () => {
      User.findById.mockResolvedValue(otherStudent);

      const req = {
        user: studentUser,
        body: {
          body: "Tjena studentkompis",
          participantIds: [otherStudentId.toString()],
        },
      };
      const res = createRes();

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("creates a conversation and sends message for valid participants", async () => {
      User.findById.mockResolvedValue(studentUser);
      User.find.mockResolvedValue([studentUser]);

      const req = {
        user: staffUser,
        body: {
          body: "Välkommen till kursen",
          participantIds: [studentUserId.toString()],
          subject: "Kursstart",
        },
      };
      const res = createRes();

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("dispatches an email copy to student recipients with the conversation subject", async () => {
      User.findById.mockResolvedValue(studentUser);
      User.find.mockResolvedValue([studentUser]);

      const req = {
        user: staffUser,
        body: {
          body: "Välkommen till kursen",
          participantIds: [studentUserId.toString()],
          subject: "Kursstart",
        },
      };
      const res = createRes();

      await sendMessage(req, res);

      expect(renderMessageCopyEmail).toHaveBeenCalledWith({
        senderName: "Anna Lärare",
        messageBody: "Välkommen till kursen",
        subject: "Kursstart",
      });
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "erik@elev.se",
          subject: "Kursstart",
          text: "Anna Lärare: Välkommen till kursen",
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("still saves the in-platform message and returns 201 when the email copy fails", async () => {
      User.findById.mockResolvedValue(studentUser);
      User.find.mockResolvedValue([studentUser]);
      sendEmail.mockRejectedValue(new Error("SMTP down"));

      const req = {
        user: staffUser,
        body: {
          body: "Viktigt meddelande",
          participantIds: [studentUserId.toString()],
          subject: "Kursstart",
        },
      };
      const res = createRes();

      await sendMessage(req, res);

      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("still saves the in-platform message and returns 201 when the recipient lookup fails", async () => {
      User.findById.mockResolvedValue(studentUser);
      User.find.mockRejectedValue(new Error("db down"));

      const req = {
        user: staffUser,
        body: {
          body: "Viktigt meddelande",
          participantIds: [studentUserId.toString()],
          subject: "Kursstart",
        },
      };
      const res = createRes();

      await sendMessage(req, res);

      expect(sendEmail).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe("markAsRead", () => {
    it("updates readBy status for messages in conversation", async () => {
      const convId = new mongoose.Types.ObjectId();
      Conversation.findOne.mockResolvedValue({ _id: convId, participants: [staffUserId] });
      Message.updateMany.mockResolvedValue({ acknowledged: true, modifiedCount: 3 });

      const req = { user: staffUser, params: { conversationId: convId.toString() } };
      const res = createRes();

      await markAsRead(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe("getUnreadCount", () => {
    it("returns unread message count", async () => {
      const convId = new mongoose.Types.ObjectId();
      const selectQuery = {
        select: vi.fn().mockResolvedValue([{ _id: convId }]),
      };
      Conversation.find.mockReturnValue(selectQuery);
      Message.countDocuments.mockResolvedValue(5);

      const req = { user: staffUser };
      const res = createRes();

      await getUnreadCount(req, res);

      expect(res.json).toHaveBeenCalledWith({ unreadCount: 5 });
    });
  });

  describe("getRecipients", () => {
    it("returns recipient users for staff", async () => {
      const mockRecipients = [{ name: "Elev 1", roles: ["student"] }];
      const selectQuery = {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockResolvedValue(mockRecipients),
      };
      User.find.mockReturnValue(selectQuery);

      const req = { user: staffUser };
      const res = createRes();

      await getRecipients(req, res);

      expect(res.json).toHaveBeenCalledWith(mockRecipients);
    });

    it("filters recipients server-side when a search term is provided", async () => {
      const mockRecipients = [{ name: "Erik Elev", email: "erik@elev.se", roles: ["student"] }];
      const selectQuery = {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockResolvedValue(mockRecipients),
      };
      User.find.mockReturnValue(selectQuery);

      const req = { user: staffUser, query: { search: "erik" } };
      const res = createRes();

      await getRecipients(req, res);

      expect(User.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { name: { $regex: "erik", $options: "i" } },
            { email: { $regex: "erik", $options: "i" } },
          ],
        })
      );
      expect(res.json).toHaveBeenCalledWith(mockRecipients);
    });
  });
});
