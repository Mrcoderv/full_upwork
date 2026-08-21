// router/faqRoutes.js
//
// Chatbot FAQ / Knowledge Base management.
//
// Read endpoints (active content only) are available to every authenticated
// user — the student chatbot uses them to render categories and questions.
// Management endpoints are role-guarded:
//   - Categories: admin/systemadmin and teachers may create; only
//                 admin/systemadmin may update or delete.
//   - FAQs:       admin/systemadmin manage everything; teachers may create
//                 FAQs and edit/deactivate/delete only their own.
import { Router } from "express";
import { isAuthenticated } from "../middleware/auth.js";
import { validateId } from "../middleware/validation.js";
import { recordAudit } from "../utils/auditLog.js";
import logger from "../utils/logger.js";
import faqService, { FaqValidationError } from "../services/faqService.js";

const router = Router();

const ADMIN_ROLES = ["admin", "systemadmin"];
const STAFF_ROLES = [...ADMIN_ROLES, "teacher"];

const isStaffUser = (user) =>
  ADMIN_ROLES.some((role) => user?.roles?.includes(role) || user?.role === role);

const canCreateCategory = (user) =>
  STAFF_ROLES.some((role) => user?.roles?.includes(role) || user?.role === role);

const handleError = (res, err, context) => {
  if (err instanceof FaqValidationError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  logger.error({ err }, context);
  return res.status(500).json({ error: "Ett internt fel uppstod. Vänligen försök igen." });
};

// ─── Public read (student chatbot; active content only) ─────────────────────

// GET /api/chatbot/faq/categories – active categories for the chatbot picker
router.get("/chatbot/faq/categories", isAuthenticated, async (req, res) => {
  try {
    const categories = await faqService.getPublicCategories();
    return res.json({ categories });
  } catch (err) {
    return handleError(res, err, "Error listing public FAQ categories");
  }
});

// GET /api/chatbot/faq/categories/:id/questions – active FAQs in a category
router.get(
  "/chatbot/faq/categories/:id/questions",
  isAuthenticated,
  validateId("id"),
  async (req, res) => {
    try {
      const result = await faqService.getPublicFaqsByCategory(req.params.id, {
        page: req.query.page,
        limit: req.query.limit,
      });
      return res.json(result);
    } catch (err) {
      return handleError(res, err, "Error listing public FAQs");
    }
  }
);

// GET /api/chatbot/faq/questions/:id – single active FAQ (verified answer)
router.get("/chatbot/faq/questions/:id", isAuthenticated, validateId("id"), async (req, res) => {
  try {
    const faq = await faqService.getFaqById(req.params.id);
    if (!isStaffUser(req.user) && faq.status !== "active") {
      return res.status(404).json({ error: "Frågan hittades inte." });
    }
    return res.json({ faq });
  } catch (err) {
    return handleError(res, err, "Error fetching public FAQ");
  }
});

// ─── Category management (create: admin/teacher, update/delete: admin) ──────

router.get("/chatbot/faq/manage/categories", isAuthenticated, async (req, res) => {
  try {
    // Teachers get the active list so they can pick a category when creating
    // FAQs; full management (including inactive) is admin-only.
    const includeInactive = isStaffUser(req.user);
    const categories = await faqService.listCategories({ includeInactive });
    return res.json({ categories });
  } catch (err) {
    return handleError(res, err, "Error listing FAQ categories");
  }
});

router.post(
  "/chatbot/faq/manage/categories",
  isAuthenticated,
  async (req, res, next) => {
    if (!canCreateCategory(req.user)) {
      return res.status(403).json({ error: "Du har inte behörighet att skapa kategorier." });
    }
    return next();
  },
  async (req, res) => {
    try {
      const { name, description, displayOrder, status } = req.body || {};
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: "Kategorinamn är obligatoriskt." });
      }
      // Teachers create active categories with default ordering; only admins
      // control visibility and display order.
      const payload = isStaffUser(req.user)
        ? { name, description, displayOrder, status }
        : { name, description };
      const category = await faqService.createCategory(payload, req.user);
      await recordAudit(req, {
        entityType: "FaqCategory",
        entityId: category._id.toString(),
        action: "create",
        description: `Skapade chattbot-kategorin "${category.name}"`,
      });
      return res.status(201).json({ category });
    } catch (err) {
      return handleError(res, err, "Error creating FAQ category");
    }
  }
);

router.put(
  "/chatbot/faq/manage/categories/:id",
  isAuthenticated,
  validateId("id"),
  async (req, res, next) => {
    if (!isStaffUser(req.user)) {
      return res.status(403).json({ error: "Endast administratörer får hantera kategorier." });
    }
    return next();
  },
  async (req, res) => {
    try {
      const { name, description, displayOrder, status } = req.body || {};
      const category = await faqService.updateCategory(
        req.params.id,
        { name, description, displayOrder, status },
        req.user
      );
      await recordAudit(req, {
        entityType: "FaqCategory",
        entityId: category._id.toString(),
        action: "update",
        description: `Uppdaterade chattbot-kategorin "${category.name}"`,
      });
      return res.json({ category });
    } catch (err) {
      return handleError(res, err, "Error updating FAQ category");
    }
  }
);

router.delete(
  "/chatbot/faq/manage/categories/:id",
  isAuthenticated,
  validateId("id"),
  async (req, res, next) => {
    if (!isStaffUser(req.user)) {
      return res.status(403).json({ error: "Endast administratörer får hantera kategorier." });
    }
    return next();
  },
  async (req, res) => {
    try {
      await faqService.deleteCategory(req.params.id);
      await recordAudit(req, {
        entityType: "FaqCategory",
        entityId: req.params.id,
        action: "delete",
        description: "Tog bort en chattbot-kategori",
      });
      return res.json({ success: true });
    } catch (err) {
      return handleError(res, err, "Error deleting FAQ category");
    }
  }
);

// ─── FAQ management ─────────────────────────────────────────────────────────

router.get("/chatbot/faq/manage/questions", isAuthenticated, hasStaffRole, async (req, res) => {
  try {
    const result = await faqService.listFaqs({
      page: req.query.page,
      limit: req.query.limit,
      categoryId: req.query.categoryId,
      status: req.query.status,
      createdBy: req.query.createdBy,
      search: req.query.search,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err, "Error listing managed FAQs");
  }
});

function hasStaffRole(req, res, next) {
  if (!STAFF_ROLES.some((role) => req.user?.roles?.includes(role) || req.user?.role === role)) {
    return res.status(403).json({ error: "Du har inte behörighet att hantera frågor." });
  }
  return next();
}

router.post("/chatbot/faq/manage/questions", isAuthenticated, hasStaffRole, async (req, res) => {
  try {
    const faq = await faqService.createFaq(req.body || {}, req.user);
    await recordAudit(req, {
      entityType: "Faq",
      entityId: faq._id.toString(),
      action: "create",
      description: `Skapade chattbot-frågan "${faq.question}"`,
    });
    return res.status(201).json({ faq });
  } catch (err) {
    return handleError(res, err, "Error creating FAQ");
  }
});

router.get(
  "/chatbot/faq/manage/questions/:id",
  isAuthenticated,
  validateId("id"),
  hasStaffRole,
  async (req, res) => {
    try {
      const faq = await faqService.getFaqById(req.params.id);
      if (!faqService.canModifyFaq(req.user, faq)) {
        return res.status(403).json({ error: "Du får bara visa egna frågor i detalj." });
      }
      return res.json({ faq });
    } catch (err) {
      return handleError(res, err, "Error fetching managed FAQ");
    }
  }
);

router.put(
  "/chatbot/faq/manage/questions/:id",
  isAuthenticated,
  validateId("id"),
  hasStaffRole,
  async (req, res) => {
    try {
      const faq = await faqService.updateFaq(req.params.id, req.body || {}, req.user);
      await recordAudit(req, {
        entityType: "Faq",
        entityId: faq._id.toString(),
        action: "update",
        description: `Uppdaterade chattbot-frågan "${faq.question}"`,
      });
      return res.json({ faq });
    } catch (err) {
      return handleError(res, err, "Error updating FAQ");
    }
  }
);

router.delete(
  "/chatbot/faq/manage/questions/:id",
  isAuthenticated,
  validateId("id"),
  hasStaffRole,
  async (req, res) => {
    try {
      const faq = await faqService.deleteFaq(req.params.id, req.user);
      await recordAudit(req, {
        entityType: "Faq",
        entityId: faq._id.toString(),
        action: "delete",
        description: `Tog bort chattbot-frågan "${faq.question}"`,
      });
      return res.json({ success: true });
    } catch (err) {
      return handleError(res, err, "Error deleting FAQ");
    }
  }
);

export default router;
