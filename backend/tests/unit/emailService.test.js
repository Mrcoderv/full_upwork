import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import nodemailer from "nodemailer";
import fs from "node:fs";

vi.mock("nodemailer", () => ({
  __esModule: true,
  default: {
    createTransport: vi.fn(),
  },
}));

const sendMailMock = vi.fn();

const originalEnv = { ...process.env };

import {
  getTransporter,
  _resetEmailTransporter,
  sendEmail,
  renderLarteametEmail,
  renderMessageCopyEmail,
  maybeSendLarteametEmail,
  getStudentMunicipality,
  resolveLarteametBrochure,
  SOLLENTUNA_MUNICIPALITY,
  LARTEAMET_BROCHURE_FILE,
  isPlaceholderCredential,
} from "../../src/services/emailService.js";

const clearEnv = () => {
  delete process.env.GOOGLE_EMAIL;
  delete process.env.GOOGLE_PWD;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_SECURE;
  delete process.env.LARTEAMET_PDF_PATH;
};

beforeEach(() => {
  vi.clearAllMocks();
  clearEnv();
  _resetEmailTransporter();
  nodemailer.createTransport.mockReset();
  nodemailer.createTransport.mockReturnValue({ sendMail: sendMailMock });
  sendMailMock.mockReset();
  sendMailMock.mockResolvedValue({ messageId: "test-message-id" });
});

afterAll(() => {
  process.env = originalEnv;
});

describe("isPlaceholderCredential", () => {
  it("flags empty and known placeholders", () => {
    expect(isPlaceholderCredential("")).toBe(true);
    expect(isPlaceholderCredential("REPLACE_WITH_GOOGLE_APP_PASSWORD")).toBe(true);
    expect(isPlaceholderCredential("changeme123")).toBe(true);
    expect(isPlaceholderCredential("a-real-app-password")).toBe(false);
  });
});

describe("getTransporter", () => {
  it("uses Gmail SMTP when GOOGLE_PWD is a real app password", () => {
    process.env.GOOGLE_EMAIL = "test@mindful.se";
    process.env.GOOGLE_PWD = "real-app-password-1234";

    const { transportMode } = getTransporter();

    expect(transportMode).toBe("gmail");
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "Gmail",
        auth: { user: "test@mindful.se", pass: "real-app-password-1234" },
      })
    );
  });

  it("falls back to stream transport (no real delivery) for placeholder credentials", () => {
    process.env.GOOGLE_PWD = "REPLACE_WITH_GOOGLE_APP_PASSWORD";

    const { transportMode } = getTransporter();

    expect(transportMode).toBe("stream");
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ streamTransport: true })
    );
  });

  it("caches the transporter across calls", () => {
    process.env.GOOGLE_PWD = "real-app-password-1234";
    getTransporter();
    getTransporter();
    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
  });
});

describe("sendEmail", () => {
  it("sends with correct recipient, subject and content", async () => {
    process.env.GOOGLE_PWD = "real-app-password-1234";

    const result = await sendEmail({
      to: "student@sollentuna.se",
      subject: "Välkommen till Lärteamet",
      text: "Hej!",
    });

    expect(result).toMatchObject({ success: true, messageId: "test-message-id", transportMode: "gmail" });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "student@sollentuna.se",
        subject: "Välkommen till Lärteamet",
        text: "Hej!",
        from: expect.stringContaining("Mindful Learning"),
      })
    );
  });

  it("returns missing_fields without sending when to/subject absent", async () => {
    const result = await sendEmail({ to: "", subject: "x" });

    expect(result).toMatchObject({ success: false, reason: "missing_fields" });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("does NOT throw when the transporter rejects — logs and returns failure", async () => {
    process.env.GOOGLE_PWD = "real-app-password-1234";
    sendMailMock.mockRejectedValue(new Error("SMTP connection refused"));

    const result = await sendEmail({ to: "a@b.se", subject: "Hej" });

    expect(result).toMatchObject({ success: false, transportMode: "gmail" });
    expect(result.error).toContain("SMTP connection refused");
  });
});

describe("renderLarteametEmail", () => {
  it("renders a complete Swedish admission email about Lärteamet", () => {
    const { subject, text } = renderLarteametEmail({ studentName: "Anna Andersson" });

    expect(subject).toContain("Lärteamet");
    expect(subject).toContain("Sollentuna");
    expect(text).toContain("Anna Andersson");
    expect(text).toContain("Lärteamet");
    expect(text).toContain("Sollentuna kommun");
    expect(text).toContain("stöd");
    expect(text).toContain(LARTEAMET_BROCHURE_FILE);
    expect(text).not.toContain("PLACEHOLDER");
  });

  it("greets without a name and uses the default contact address", () => {
    const { subject, text } = renderLarteametEmail();

    expect(subject).toBeTruthy();
    expect(text).toContain("Hej!");
    expect(text).toContain("larteamet@sollentuna.se");
  });

  it("supports an explicit contact address override", () => {
    const { text } = renderLarteametEmail({ contactEmail: "stod@sollentuna.se" });
    expect(text).toContain("stod@sollentuna.se");
  });
});

describe("resolveLarteametBrochure", () => {
  it("returns null when no brochure is present", () => {
    expect(resolveLarteametBrochure()).toBeNull();
  });

  it("resolves the brochure via LARTEAMET_PDF_PATH", () => {
    const file = "/tmp/opencode/folder-om-larteamet.pdf";
    fs.writeFileSync(file, "%PDF-1.4 test");
    process.env.LARTEAMET_PDF_PATH = file;

    const brochure = resolveLarteametBrochure();

    expect(brochure).toMatchObject({
      filename: LARTEAMET_BROCHURE_FILE,
      path: file,
      contentType: "application/pdf",
    });
    fs.unlinkSync(file);
  });
});

describe("renderMessageCopyEmail", () => {
  it("includes sender name and message body", () => {
    const { subject, text } = renderMessageCopyEmail({
      senderName: "Eva Nahi",
      messageBody: "Kom ihåg att lämna in uppgiften!",
    });

    expect(subject).toBeTruthy();
    expect(text).toContain("Eva Nahi");
    expect(text).toContain("Kom ihåg att lämna in uppgiften!");
  });
});

describe("getStudentMunicipality", () => {
  it("handles string, subdocument and missing values", () => {
    expect(getStudentMunicipality("Sollentuna")).toBe("Sollentuna");
    expect(getStudentMunicipality({ type: "Sollentuna" })).toBe("Sollentuna");
    expect(getStudentMunicipality({ type: "Solna" })).toBe("Solna");
    expect(getStudentMunicipality(null)).toBeNull();
    expect(getStudentMunicipality(undefined)).toBeNull();
  });
});

describe("maybeSendLarteametEmail", () => {
  it("sends exactly one email for a Sollentuna student", async () => {
    process.env.GOOGLE_PWD = "real-app-password-1234";
    const student = { name: "Anna Andersson", email: "anna@sollentuna.se", municipality: { type: SOLLENTUNA_MUNICIPALITY } };

    const result = await maybeSendLarteametEmail({ student });

    expect(result.sent).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe("anna@sollentuna.se");
    expect(call.subject).toContain("Lärteamet");
  });

  it("sends nothing for a non-Sollentuna student", async () => {
    const student = { name: "Berta Berg", email: "berta@solna.se", municipality: { type: "Solna" } };

    const result = await maybeSendLarteametEmail({ student });

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("not_sollentuna");
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("sends nothing for a Sollentuna student without an email address", async () => {
    const student = { name: "Calle", municipality: { type: SOLLENTUNA_MUNICIPALITY } };

    const result = await maybeSendLarteametEmail({ student });

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("no_email");
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("accepts an explicit email/name override (bulk-upload path)", async () => {
    process.env.GOOGLE_PWD = "real-app-password-1234";

    const result = await maybeSendLarteametEmail({
      student: { municipality: SOLLENTUNA_MUNICIPALITY },
      studentName: "Doris Dahl",
      email: "doris@sollentuna.se",
    });

    expect(result.sent).toBe(true);
    expect(sendMailMock.mock.calls[0][0].to).toBe("doris@sollentuna.se");
  });

  it("attaches the Lärteamet brochure when it is available", async () => {
    process.env.GOOGLE_PWD = "real-app-password-1234";
    const file = "/tmp/opencode/folder-om-larteamet.pdf";
    fs.writeFileSync(file, "%PDF-1.4 test brochure");
    process.env.LARTEAMET_PDF_PATH = file;
    const student = { name: "Emma Ek", email: "emma@sollentuna.se", municipality: SOLLENTUNA_MUNICIPALITY };

    const result = await maybeSendLarteametEmail({ student });

    expect(result.sent).toBe(true);
    expect(result.brochureAttached).toBe(true);
    expect(sendMailMock.mock.calls[0][0].attachments).toEqual([
      expect.objectContaining({
        filename: LARTEAMET_BROCHURE_FILE,
        path: file,
        contentType: "application/pdf",
      }),
    ]);
    fs.unlinkSync(file);
  });

  it("sends without an attachment when the brochure is not present", async () => {
    process.env.GOOGLE_PWD = "real-app-password-1234";
    const student = { name: "Filip Frisk", email: "filip@sollentuna.se", municipality: SOLLENTUNA_MUNICIPALITY };

    const result = await maybeSendLarteametEmail({ student });

    expect(result.sent).toBe(true);
    expect(result.brochureAttached).toBe(false);
    expect(sendMailMock.mock.calls[0][0].attachments).toBeUndefined();
  });
});
