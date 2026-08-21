import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import User from "../../src/models/User.js";
import FaqCategory from "../../src/models/FaqCategory.js";
import Faq from "../../src/models/Faq.js";
import AuditLog from "../../src/models/AuditLog.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

let adminCookie;
let teacherCookie;
let otherTeacherCookie;
let studentCookie;
let adminUser;
let teacherUser;
let otherTeacherUser;
let studentUser;

const makeToken = (user) =>
    jwt.sign(
        {
            userId: user._id.toString(),
            role: user.roles[0],
            roles: user.roles,
            name: user.name,
            email: user.email,
        },
        process.env.JWT_SECRET || "test-secret"
    );

const createUsers = async () => {
    const hashed = await bcrypt.hash("testPassword123!", 10);
    adminUser = await User.create({
        name: "Admin User",
        email: "faqadmin@example.com",
        password: hashed,
        roles: ["systemadmin"],
    });
    teacherUser = await User.create({
        name: "Teacher One",
        email: "faqteacher@example.com",
        password: hashed,
        roles: ["teacher"],
    });
    otherTeacherUser = await User.create({
        name: "Teacher Two",
        email: "faqteacher2@example.com",
        password: hashed,
        roles: ["teacher"],
    });
    studentUser = await User.create({
        name: "Student One",
        email: "faqstudent@example.com",
        password: hashed,
        roles: ["student"],
    });

    adminCookie = `token=${makeToken(adminUser)}`;
    teacherCookie = `token=${makeToken(teacherUser)}`;
    otherTeacherCookie = `token=${makeToken(otherTeacherUser)}`;
    studentCookie = `token=${makeToken(studentUser)}`;
};

describe("faqRoutes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        vi.restoreAllMocks();
        await Promise.all([
            Faq.deleteMany({}),
            FaqCategory.deleteMany({}),
            User.deleteMany({}),
            AuditLog.deleteMany({}),
        ]);
        await createUsers();
    });

    // ─── Helpers ────────────────────────────────────────────────────────────
    const createCategory = async (overrides = {}) =>
        (
            await request(app)
                .post("/api/chatbot/faq/manage/categories")
                .set("Cookie", adminCookie)
                .send({ name: "Avgifter", description: "Betalning och avgifter", ...overrides })
        ).body.category;

    const createFaq = async (overrides = {}) => {
        const category =
            overrides.categoryId ||
            (await createCategory({ name: overrides._categoryName || "Kategori" }));
        const res = await request(app)
            .post("/api/chatbot/faq/manage/questions")
            .set("Cookie", overrides._cookie || adminCookie)
            .send({
                categoryId: typeof category === "object" ? category._id : category,
                question: "Hur betalar jag min avgift?",
                answer: "Du betalar via faktura den 25:e varje månad.",
                keywords: ["avgift", "betala"],
                alternateQuestions: ["Var skickar jag in betalningen?"],
                ...overrides,
            });
        return { res, category };
    };

    // ─── Auth ───────────────────────────────────────────────────────────────
    describe("auth", () => {
        it("returns 401 for unauthenticated public category list", async () => {
            const res = await request(app).get("/api/chatbot/faq/categories").expect(401);
            expect(res.body).toHaveProperty("error");
        });

        it("returns 401 for unauthenticated manage endpoints", async () => {
            await request(app).get("/api/chatbot/faq/manage/questions").expect(401);
            await request(app).post("/api/chatbot/faq/manage/categories").send({ name: "X" }).expect(401);
        });

        it("returns 400 for invalid id format", async () => {
            const res = await request(app)
                .put("/api/chatbot/faq/manage/questions/not-an-id")
                .set("Cookie", adminCookie)
                .send({ status: "active" })
                .expect(400);
            expect(res.body).toHaveProperty("error");
        });
    });

    // ─── Categories ─────────────────────────────────────────────────────────
    describe("category management", () => {
        it("admin creates a category and writes an audit log", async () => {
            const res = await request(app)
                .post("/api/chatbot/faq/manage/categories")
                .set("Cookie", adminCookie)
                .send({ name: "Skolinformation", description: "Allmänt" })
                .expect(201);
            expect(res.body.category.name).toBe("Skolinformation");
            expect(res.body.category.status).toBe("active");
            expect(String(res.body.category.createdBy)).toBe(String(adminUser._id));

            const audit = await AuditLog.findOne({ entityType: "FaqCategory", action: "create" });
            expect(audit).toBeTruthy();
        });

        it("rejects duplicate category names case-insensitively", async () => {
            await createCategory({ name: "Examen" });
            const res = await request(app)
                .post("/api/chatbot/faq/manage/categories")
                .set("Cookie", adminCookie)
                .send({ name: "examen" })
                .expect(409);
            expect(res.body.error).toMatch(/finns redan/i);
        });

        it("requires a non-empty name", async () => {
            await request(app)
                .post("/api/chatbot/faq/manage/categories")
                .set("Cookie", adminCookie)
                .send({ name: "   " })
                .expect(400);
        });

        it("updates a category and sets updatedBy", async () => {
            const category = await createCategory();
            const res = await request(app)
                .put(`/api/chatbot/faq/manage/categories/${category._id}`)
                .set("Cookie", adminCookie)
                .send({ name: "Certifikat", displayOrder: 5 })
                .expect(200);
            expect(res.body.category.name).toBe("Certifikat");
            expect(res.body.category.displayOrder).toBe(5);
            expect(String(res.body.category.updatedBy)).toBe(String(adminUser._id));
        });

        it("allows teachers to create categories", async () => {
            const res = await request(app)
                .post("/api/chatbot/faq/manage/categories")
                .set("Cookie", teacherCookie)
                .send({ name: "Lärarkategori" })
                .expect(201);
            expect(res.body.category.name).toBe("Lärarkategori");
            expect(res.body.category.status).toBe("active");
            expect(String(res.body.category.createdBy)).toBe(String(teacherUser._id));
        });

        it("forbids teachers from updating categories", async () => {
            const category = await createCategory();
            await request(app)
                .put(`/api/chatbot/faq/manage/categories/${category._id}`)
                .set("Cookie", teacherCookie)
                .send({ name: "Omdöpt av lärare" })
                .expect(403);
        });

        it("forbids teachers from deleting categories", async () => {
            const category = await createCategory();
            await request(app)
                .delete(`/api/chatbot/faq/manage/categories/${category._id}`)
                .set("Cookie", teacherCookie)
                .expect(403);
        });

        it("forbids students from updating categories", async () => {
            const category = await createCategory();
            await request(app)
                .put(`/api/chatbot/faq/manage/categories/${category._id}`)
                .set("Cookie", studentCookie)
                .send({ name: "Hacket" })
                .expect(403);
        });

        it("refuses to delete a category that still has FAQs", async () => {
            const { category } = await createFaq();
            const res = await request(app)
                .delete(`/api/chatbot/faq/manage/categories/${category._id}`)
                .set("Cookie", adminCookie)
                .expect(409);
            expect(res.body.error).toMatch(/kan inte tas bort/i);
            const stillThere = await FaqCategory.findById(category._id);
            expect(stillThere).toBeTruthy();
        });

        it("deletes an empty category", async () => {
            const category = await createCategory();
            await request(app)
                .delete(`/api/chatbot/faq/manage/categories/${category._id}`)
                .set("Cookie", adminCookie)
                .expect(200);
            const gone = await FaqCategory.findById(category._id);
            expect(gone).toBeNull();
        });
    });

    // ─── FAQs ───────────────────────────────────────────────────────────────
    describe("FAQ management", () => {
        it("teacher creates a FAQ with a valid category", async () => {
            const category = await createCategory();
            const res = await request(app)
                .post("/api/chatbot/faq/manage/questions")
                .set("Cookie", teacherCookie)
                .send({
                    categoryId: category._id,
                    question: "När får jag mitt certifikat?",
                    answer: "Certifikatet skickas inom två veckor efter avslutad kurs.",
                })
                .expect(201);
            expect(String(res.body.faq.createdBy)).toBe(String(teacherUser._id));
            expect(res.body.faq.status).toBe("active");
        });

        it("rejects whitespace-only question or answer", async () => {
            const category = await createCategory();
            await request(app)
                .post("/api/chatbot/faq/manage/questions")
                .set("Cookie", teacherCookie)
                .send({ categoryId: category._id, question: "   ", answer: "Svar" })
                .expect(400);
            await request(app)
                .post("/api/chatbot/faq/manage/questions")
                .set("Cookie", teacherCookie)
                .send({ categoryId: category._id, question: "Fråga?", answer: "" })
                .expect(400);
        });

        it("rejects invalid category ids", async () => {
            const res = await request(app)
                .post("/api/chatbot/faq/manage/questions")
                .set("Cookie", teacherCookie)
                .send({ categoryId: new mongoose.Types.ObjectId().toString(), question: "Fråga?", answer: "Svar" })
                .expect(400);
            expect(res.body.error).toMatch(/kategorin hittades inte/i);
        });

        it("rejects duplicate questions within the same category", async () => {
            const { category } = await createFaq();
            const res = await request(app)
                .post("/api/chatbot/faq/manage/questions")
                .set("Cookie", adminCookie)
                .send({
                    categoryId: category._id,
                    question: "hur betalar jag min avgift?",
                    answer: "Annat svar.",
                })
                .expect(409);
            expect(res.body.error).toMatch(/redan en fråga/i);
        });

        it("allows the same question text in different categories", async () => {
            const { res } = await createFaq({ _categoryName: "Kategori A" });
            expect(res.status).toBe(201);
            await createFaq({ _categoryName: "Kategori B" });
        });

        it("teacher updates own FAQ and updatedBy is set", async () => {
            const { res: created } = await createFaq({ _cookie: teacherCookie });
            const faqId = created.body.faq._id;
            const res = await request(app)
                .put(`/api/chatbot/faq/manage/questions/${faqId}`)
                .set("Cookie", teacherCookie)
                .send({ answer: "Uppdaterat verifierat svar." })
                .expect(200);
            expect(res.body.faq.answer).toBe("Uppdaterat verifierat svar.");
            expect(String(res.body.faq.updatedBy)).toBe(String(teacherUser._id));
        });

        it("teacher cannot modify another teacher's FAQ", async () => {
            const { res: created } = await createFaq({ _cookie: teacherCookie });
            const faqId = created.body.faq._id;
            await request(app)
                .put(`/api/chatbot/faq/manage/questions/${faqId}`)
                .set("Cookie", otherTeacherCookie)
                .send({ answer: "Övertaget svar." })
                .expect(403);
            await request(app)
                .delete(`/api/chatbot/faq/manage/questions/${faqId}`)
                .set("Cookie", otherTeacherCookie)
                .expect(403);
        });

        it("teacher cannot modify an admin-created FAQ", async () => {
            const { res: created } = await createFaq({ _cookie: adminCookie });
            const faqId = created.body.faq._id;
            await request(app)
                .put(`/api/chatbot/faq/manage/questions/${faqId}`)
                .set("Cookie", teacherCookie)
                .send({ answer: "Nej." })
                .expect(403);
        });

        it("admin manages teacher-created FAQs", async () => {
            const { res: created } = await createFaq({ _cookie: teacherCookie });
            const faqId = created.body.faq._id;
            const res = await request(app)
                .put(`/api/chatbot/faq/manage/questions/${faqId}`)
                .set("Cookie", adminCookie)
                .send({ status: "inactive" })
                .expect(200);
            expect(res.body.faq.status).toBe("inactive");
        });

        it("soft deletes a FAQ so it can be audited", async () => {
            const { res: created } = await createFaq({ _cookie: teacherCookie });
            const faqId = created.body.faq._id;
            await request(app)
                .delete(`/api/chatbot/faq/manage/questions/${faqId}`)
                .set("Cookie", teacherCookie)
                .expect(200);
            const doc = await Faq.findById(faqId);
            expect(doc.isDeleted).toBe(true);
            expect(doc.deletedAt).toBeTruthy();

            const audit = await AuditLog.findOne({ entityType: "Faq", action: "delete" });
            expect(audit).toBeTruthy();
        });

        it("lists FAQs with pagination, search and filters", async () => {
            const catA = await createCategory({ name: "Kursinfo" });
            const catB = await createCategory({ name: "System" });
            for (let i = 0; i < 12; i++) {
                await Faq.create({
                    categoryId: i % 2 ? catA._id : catB._id,
                    question: `Fråga nummer ${i} om närvaro`,
                    answer: `Svar ${i}`,
                    createdBy: teacherUser._id,
                    updatedBy: teacherUser._id,
                });
            }

            const page1 = await request(app)
                .get("/api/chatbot/faq/manage/questions?page=1&limit=10")
                .set("Cookie", adminCookie)
                .expect(200);
            expect(page1.body.faqs).toHaveLength(10);
            expect(page1.body.total).toBe(12);
            expect(page1.body.totalPages).toBe(2);

            const searched = await request(app)
                .get("/api/chatbot/faq/manage/questions?search=n%C3%A4rvaro")
                .set("Cookie", adminCookie)
                .expect(200);
            expect(searched.body.total).toBe(12);

            const byCategory = await request(app)
                .get(`/api/chatbot/faq/manage/questions?categoryId=${catA._id}`)
                .set("Cookie", adminCookie)
                .expect(200);
            expect(byCategory.body.total).toBe(6);

            const byCreator = await request(app)
                .get(`/api/chatbot/faq/manage/questions?createdBy=${teacherUser._id}`)
                .set("Cookie", adminCookie)
                .expect(200);
            expect(byCreator.body.total).toBe(12);
        });

        it("students cannot access management listings", async () => {
            await request(app)
                .get("/api/chatbot/faq/manage/questions")
                .set("Cookie", studentCookie)
                .expect(403);
        });
    });

    // ─── Public read / chatbot ──────────────────────────────────────────────
    describe("public chatbot read APIs", () => {
        it("lists only active categories to students", async () => {
            await createCategory({ name: "Aktiv kategori" });
            await createCategory({ name: "Dold kategori", status: "inactive" });
            const res = await request(app)
                .get("/api/chatbot/faq/categories")
                .set("Cookie", studentCookie)
                .expect(200);
            const names = res.body.categories.map((c) => c.name);
            expect(names).toContain("Aktiv kategori");
            expect(names).not.toContain("Dold kategori");
        });

        it("hides inactive and deleted FAQs from students", async () => {
            const category = await createCategory();
            await Faq.create({
                categoryId: category._id,
                question: "Synlig fråga?",
                answer: "Synligt svar.",
                createdBy: adminUser._id,
            });
            await Faq.create({
                categoryId: category._id,
                question: "Inaktiv fråga?",
                answer: "Dolt svar.",
                status: "inactive",
                createdBy: adminUser._id,
            });
            await Faq.create({
                categoryId: category._id,
                question: "Raderad fråga?",
                answer: "Dolt svar.",
                isDeleted: true,
                createdBy: adminUser._id,
            });

            const res = await request(app)
                .get(`/api/chatbot/faq/categories/${category._id}/questions`)
                .set("Cookie", studentCookie)
                .expect(200);
            expect(res.body.faqs).toHaveLength(1);
            expect(res.body.faqs[0].question).toBe("Synlig fråga?");
            // No audit info leaks to students
            expect(res.body.faqs[0].createdBy).toBeUndefined();
        });

        it("returns 404 for an inactive category's questions", async () => {
            const category = await createCategory({ status: "inactive" });
            await request(app)
                .get(`/api/chatbot/faq/categories/${category._id}/questions`)
                .set("Cookie", studentCookie)
                .expect(404);
        });

        it("does not serve a single inactive FAQ to students", async () => {
            const category = await createCategory();
            const faq = await Faq.create({
                categoryId: category._id,
                question: "Inaktiv enskild?",
                answer: "Svar.",
                status: "inactive",
                createdBy: adminUser._id,
            });
            await request(app)
                .get(`/api/chatbot/faq/questions/${faq._id}`)
                .set("Cookie", studentCookie)
                .expect(404);
        });

        it("chatbot ask returns the exact verified FAQ answer before course search", async () => {
            const category = await createCategory({ name: "Avgifter" });
            await Faq.create({
                categoryId: category._id,
                question: "Hur betalar jag kursavgiften?",
                answer: "EXAKT_VERIFIERAT_SVAR_42",
                keywords: ["avgift", "betalning"],
                alternateQuestions: ["Var betalar jag?"],
                createdBy: adminUser._id,
            });

            const exact = await request(app)
                .post("/api/chatbot/ask")
                .set("Cookie", studentCookie)
                .send({ question: "Hur betalar jag kursavgiften?" })
                .expect(200);
            expect(exact.body.data.answer).toBe("EXAKT_VERIFIERAT_SVAR_42");

            const keyword = await request(app)
                .post("/api/chatbot/ask")
                .set("Cookie", studentCookie)
                .send({ question: "Frågor om avgift och betalning?" })
                .expect(200);
            expect(keyword.body.data.answer).toBe("EXAKT_VERIFIERAT_SVAR_42");

            const alternate = await request(app)
                .post("/api/chatbot/ask")
                .set("Cookie", studentCookie)
                .send({ question: "Var betalar jag?" })
                .expect(200);
            expect(alternate.body.data.answer).toBe("EXAKT_VERIFIERAT_SVAR_42");
        });

        it("chatbot ask falls back to existing behavior when no FAQ matches", async () => {
            const res = await request(app)
                .post("/api/chatbot/ask")
                .set("Cookie", studentCookie)
                .send({ question: "En helt obeskrivbar fråga xyzzy" })
                .expect(200);
            expect(res.body.data.answer).not.toBe("");
            expect(res.body.data.approved).toBeFalsy();
        });
    });
});
