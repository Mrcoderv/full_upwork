import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("axios", () => ({
  __esModule: true,
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

import axios from "axios";
import {
  getPersonalToken,
  createDocument,
  setDocumentFile,
  updateDocument,
  startSigning,
  getDocument,
  isScriveConfigured,
  getScriveAuthHeader,
  getScriveBaseUrl,
  mapScriveStatus,
  SCRIVE_TERMINAL_STATUSES,
} from "../../src/services/scriveClient.js";

const TOKENS = {
  SCRIVE_APITOKEN: "apitok_1",
  SCRIVE_APISECRET: "apisecret_1",
  SCRIVE_ACCESSTOKEN: "acctok_1",
  SCRIVE_ACCESSECRET: "accsecret_1",
};

beforeEach(() => {
  vi.stubEnv("SCRIVE_APITOKEN", TOKENS.SCRIVE_APITOKEN);
  vi.stubEnv("SCRIVE_APISECRET", TOKENS.SCRIVE_APISECRET);
  vi.stubEnv("SCRIVE_ACCESSTOKEN", TOKENS.SCRIVE_ACCESSTOKEN);
  vi.stubEnv("SCRIVE_ACCESSECRET", TOKENS.SCRIVE_ACCESSECRET);
  vi.stubEnv("SCRIVE_API_BASE_URL", "https://api-testbed.scrive.com");
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isScriveConfigured", () => {
  it("returns false when any credential is missing", () => {
    vi.stubEnv("SCRIVE_APITOKEN", "");
    expect(isScriveConfigured()).toBe(false);
  });

  it("returns true when all credentials are set", () => {
    expect(isScriveConfigured()).toBe(true);
  });
});

describe("getScriveBaseUrl", () => {
  it("defaults to the testbed host when unset", () => {
    vi.unstubAllEnvs();
    expect(getScriveBaseUrl()).toBe("https://api-testbed.scrive.com");
  });

  it("strips trailing slashes", () => {
    vi.stubEnv("SCRIVE_API_BASE_URL", "https://scrive.com///");
    expect(getScriveBaseUrl()).toBe("https://scrive.com");
  });
});

describe("getScriveAuthHeader", () => {
  it("builds a PLAINTEXT OAuth header from the personal access credentials", () => {
    const header = getScriveAuthHeader();
    expect(header).toContain('oauth_signature_method="PLAINTEXT"');
    expect(header).toContain('oauth_consumer_key="apitok_1"');
    expect(header).toContain('oauth_token="acctok_1"');
    expect(header).toContain('oauth_signature="apisecret_1&accsecret_1"');
  });
});

describe("getPersonalToken", () => {
  it("posts email/password urlencoded and returns tokens", async () => {
    const tokens = { apitoken: "t1", apisecret: "s1", accesstoken: "a1", accesssecret: "c1" };
    axios.post.mockResolvedValue({ data: tokens });

    const result = await getPersonalToken({ email: "admin@example.se", password: "pw" });

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = axios.post.mock.calls[0];
    expect(url).toBe("https://api-testbed.scrive.com/api/v2/getpersonaltoken");
    expect(body).toBe("email=admin%40example.se&password=pw");
    expect(config.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(config.headers.Authorization).toBeUndefined();
    expect(result).toEqual(tokens);
  });

  it("supports the login_token method", async () => {
    axios.post.mockResolvedValue({ data: {} });
    await getPersonalToken({ loginToken: "tok" });
    const [, body] = axios.post.mock.calls[0];
    expect(body).toBe("login_token=tok");
  });
});

describe("createDocument", () => {
  it("posts the PDF as multipart form data with an auth header", async () => {
    axios.post.mockResolvedValue({ data: { id: "42", title: "Katalog" } });
    const buffer = Buffer.from("%PDF-1.4 test");

    const result = await createDocument({ fileBuffer: buffer, filename: "katalog.pdf" });

    const [url, form, config] = axios.post.mock.calls[0];
    expect(url).toBe("https://api-testbed.scrive.com/api/v2/documents/new");
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("saved")).toBe("true");
    const file = form.get("file");
    expect(file).toBeTruthy();
    expect(file.name).toBe("katalog.pdf");
    expect(file.type).toBe("application/pdf");
    expect(config.headers.Authorization).toContain("PLAINTEXT");
    expect(result.id).toBe("42");
  });
});

describe("setDocumentFile", () => {
  it("posts to /setfile with the file and optional object_version", async () => {
    axios.post.mockResolvedValue({ data: { id: "42" } });
    await setDocumentFile({ documentId: "42", fileBuffer: Buffer.from("%PDF"), filename: "a.pdf", objectVersion: 3 });

    const [url, form] = axios.post.mock.calls[0];
    expect(url).toBe("https://api-testbed.scrive.com/api/v2/documents/42/setfile");
    expect(form.get("file").name).toBe("a.pdf");
    expect(form.get("object_version")).toBe("3");
  });
});

describe("updateDocument", () => {
  it("posts the document JSON urlencoded with the document id", async () => {
    axios.post.mockResolvedValue({ data: { id: "42" } });
    const documentJson = { title: "Katalog", parties: [{ email: "l@e.se" }] };

    await updateDocument({ documentId: "42", documentJson });

    const [url, body, config] = axios.post.mock.calls[0];
    expect(url).toBe("https://api-testbed.scrive.com/api/v2/documents/42/update");
    expect(config.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(config.headers.Authorization).toContain("PLAINTEXT");
    const parsed = new URLSearchParams(body);
    expect(parsed.get("document_id")).toBe("42");
    expect(JSON.parse(parsed.get("document"))).toEqual(documentJson);
  });
});

describe("startSigning", () => {
  it("posts document_id urlencoded", async () => {
    axios.post.mockResolvedValue({ data: { id: "42", status: "pending" } });
    const result = await startSigning({ documentId: "42", strictValidations: true });

    const [url, body, config] = axios.post.mock.calls[0];
    expect(url).toBe("https://api-testbed.scrive.com/api/v2/documents/42/start");
    expect(config.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const parsed = new URLSearchParams(body);
    expect(parsed.get("document_id")).toBe("42");
    expect(parsed.get("strict_validations")).toBe("true");
    expect(result.status).toBe("pending");
  });

  it("omits strict_validations when not given", async () => {
    axios.post.mockResolvedValue({ data: {} });
    await startSigning({ documentId: "42" });
    const [, body] = axios.post.mock.calls[0];
    expect(new URLSearchParams(body).get("strict_validations")).toBeNull();
  });
});

describe("getDocument", () => {
  it("GETs the document metadata", async () => {
    axios.get.mockResolvedValue({ data: { id: "42", status: "closed" } });
    const result = await getDocument({ documentId: "42" });

    expect(axios.get).toHaveBeenCalledWith(
      "https://api-testbed.scrive.com/api/v2/documents/42/get",
      expect.objectContaining({ headers: { Authorization: expect.stringContaining("PLAINTEXT") } })
    );
    expect(result.status).toBe("closed");
  });
});

describe("mapScriveStatus", () => {
  it("maps Scrive document statuses to local statuses", () => {
    expect(mapScriveStatus("pending")).toBe("pending");
    expect(mapScriveStatus("closed")).toBe("closed");
    expect(mapScriveStatus("canceled")).toBe("canceled");
    expect(mapScriveStatus("timedout")).toBe("timedout");
    expect(mapScriveStatus("rejected")).toBe("rejected");
    expect(mapScriveStatus("document_error")).toBe("document_error");
    expect(mapScriveStatus("preparation")).toBe("uploaded");
    expect(mapScriveStatus("awaiting_start")).toBe("pending");
    expect(mapScriveStatus("some_unknown")).toBe("pending");
  });

  it("exposes the terminal statuses used to prevent re-sending", () => {
    expect(SCRIVE_TERMINAL_STATUSES).toContain("pending");
    expect(SCRIVE_TERMINAL_STATUSES).toContain("closed");
  });
});
