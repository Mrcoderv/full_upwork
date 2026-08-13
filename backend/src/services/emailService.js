/**
 * Shared outbound email service.
 *
 * This is the app's single email entry point. It wraps nodemailer behind:
 *   - a lazily-created, cached transporter (Gmail -> generic SMTP -> stream)
 *   - a sendEmail() that never throws (an email failure must never break the
 *     caller, e.g. student creation)
 *   - per-email-type template literal renderers
 *   - the Sollentuna "Lärteamet" admission trigger used by the student
 *     creation paths (POST /student and uploadXlsx)
 *
 * The transporter is selected once, on first use:
 *   1. GOOGLE_EMAIL + GOOGLE_PWD (non-placeholder)  -> Gmail SMTP
 *   2. SMTP_HOST + SMTP_USER + SMTP_PASS            -> generic SMTP
 *   3. otherwise                                    -> nodemailer stream
 *      transport (captures the message in a stream; NO real delivery) and a
 *      loud warning, so placeholder credentials can never silently pretend to
 *      deliver mail.
 */
import nodemailer from "nodemailer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import logger from "../utils/logger.js";

export const SOLLENTUNA_MUNICIPALITY = "Sollentuna";

/** Filename of the Lärteamet brochure the school supplies (see #26). */
export const LARTEAMET_BROCHURE_FILE = "folder-om-larteamet.pdf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PLACEHOLDER_RE = /REPLACE_WITH_|changeme|your_?password/i;

export const isPlaceholderCredential = (value) =>
    !value || PLACEHOLDER_RE.test(value);

const defaultFromEmail = "newmindful.development@gmail.com";
const EMAIL_FROM =
    process.env.EMAIL_FROM || `Mindful Learning <${defaultFromEmail}>`;

let transporter = null;
let transportMode = null;

/**
 * Select (and cache) the outbound transporter based on configured credentials.
 * @returns {{ transporter: import("nodemailer").Transporter, transportMode: string }}
 */
export const getTransporter = () => {
    if (transporter) return { transporter, transportMode };

    const gmailUser = process.env.GOOGLE_EMAIL || defaultFromEmail;
    const gmailPass = process.env.GOOGLE_PWD || "";

    if (!isPlaceholderCredential(gmailPass)) {
        transporter = nodemailer.createTransport({
            service: "Gmail",
            auth: { user: gmailUser, pass: gmailPass },
        });
        transportMode = "gmail";
        logger.info({ from: EMAIL_FROM, to: gmailUser }, "Email transport: Gmail SMTP");
    } else if (
        process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        !isPlaceholderCredential(process.env.SMTP_PASS)
    ) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_SECURE === "true",
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
        transportMode = "smtp";
        logger.info({ host: process.env.SMTP_HOST }, "Email transport: generic SMTP");
    } else {
        // nodemailer's test/stream transport: writes the rendered message to a
        // stream instead of delivering it. This is NOT real delivery and is
        // loudly logged on every send (see sendEmail).
        transporter = nodemailer.createTransport({
            streamTransport: true,
            buffer: true,
            newline: "unix",
        });
        transportMode = "stream";
        logger.warn(
            "Outbound email is NOT configured with real SMTP credentials (GOOGLE_PWD is a placeholder). " +
                "Using nodemailer streamTransport — NO real email will be delivered. " +
                "Set GOOGLE_EMAIL + GOOGLE_PWD (or SMTP_HOST/USER/PASS) to enable real sends."
        );
    }

    return { transporter, transportMode };
};

/** Test helper: drop the cached transporter so the next getTransporter() re-evaluates env. */
export const _resetEmailTransporter = () => {
    transporter = null;
    transportMode = null;
};

/**
 * Send an email. Never throws — failures are logged and returned in the result
 * so the caller (student creation, messaging, ...) can continue.
 * @param {{ to: string, subject: string, text?: string, html?: string, attachments?: Array<{filename: string, path?: string, content?: Buffer, contentType?: string}> }} opts
 * @returns {Promise<{success: boolean, messageId?: string, transportMode?: string, reason?: string, error?: string}>}
 */
export const sendEmail = async ({ to, subject, text, html, attachments }) => {
    if (!to || !subject) {
        logger.warn({ to, subject }, "sendEmail called without to/subject; skipping");
        return { success: false, reason: "missing_fields" };
    }

    const { transporter: mailer, transportMode: mode } = getTransporter();

    try {
        const info = await mailer.sendMail({
            from: EMAIL_FROM,
            to,
            subject,
            text,
            html,
            ...(Array.isArray(attachments) && attachments.length
                ? { attachments }
                : {}),
        });

        if (mode === "stream") {
            // Real delivery is NOT configured — say so explicitly on every send
            // instead of pretending the mail went out.
            logger.warn(
                { to, subject, messageId: info?.messageId },
                "EMAIL NOT DELIVERED (stream transport — unconfigured SMTP). Would have sent: " +
                    `"${subject}" to ${to}`
            );
        } else {
            logger.info(
                { to, subject, messageId: info?.messageId, transportMode: mode },
                "Email sent"
            );
        }

        return { success: true, messageId: info?.messageId, transportMode: mode };
    } catch (err) {
        logger.error(
            { err, to, subject },
            "Email send failed (non-fatal, caller continues)"
        );
        return { success: false, error: err.message, transportMode: mode };
    }
};

// ── Templates ──────────────────────────────────────────────────────────────

/**
 * Lärteamet admission email template (requirement #26).
 *
 * Sent to every newly registered Sollentuna student after admission. Copy is
 * written from the Etapp 2 requirement (Sollentuna kommun's Lärteamet study
 * support). When the school's brochure (folder-om-larteamet.pdf) is dropped
 * into backend/assets/ (or pointed to via LARTEAMET_PDF_PATH) it is attached
 * to the email automatically (see maybeSendLarteametEmail).
 * @param {{ studentName?: string, contactEmail?: string }} ctx
 */
export const renderLarteametEmail = ({
    studentName,
    contactEmail = "larteamet@sollentuna.se",
} = {}) => {
    const greeting = studentName ? `Hej ${studentName}!` : "Hej!";
    const subject = "Välkommen — information om Lärteamet (Sollentuna kommun)";
    const text = [
        greeting,
        "",
        "Du är nu registrerad som elev via Sollentuna kommun.",
        "",
        "Som elev via Sollentuna kommun har du tillgång till Lärteamet — kommunens stöd för studier.",
        "Lärteamet kan hjälpa dig med olika insatser för att stödja dina studier, till exempel:",
        "  • stöd och vägledning i studierna",
        "  • hjälp med att strukturera och planera din studietid",
        "  • kontakt och samverkan med din lärare",
        "",
        "Läs gärna den bifogade foldern (folder-om-larteamet.pdf) för mer information om Lärteamet.",
        "",
        "Har du frågor är du välkommen att höra av dig till:",
        contactEmail,
        "",
        "Vänliga hälsningar",
        "Mindful Learning",
    ].join("\n");
    return { subject, text };
};

/**
 * Email copy of an internal message, sent to student recipients (#27 Part B).
 * @param {{ senderName?: string, messageBody: string, subject?: string }} ctx
 */
export const renderMessageCopyEmail = ({
    senderName,
    messageBody,
    subject = "Kurskommunikation",
}) => {
    const senderLine = senderName ? `Avsändare: ${senderName}` : "Du har fått ett nytt meddelande från din skola.";
    const text = [
        senderLine,
        "",
        messageBody || "",
        "",
        "Du kan svara direkt i Mindful Learning: logga in på https://localhost:5173 och öppna Meddelanden.",
    ].join("\n");
    return { subject, text };
};

/**
 * Welcome email with the temporary password for a newly created student login
 * (POST /users/create-for-student). The password is also returned to the admin
 * caller — this email is the student-facing copy of it.
 * @param {{ studentName?: string, email: string, tempPassword: string }} ctx
 */
export const renderTempPasswordEmail = ({ studentName, email, tempPassword }) => {
    const greeting = studentName ? `Hej ${studentName}!` : "Hej!";
    const subject = "Välkommen till Mindful Learning — inloggningsuppgifter";
    const text = [
        greeting,
        "",
        "Du har fått ett konto i Mindful Learning. Logga in med uppgifterna nedan:",
        "",
        `E-post: ${email}`,
        `Tillfälligt lösenord: ${tempPassword}`,
        "",
        "Du måste byta lösenord första gången du loggar in.",
        "Logga in på: https://localhost:5173",
    ].join("\n");
    return { subject, text };
};

// ── Sollentuna trigger (requirement #26) ───────────────────────────────────

/**
 * Locate the Lärteamet brochure PDF when it is available so it can be attached
 * to the admission email. Looked up in order:
 *   1. LARTEAMET_PDF_PATH env var
 *   2. <repo>/backend/assets/folder-om-larteamet.pdf
 * Returns null when the file is not (yet) present — the email is still sent.
 * @returns {{ filename: string, path: string, contentType: string } | null}
 */
export const resolveLarteametBrochure = () => {
    const candidates = [
        process.env.LARTEAMET_PDF_PATH,
        path.join(__dirname, "..", "..", "assets", LARTEAMET_BROCHURE_FILE),
        path.resolve(process.cwd(), "assets", LARTEAMET_BROCHURE_FILE),
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) {
            return {
                filename: LARTEAMET_BROCHURE_FILE,
                path: candidate,
                contentType: "application/pdf",
            };
        }
    }
    return null;
};

/**
 * Normalize the municipality value as stored on Student:
 * either a plain string ("Sollentuna") or the schema subdocument { type: "Sollentuna" }.
 * @param {*} municipality
 * @returns {string|null}
 */
export const getStudentMunicipality = (municipality) => {
    if (!municipality) return null;
    if (typeof municipality === "string") return municipality;
    if (municipality.type) return municipality.type;
    return null;
};

/**
 * If the (newly created) student belongs to Sollentuna municipality, send the
 * Lärteamet admission email to the student's email address.
 *
 * Fires only on creation — callers are responsible for only invoking this for
 * new students (POST /student new-record branch, uploadXlsx upserted records).
 * Never throws; a failure is logged by sendEmail and reported in the result.
 *
 * @param {{ student?: Object, studentName?: string, email?: string }} args
 * @returns {Promise<{sent: boolean, reason?: string, result?: Object}>}
 */
export const maybeSendLarteametEmail = async ({
    student,
    studentName,
    email,
} = {}) => {
    const municipality = getStudentMunicipality(student?.municipality);

    if (municipality !== SOLLENTUNA_MUNICIPALITY) {
        return { sent: false, reason: "not_sollentuna" };
    }

    const recipientEmail = email || student?.email;
    if (!recipientEmail) {
        logger.warn(
            { municipality },
            "Sollentuna student has no email — Lärteamet email skipped"
        );
        return { sent: false, reason: "no_email" };
    }

    const { subject, text } = renderLarteametEmail({
        studentName: studentName || student?.name,
    });
    const brochure = resolveLarteametBrochure();
    const result = await sendEmail({
        to: recipientEmail,
        subject,
        text,
        ...(brochure ? { attachments: [brochure] } : {}),
    });
    return { sent: result.success, result, brochureAttached: !!brochure };
};
