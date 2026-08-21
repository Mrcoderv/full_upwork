import mongoose from "mongoose";
import FaqCategory from "../models/FaqCategory.js";
import Faq, { FAQ_LIMITS } from "../models/Faq.js";
import { escapeRegExp } from "../utils/escapeRegExp.js";

const ADMIN_ROLES = ["admin", "systemadmin"];
const DEFAULT_PAGE_LIMIT = 10;
const MAX_PAGE_LIMIT = 100;

export class FaqValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const isStaff = (user) =>
  ADMIN_ROLES.some((role) => user?.roles?.includes(role) || user?.role === role);

const toObjectId = (value, field) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new FaqValidationError(`Ogiltigt ID för ${field}.`);
  }
  return new mongoose.Types.ObjectId(value);
};

const normalizePage = ({ page, limit }) => {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(
    Math.max(parseInt(limit, 10) || DEFAULT_PAGE_LIMIT, 1),
    MAX_PAGE_LIMIT
  );
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
};

const cleanStringArray = (value, maxItems, maxLength) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new FaqValidationError("Nyckelord och alternativa frågor ska anges som lista.");
  }
  const cleaned = value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
  const unique = [...new Set(cleaned.map((item) => item.toLowerCase()))]
    .map((lower) => cleaned.find((item) => item.toLowerCase() === lower));
  if (unique.length > maxItems) {
    throw new FaqValidationError(`Max ${maxItems} poster är tillåtna i listan.`);
  }
  for (const item of unique) {
    if (item.length > maxLength) {
      throw new FaqValidationError(`Poster får vara högst ${maxLength} tecken långa.`);
    }
  }
  return unique;
};

// ─── Categories ─────────────────────────────────────────────────────────────

export async function listCategories({ includeInactive = false } = {}) {
  const filter = includeInactive ? {} : { status: "active" };
  return FaqCategory.find(filter)
    .sort({ displayOrder: 1, name: 1 })
    .collation({ locale: "sv", strength: 2 })
    .lean();
}

export async function getCategoryById(id) {
  const category = await FaqCategory.findById(id).lean();
  if (!category) {
    throw new FaqValidationError("Kategorin hittades inte.", 404);
  }
  return category;
}

async function assertUniqueCategoryName(name, excludeId) {
  const filter = { _id: { $ne: excludeId }, name: name.trim() };
  const existing = await FaqCategory.findOne(filter)
    .collation({ locale: "sv", strength: 2 })
    .lean();
  if (existing) {
    throw new FaqValidationError(`En kategori med namnet "${name.trim()}" finns redan.`, 409);
  }
}

export async function createCategory(payload, user) {
  const { name, description, displayOrder, status } = payload;
  // Attribution always comes from the authenticated user, never the body.
  const userId = user?.userId;
  await assertUniqueCategoryName(name);
  try {
    return await FaqCategory.create({
      name: name.trim(),
      description: (description || "").trim(),
      displayOrder: Number.isFinite(Number(displayOrder)) ? Math.max(Number(displayOrder), 0) : 0,
      status: status === "inactive" ? "inactive" : "active",
      createdBy: userId,
      updatedBy: userId,
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw new FaqValidationError(`En kategori med namnet "${name.trim()}" finns redan.`, 409);
    }
    throw err;
  }
}

export async function updateCategory(id, payload, user) {
  const { name, description, displayOrder, status } = payload;
  const userId = user?.userId;
  const category = await FaqCategory.findById(id);
  if (!category) {
    throw new FaqValidationError("Kategorin hittades inte.", 404);
  }
  if (name !== undefined) {
    await assertUniqueCategoryName(name, category._id);
    category.name = name.trim();
  }
  if (description !== undefined) category.description = String(description).trim();
  if (displayOrder !== undefined) {
    const parsed = Number(displayOrder);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new FaqValidationError("Visningsordning ska vara ett icke-negativt heltal.");
    }
    category.displayOrder = parsed;
  }
  if (status !== undefined && !["active", "inactive"].includes(status)) {
    throw new FaqValidationError("Ogiltig status. Använd active eller inactive.");
  }
  if (status !== undefined) category.status = status;
  category.updatedBy = userId;
  await category.save();
  return category;
}

export async function deleteCategory(id) {
  const category = await FaqCategory.findById(id).lean();
  if (!category) {
    throw new FaqValidationError("Kategorin hittades inte.", 404);
  }
  // Never orphan FAQs: block deletion while the category still has questions.
  const faqCount = await Faq.countDocuments({
    categoryId: category._id,
    isDeleted: false,
  });
  if (faqCount > 0) {
    throw new FaqValidationError(
      `Kategorin kan inte tas bort eftersom den har ${faqCount} frågor. Flytta eller ta bort frågorna först.`,
      409
    );
  }
  await FaqCategory.findByIdAndDelete(id);
}

// ─── FAQs ───────────────────────────────────────────────────────────────────

async function assertCategoryExists(categoryId) {
  const category = await FaqCategory.findOne({
    _id: toObjectId(categoryId, "kategori"),
  }).lean();
  if (!category) {
    throw new FaqValidationError("Kategorin hittades inte.", 400);
  }
  return category;
}

async function assertNoDuplicateQuestion(categoryId, question, excludeId) {
  const filter = {
    _id: { $ne: excludeId },
    categoryId: toObjectId(categoryId, "kategori"),
    isDeleted: false,
    question: question.trim(),
  };
  const existing = await Faq.findOne(filter)
    .collation({ locale: "sv", strength: 2 })
    .lean();
  if (existing) {
    throw new FaqValidationError(
      "Det finns redan en fråga med samma formulering i denna kategori.",
      409
    );
  }
}

function validateFaqPayload({ question, answer, keywords, alternateQuestions, displayOrder }) {
  if (question !== undefined && (!question || !question.trim())) {
    throw new FaqValidationError("Frågan får inte vara tom.");
  }
  if (answer !== undefined && (!answer || !answer.trim())) {
    throw new FaqValidationError("Svaret får inte vara tomt.");
  }
  if (keywords !== undefined) cleanStringArray(keywords, FAQ_LIMITS.MAX_KEYWORDS, 60);
  if (alternateQuestions !== undefined) {
    cleanStringArray(alternateQuestions, FAQ_LIMITS.MAX_ALTERNATE_QUESTIONS, 500);
  }
  if (displayOrder !== undefined) {
    const parsed = Number(displayOrder);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new FaqValidationError("Prioritet/visningsordning ska vara ett icke-negativt heltal.");
    }
  }
}

/**
 * Management listing with pagination, search and filters.
 * Teachers may list all FAQs (read-only insight) but mutations are
 * ownership-checked separately; admins see everything.
 */
export async function listFaqs({ page, limit, categoryId, status, createdBy, search }) {
  const { page: safePage, limit: safeLimit, skip } = normalizePage({ page, limit });

  const filter = { isDeleted: false };
  if (categoryId) filter.categoryId = toObjectId(categoryId, "kategori");
  if (status === "active" || status === "inactive") filter.status = status;
  else if (status && status !== "all") {
    throw new FaqValidationError("Ogiltig status. Använd active, inactive eller all.");
  }
  if (createdBy) filter.createdBy = toObjectId(createdBy, "createdBy");

  if (search && search.trim()) {
    const pattern = new RegExp(escapeRegExp(search.trim()), "i");
    filter.$or = [
      { question: pattern },
      { answer: pattern },
      { keywords: pattern },
      { alternateQuestions: pattern },
    ];
  }

  const [total, items] = await Promise.all([
    Faq.countDocuments(filter),
    Faq.find(filter)
      .populate("categoryId", "name status")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort({ displayOrder: 1, updatedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
  ]);

  return {
    faqs: items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(Math.ceil(total / safeLimit), 1),
  };
}

export async function getFaqById(id) {
  const faq = await Faq.findOne({ _id: toObjectId(id, "faq"), isDeleted: false })
    .populate("categoryId", "name")
    .lean();
  if (!faq) {
    throw new FaqValidationError("Frågan hittades inte.", 404);
  }
  return faq;
}

/** Ownership rule: admins may modify any FAQ, teachers only their own. */
export function canModifyFaq(user, faq) {
  if (isStaff(user)) return true;
  return Boolean(faq?.createdBy && String(faq.createdBy) === String(user.userId));
}

export async function createFaq(payload, user) {
  validateFaqPayload(payload);
  if (!payload.question || !payload.answer || !payload.categoryId) {
    throw new FaqValidationError("Kategori, fråga och svar är obligatoriska.");
  }
  await assertCategoryExists(payload.categoryId);
  await assertNoDuplicateQuestion(payload.categoryId, payload.question);

  return Faq.create({
    categoryId: payload.categoryId,
    question: payload.question.trim(),
    answer: payload.answer.trim(),
    keywords: cleanStringArray(payload.keywords, FAQ_LIMITS.MAX_KEYWORDS, 60),
    alternateQuestions: cleanStringArray(
      payload.alternateQuestions,
      FAQ_LIMITS.MAX_ALTERNATE_QUESTIONS,
      500
    ),
    status: payload.status === "inactive" ? "inactive" : "active",
    displayOrder: Number.isFinite(Number(payload.displayOrder))
      ? Math.max(Number(payload.displayOrder), 0)
      : 0,
    createdBy: user.userId,
    updatedBy: user.userId,
  });
}

export async function updateFaq(id, payload, user) {
  const faq = await Faq.findOne({ _id: toObjectId(id, "faq"), isDeleted: false });
  if (!faq) {
    throw new FaqValidationError("Frågan hittades inte.", 404);
  }
  if (!canModifyFaq(user, faq)) {
    throw new FaqValidationError("Du får bara redigera egna frågor.", 403);
  }
  validateFaqPayload(payload);

  if (payload.categoryId !== undefined) {
    if (!payload.categoryId) throw new FaqValidationError("Kategori får inte vara tom.");
    await assertCategoryExists(payload.categoryId);
    faq.categoryId = payload.categoryId;
  }
  if (payload.question !== undefined) faq.question = payload.question.trim();
  if (payload.answer !== undefined) faq.answer = payload.answer.trim();
  if (payload.keywords !== undefined) {
    faq.keywords = cleanStringArray(payload.keywords, FAQ_LIMITS.MAX_KEYWORDS, 60);
  }
  if (payload.alternateQuestions !== undefined) {
    faq.alternateQuestions = cleanStringArray(
      payload.alternateQuestions,
      FAQ_LIMITS.MAX_ALTERNATE_QUESTIONS,
      500
    );
  }
  if (payload.displayOrder !== undefined) {
    faq.displayOrder = Math.max(Number(payload.displayOrder), 0);
  }
  if (payload.status !== undefined) {
    if (!["active", "inactive"].includes(payload.status)) {
      throw new FaqValidationError("Ogiltig status. Använd active eller inactive.");
    }
    faq.status = payload.status;
  }

  await assertNoDuplicateQuestion(faq.categoryId, faq.question, faq._id);

  faq.updatedBy = user.userId;
  await faq.save();
  return faq;
}

/** Soft delete so historical content can be restored and audited. */
export async function deleteFaq(id, user) {
  const faq = await Faq.findOne({ _id: toObjectId(id, "faq"), isDeleted: false });
  if (!faq) {
    throw new FaqValidationError("Frågan hittades inte.", 404);
  }
  if (!canModifyFaq(user, faq)) {
    throw new FaqValidationError("Du får bara ta bort egna frågor.", 403);
  }
  faq.isDeleted = true;
  faq.deletedAt = new Date();
  faq.status = "inactive";
  faq.updatedBy = user.userId;
  await faq.save();
  return faq;
}

// ─── Student / chatbot read APIs (active content only) ──────────────────────

export async function getPublicCategories() {
  return listCategories({ includeInactive: false });
}

export async function getPublicFaqsByCategory(categoryId, { page, limit } = {}) {
  const category = await assertCategoryExists(categoryId);
  // Inactive categories are hidden from students entirely – their content
  // must not leak through a direct category id call.
  if (category.status !== "active") {
    throw new FaqValidationError("Kategorin hittades inte.", 404);
  }
  const { page: safePage, limit: safeLimit, skip } = normalizePage({ page, limit });

  const filter = {
    categoryId: toObjectId(categoryId, "kategori"),
    status: "active",
    isDeleted: false,
  };
  const [total, faqs] = await Promise.all([
    Faq.countDocuments(filter),
    Faq.find(filter)
      .sort({ displayOrder: 1, updatedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select("categoryId question answer keywords displayOrder updatedAt")
      .lean(),
  ]);

  return {
    faqs,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(Math.ceil(total / safeLimit), 1),
  };
}

/**
 * Verified-answer lookup used as first priority in the chatbot ask flow.
 * Matches exact/alternate questions (case-insensitive) or keywords.
 * Returns null when nothing matches so callers fall back to existing behavior.
 */
export async function findMatchingFaq(question) {
  const trimmed = String(question || "").trim();
  if (!trimmed) return null;

  const baseFilter = { status: "active", isDeleted: false };

  // 1. Exact question / alternate question match
  const exact = await Faq.findOne({
    ...baseFilter,
    $or: [
      { question: trimmed },
      { alternateQuestions: trimmed },
    ],
  })
    .collation({ locale: "sv", strength: 2 })
    .sort({ displayOrder: 1, updatedAt: -1 })
    .populate("categoryId", "name")
    .lean();
  if (exact) return { faq: exact, matchType: "exact" };

  // 2. Keyword overlap: any stored keyword contained in the asked question
  const words = trimmed.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  if (words.length === 0) return null;

  const keywordPatterns = words.map((word) => new RegExp(escapeRegExp(word), "i"));
  const candidates = await Faq.find({
    ...baseFilter,
    keywords: { $in: keywordPatterns },
  })
    .sort({ displayOrder: 1, updatedAt: -1 })
    .limit(5)
    .populate("categoryId", "name")
    .lean();

  if (candidates.length === 0) return null;

  // Prefer the candidate matching the most distinct asked words.
  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const haystack = `${candidate.question} ${(candidate.keywords || []).join(" ")}`.toLowerCase();
    const score = words.filter((word) => haystack.includes(word)).length;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best ? { faq: best, matchType: "keyword" } : null;
}

export async function countFaqsByStatus() {
  const [active, inactive] = await Promise.all([
    Faq.countDocuments({ isDeleted: false, status: "active" }),
    Faq.countDocuments({ isDeleted: false, status: "inactive" }),
  ]);
  return { active, inactive };
}

export default {
  listCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  listFaqs,
  getFaqById,
  canModifyFaq,
  createFaq,
  updateFaq,
  deleteFaq,
  getPublicCategories,
  getPublicFaqsByCategory,
  findMatchingFaq,
  countFaqsByStatus,
  FaqValidationError,
};
