// services/scriveClient.js
//
// Thin wrapper around the Scrive eSign Document API v2.
//
// Auth: "Personal Access Credentials" (obtained via POST /api/v2/getpersonaltoken
// with a user's email/password). All Document API calls use an OAuth 1.0
// PLAINTEXT Authorization header built from those four tokens:
//   oauth_signature_method="PLAINTEXT"
//   oauth_consumer_key="${apitoken}"
//   oauth_token="${accesstoken}"
//   oauth_signature="${apisecret}&${accesssecret}"
//
// Non-file bodies are sent as application/x-www-form-urlencoded; file uploads
// as multipart/form-data (POST parameters are NOT placed in the URL).
//
// Endpoint reference: https://apidocs.scrive.com/
// Sandbox/testbed host: https://api-testbed.scrive.com
import axios from "axios";

const DEFAULT_BASE_URL = "https://api-testbed.scrive.com";

export const isScriveConfigured = () =>
  Boolean(
    process.env.SCRIVE_APITOKEN &&
      process.env.SCRIVE_APISECRET &&
      process.env.SCRIVE_ACCESSTOKEN &&
      process.env.SCRIVE_ACCESSECRET
  );

export const getScriveBaseUrl = () =>
  (process.env.SCRIVE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");

export const getScriveAuthHeader = () =>
  [
    `oauth_signature_method="PLAINTEXT"`,
    `oauth_consumer_key="${process.env.SCRIVE_APITOKEN || ""}"`,
    `oauth_token="${process.env.SCRIVE_ACCESSTOKEN || ""}"`,
    `oauth_signature="${process.env.SCRIVE_APISECRET || ""}&${process.env.SCRIVE_ACCESSECRET || ""}"`,
  ].join(",");

/**
 * Retrieve personal access credentials for a Scrive user account.
 * @param {{ email?: string, password?: string, loginToken?: string }} params
 * @returns {Promise<{apitoken, apisecret, accesstoken, accesssecret}>}
 */
export const getPersonalToken = async ({ email, password, loginToken } = {}) => {
  const params = new URLSearchParams();
  if (loginToken) params.append("login_token", loginToken);
  if (email) params.append("email", email);
  if (password) params.append("password", password);

  const { data } = await axios.post(
    `${getScriveBaseUrl()}/api/v2/getpersonaltoken`,
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return data;
};

const formHeaders = { "Content-Type": "application/x-www-form-urlencoded" };

/**
 * POST /api/v2/documents/new – create a document with the given PDF as main file.
 * Returns the document metadata JSON (incl. `id`).
 */
export const createDocument = async ({ fileBuffer, filename }) => {
  const form = new FormData();
  form.append("saved", "true");
  form.append("file", new Blob([fileBuffer], { type: "application/pdf" }), filename || "document.pdf");

  const { data } = await axios.post(`${getScriveBaseUrl()}/api/v2/documents/new`, form, {
    headers: { Authorization: getScriveAuthHeader() },
  });
  return data;
};

/**
 * POST /api/v2/documents/{id}/setfile – set/replace the main PDF of a document
 * in preparation. Returns the document metadata JSON.
 */
export const setDocumentFile = async ({ documentId, fileBuffer, filename, objectVersion }) => {
  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: "application/pdf" }), filename || "document.pdf");
  if (objectVersion !== undefined) form.append("object_version", String(objectVersion));

  const { data } = await axios.post(
    `${getScriveBaseUrl()}/api/v2/documents/${documentId}/setfile`,
    form,
    { headers: { Authorization: getScriveAuthHeader() } }
  );
  return data;
};

/**
 * POST /api/v2/documents/{id}/update – update document metadata (title, signatories,
 * callback URL) while in preparation. `documentJson` is the subset of the Document
 * JSON to apply. Returns the document metadata JSON.
 */
export const updateDocument = async ({ documentId, documentJson, objectVersion }) => {
  const params = new URLSearchParams();
  params.append("document", JSON.stringify(documentJson));
  params.append("document_id", String(documentId));
  if (objectVersion !== undefined) params.append("object_version", String(objectVersion));

  const { data } = await axios.post(
    `${getScriveBaseUrl()}/api/v2/documents/${documentId}/update`,
    params.toString(),
    { headers: { ...formHeaders, Authorization: getScriveAuthHeader() } }
  );
  return data;
};

/**
 * POST /api/v2/documents/{id}/start – start the signing process for a document
 * in preparation. Returns the document metadata JSON.
 */
export const startSigning = async ({ documentId, strictValidations }) => {
  const params = new URLSearchParams();
  params.append("document_id", String(documentId));
  if (strictValidations !== undefined) {
    params.append("strict_validations", strictValidations ? "true" : "false");
  }

  const { data } = await axios.post(
    `${getScriveBaseUrl()}/api/v2/documents/${documentId}/start`,
    params.toString(),
    { headers: { ...formHeaders, Authorization: getScriveAuthHeader() } }
  );
  return data;
};

/**
 * GET /api/v2/documents/{id}/get – fetch the full Document JSON for a document.
 */
export const getDocument = async ({ documentId }) => {
  const { data } = await axios.get(`${getScriveBaseUrl()}/api/v2/documents/${documentId}/get`, {
    headers: { Authorization: getScriveAuthHeader() },
  });
  return data;
};

/**
 * GET /api/v2/documents/{id}/files/main – fetch the signed main PDF document.
 * Returns a Buffer of the signed document.
 */
export const getSignedDocumentFile = async ({ documentId }) => {
  const response = await axios.get(
    `${getScriveBaseUrl()}/api/v2/documents/${documentId}/files/main`,
    {
      headers: { Authorization: getScriveAuthHeader() },
      responseType: "arraybuffer",
    }
  );
  return Buffer.from(response.data);
};

const STATUS_MAP = {
  preparation: "uploaded",
  awaiting_start: "pending",
  pending: "pending",
  closed: "closed",
  canceled: "canceled",
  timedout: "timedout",
  rejected: "rejected",
  document_error: "document_error",
};

export const SCRIVE_TERMINAL_STATUSES = ["pending", "closed", "canceled", "timedout", "rejected", "document_error"];

/**
 * Map a Scrive DocumentStatus to our local GradeCatalog status.
 */
export const mapScriveStatus = (scriveStatus) => STATUS_MAP[scriveStatus] || "pending";
