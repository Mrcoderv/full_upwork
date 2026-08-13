/**
 * End-to-end test for requirement #26 — the Sollentuna "Lärteamet" admission
 * email.
 *
 * Unlike the unit tests, this suite does NOT mock the nodemailer transport
 * internals: it configures placeholder credentials so the real
 * emailService.getTransporter() selects the real stream transport
 * (streamTransport + buffer), and spies on nodemailer.createTransport only to
 * capture what the REAL transport produced. Every student-creation request
 * therefore exercises the genuine trigger wiring (POST /student), template
 * rendering, and message generation — no delivery happens.
 */
import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
    vi,
} from "vitest";
import request from "supertest";
import nodemailer from "nodemailer";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import app from "../../index.js";
import User from "../../src/models/User.js";
import Student from "../../src/models/Student.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";
import {
    _resetEmailTransporter,
    SOLLENTUNA_MUNICIPALITY,
    LARTEAMET_BROCHURE_FILE,
} from "../../src/services/emailService.js";

let authToken;

const captures = [];
const realCreateTransport = nodemailer.createTransport;

const sentEmails = () => captures.filter((c) => c.kind === "sendMail");

const clearEmailEnv = () => {
    delete process.env.GOOGLE_EMAIL;
    delete process.env.GOOGLE_PWD;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.LARTEAMET_PDF_PATH;
};

// RFC2047/Quoted-Printable decoders for the raw message produced by the real
// stream transport.
const decodeQuotedPrintable = (str) => {
    try {
        return decodeURIComponent(
            str
                .replace(/=\r?\n/g, "")
                .replace(/_/g, "%20")
                .replace(/=([0-9A-F]{2})/g, "%$1")
        );
    } catch {
        return str;
    }
};

const rawHeaderValue = (raw, name) => {
    const lines = raw.split("\n");
    const idx = lines.findIndex((line) =>
        line.toLowerCase().startsWith(name.toLowerCase() + ":")
    );
    if (idx < 0) return "";
    const value = [lines[idx].slice(name.length + 1).trim()];
    let j = idx + 1;
    while (j < lines.length && /^[ \t]/.test(lines[j])) {
        value.push(lines[j].trim());
        j += 1;
    }
    return value.join(" ");
};

const rawBody = (raw) => {
    const separator = raw.indexOf("\n\n");
    return separator < 0 ? "" : raw.slice(separator + 2);
};

describe("Lärteamet admission email (#26) — end-to-end", () => {
    beforeAll(async () => {
        await connectTestDatabase();
        clearEmailEnv();
        // Force the real code path to select stream transport (placeholder
        // creds) and capture what the real transporter produces.
        vi.spyOn(nodemailer, "createTransport").mockImplementation((opts) => {
            captures.push({ kind: "createTransport", opts });
            const mailer = realCreateTransport(opts);
            const originalSendMail = mailer.sendMail.bind(mailer);
            mailer.sendMail = async (mail) => {
                const info = await originalSendMail(mail);
                captures.push({ kind: "sendMail", mail, info });
                return info;
            };
            return mailer;
        });
    }, 60000);

    afterAll(async () => {
        vi.restoreAllMocks();
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        _resetEmailTransporter();
        captures.length = 0;

        await User.deleteMany({});
        await Student.deleteMany({});

        const hashed = await bcrypt.hash("testPassword123!", 10);
        const testUser = new User({
            name: "Test Admin",
            email: "testadmin@example.com",
            password: hashed,
            roles: ["admin"],
        });
        await testUser.save();

        const token = jwt.sign(
            {
                userId: testUser._id.toString(),
                role: "admin",
                roles: ["admin"],
                name: testUser.name,
                email: testUser.email,
            },
            process.env.JWT_SECRET || "test-secret"
        );
        authToken = `token=${token}`;
    });

    afterEach(async () => {
        await User.deleteMany({});
        await Student.deleteMany({});
        fs.rmSync("/tmp/opencode/test-larteamet-brochure.pdf", { force: true });
    });

    const createStudent = (overrides = {}) =>
        request(app)
            .post("/api/student")
            .set("Cookie", authToken)
            .send({
                name: "Lina Sollentunabo",
                email: "lina@sollentuna.se",
                personalNumber: "199001011234",
                ...overrides,
            });

    it("sends exactly one real Lärteamet email when a Sollentuna student is created", async () => {
        const res = await createStudent({ municipality: SOLLENTUNA_MUNICIPALITY });

        expect(res.status).toBe(201);

        expect(sentEmails()).toHaveLength(1);
        const { mail, info } = sentEmails()[0];
        expect(mail.to).toBe("lina@sollentuna.se");
        expect(mail.subject).toContain("Lärteamet");
        expect(mail.subject).toContain("Sollentuna");
        expect(mail.text).toContain("Lina Sollentunabo");
        expect(mail.text).toContain("Lärteamet");
        expect(mail.attachments).toBeUndefined();

        // The real stream transport must have rendered a valid message.
        expect(info.message.toString().length).toBeGreaterThan(0);
        const raw = info.message.toString();
        expect(rawHeaderValue(raw, "To")).toBe("lina@sollentuna.se");
        expect(rawHeaderValue(raw, "From")).toContain("Mindful Learning");
        expect(decodeQuotedPrintable(rawHeaderValue(raw, "Subject"))).toContain(
            "Lärteamet"
        );
        expect(decodeQuotedPrintable(rawBody(raw))).toContain(
            "Sollentuna kommun"
        );
    });

    it("sends no email for a non-Sollentuna student", async () => {
        const res = await createStudent({ municipality: "Solna" });

        expect(res.status).toBe(201);
        expect(sentEmails()).toHaveLength(0);
    });

    it("does not re-fire the email when an existing student is re-registered", async () => {
        const first = await createStudent({
            municipality: SOLLENTUNA_MUNICIPALITY,
        });
        expect(first.status).toBe(201);
        expect(sentEmails()).toHaveLength(1);

        const second = await createStudent({
            name: "Lina Sollentunabo",
            email: "lina@sollentuna.se",
            personalNumber: "199001011234",
            municipality: SOLLENTUNA_MUNICIPALITY,
        });
        expect(second.status).toBe(200);
        expect(second.body.alreadyExists).toBe(true);
        expect(sentEmails()).toHaveLength(1);
    });

    it("attaches the Lärteamet brochure when it is available", async () => {
        const brochurePath = "/tmp/opencode/test-larteamet-brochure.pdf";
        fs.writeFileSync(brochurePath, "%PDF-1.4 test brochure");
        process.env.LARTEAMET_PDF_PATH = brochurePath;

        const res = await createStudent({ municipality: SOLLENTUNA_MUNICIPALITY });

        expect(res.status).toBe(201);
        expect(sentEmails()).toHaveLength(1);
        expect(sentEmails()[0].mail.attachments).toEqual([
            expect.objectContaining({
                filename: LARTEAMET_BROCHURE_FILE,
                path: brochurePath,
                contentType: "application/pdf",
            }),
        ]);

        const raw = sentEmails()[0].info.message.toString();
        expect(raw).toContain("application/pdf");
        expect(raw).toContain(LARTEAMET_BROCHURE_FILE);
    });
});
