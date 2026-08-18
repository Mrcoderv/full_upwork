import { Router } from "express";
import logger from "../utils/logger.js";
import { isAuthenticated } from "../middleware/auth.js";
import chatbotService from "../services/chatbotService.impl.js";

const router = Router();

// POST /api/chatbot/ask - Ask the chatbot a question
router.post("/ask", isAuthenticated, async (req, res) => {
  try {
    const { question, courseInstanceId } = req.body;
    const studentId = req.user?.userId || req.user?.id;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        error: "Ogiltig fråga. Vänligen ställ en giltig fråga.",
      });
    }

    if (!studentId) {
      return res.status(401).json({
        error: "Inloggning krävs för att ställa frågor till chatten.",
      });
    }

    const result = await chatbotService.ask(studentId, question, courseInstanceId);

    res.json({
      success: true,
      data: {
        answer: result.answer,
        sources: result.sources,
        confidence: result.confidence,
        approved: result.approved,
      },
      sessionId: result.sessionId,
    });
  } catch (error) {
    logger.error({ err: error }, "Error in chatbot ask endpoint");
    res.status(500).json({
      error: "Ett fel uppstod vid bearbetning av din fråga. Vänligen försök igen.",
    });
  }
});

// GET /api/chatbot/status - Check chatbot service status
router.get("/status", isAuthenticated, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        status: "available",
        description: "Chatbot service is running",
        supportsExternalAI: true,
        // In a production system, this would indicate which AI provider is configured
        aiProvider: process.env.OPENAI_API_KEY ? "openai" : "knowledge-base-only",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error in chatbot status endpoint");
    res.status(500).json({
      error: "Ett fel uppstod vid statuskontroll.",
    });
  }
});

export default router;
