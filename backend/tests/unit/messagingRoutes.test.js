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
    countDocuments: vi.fn(),
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
import { canMessage, sendEmailCopyOfMessage } from "../../src/services/messagingService.js";

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

  describe("messagingService.sendEmailCopyOfMessage (Part B Stub)", () => {
    it("executes stub without throwing", async () => {
      const dummyMsg = { _id: new mongoose.Types.ObjectId() };
      await expect(sendEmailCopyOfMessage(dummyMsg, studentUser)).resolves.not.toThrow();
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
      Message.countDocuments.mockResolvedValue(2);

      const msgQuery = {
        sort: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ body: "Hej", createdAt: new Date() }),
      };
      Message.findOne.mockReturnValue(msgQuery);

      const req = { user: staffUser };
      const res = createRes();

      await getConversations(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            _id: convId,
            unreadCount: 2,
          }),
        ])
      );
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
  });
});
