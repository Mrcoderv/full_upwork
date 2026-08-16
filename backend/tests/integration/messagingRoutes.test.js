import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import User from "../../src/models/User.js";
import Conversation from "../../src/models/Conversation.js";
import Message from "../../src/models/Message.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

const buildAuthHeader = (userId, roles) => {
    const token = jwt.sign({ userId: userId.toString(), role: roles[0], roles }, process.env.JWT_SECRET || "test-secret");
    return { Authorization: `Bearer ${token}` };
};

describe("Messaging Routes Integration Tests", () => {
    let staffUser;
    let studentUser;

    beforeAll(async () => {
        await connectTestDatabase();
        process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
    });

    afterAll(async () => {
        await disconnectTestDatabase();
    });

    beforeEach(async () => {
        await Promise.all([
            User.deleteMany({}),
            Conversation.deleteMany({}),
            Message.deleteMany({}),
        ]);

        staffUser = await User.create({
            name: "Anna Lärare",
            email: "anna-messaging@skola.se",
            password: "hashed-placeholder",
            roles: ["teacher"],
        });
        studentUser = await User.create({
            name: "Erik Elev",
            email: "erik-messaging@elev.se",
            password: "hashed-placeholder",
            roles: ["student"],
        });
    });

    const createConversation = async () => {
        const conversation = await Conversation.create({
            participants: [staffUser._id, studentUser._id],
            subject: "Inlämning",
        });
        return conversation;
    };

    const addMessage = async (conversation, sender, body, createdAt = new Date()) => {
        return Message.create({
            conversationId: conversation._id,
            senderId: sender._id,
            body,
            readBy: [{ userId: sender._id, readAt: new Date() }],
            createdAt,
        });
    };

    it("lists conversations with batched unread counts and newest-message previews", async () => {
        const conversation = await createConversation();
        await addMessage(conversation, staffUser, "Hej Erik");
        await addMessage(conversation, studentUser, "Svar från Erik");

        const res = await request(app)
            .get("/api/conversations")
            .set(buildAuthHeader(staffUser._id, ["teacher"]))
            .expect(200);

        expect(res.body).toHaveLength(1);
        expect(res.body[0]._id.toString()).toBe(conversation._id.toString());
        // Anna has 1 unread message (Erik's reply).
        expect(res.body[0].unreadCount).toBe(1);
        expect(res.body[0].lastMessage.body).toBe("Svar från Erik");
    });

    it("paginates messages backwards through a long thread", async () => {
        const conversation = await createConversation();
        const older = [];
        for (let i = 0; i < 60; i += 1) {
            const message = await addMessage(
                conversation,
                staffUser,
                `Meddelande ${i}`,
                new Date(Date.now() + i * 1000)
            );
            older.push(message);
        }

        const first = await request(app)
            .get(`/api/conversations/${conversation._id}/messages?limit=50`)
            .set(buildAuthHeader(staffUser._id, ["teacher"]))
            .expect(200);

        expect(first.body.messages).toHaveLength(50);
        expect(first.body.hasMore).toBe(true);
        // Newest first page, ascending order.
        expect(first.body.messages[0].body).toBe("Meddelande 10");
        expect(first.body.messages[49].body).toBe("Meddelande 59");

        const second = await request(app)
            .get(`/api/conversations/${conversation._id}/messages?limit=50&before=${first.body.nextBefore}`)
            .set(buildAuthHeader(staffUser._id, ["teacher"]))
            .expect(200);

        expect(second.body.messages).toHaveLength(10);
        expect(second.body.hasMore).toBe(false);
        expect(second.body.messages[0].body).toBe("Meddelande 0");
        expect(second.body.messages[9].body).toBe("Meddelande 9");
    });

    it("rejects message access for non-participants", async () => {
        const conversation = await createConversation();
        const outsider = await User.create({
            name: "Utanför",
            email: "outside-messaging@skola.se",
            password: "hashed-placeholder",
            roles: ["teacher"],
        });

        const res = await request(app)
            .get(`/api/conversations/${conversation._id}/messages`)
            .set(buildAuthHeader(outsider._id, ["teacher"]))
            .expect(404);

        expect(res.body.message).toContain("hittades inte");
    });

    it("marking a conversation as read zeroes the unread count", async () => {
        const conversation = await createConversation();
        await addMessage(conversation, staffUser, "Hej Erik");
        await addMessage(conversation, studentUser, "Svar från Erik");

        const before = await request(app)
            .get("/api/conversations")
            .set(buildAuthHeader(staffUser._id, ["teacher"]))
            .expect(200);
        expect(before.body[0].unreadCount).toBe(1);

        await request(app)
            .post(`/api/conversations/${conversation._id}/read`)
            .set(buildAuthHeader(staffUser._id, ["teacher"]))
            .expect(200);

        const after = await request(app)
            .get("/api/conversations")
            .set(buildAuthHeader(staffUser._id, ["teacher"]))
            .expect(200);
        expect(after.body[0].unreadCount).toBe(0);
    });

    it("filters recipients by a server-side search term", async () => {
        await User.create({
            name: "Lisa Nilsson",
            email: "lisa-recipient@elev.se",
            password: "hashed-placeholder",
            roles: ["student"],
        });

        const res = await request(app)
            .get("/api/recipients")
            .set(buildAuthHeader(staffUser._id, ["teacher"]))
            .expect(200);
        const emails = res.body.map((r) => r.email);
        expect(emails).toContain("erik-messaging@elev.se");

        const searched = await request(app)
            .get("/api/recipients?search=lisa")
            .set(buildAuthHeader(staffUser._id, ["teacher"]))
            .expect(200);
        const searchedEmails = searched.body.map((r) => r.email);
        expect(searchedEmails).toEqual(["lisa-recipient@elev.se"]);
    });
});
