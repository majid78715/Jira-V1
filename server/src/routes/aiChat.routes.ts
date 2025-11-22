import { Router } from "express";
import { z } from "zod";
import {
  getChatSessionController,
  listChatSessionsController,
  sendChatMessageController
} from "../controllers/aiChat.controller";
import { requireAuth } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();
const sessionParams = z.object({
  sessionId: z.string().trim().min(1)
});

const sendMessageSchema = {
  body: z.object({
    message: z.string().trim().min(1),
    sessionId: z.string().trim().min(1).optional(),
    contextChips: z.array(z.string().trim().min(1)).optional()
  })
};

router.use(requireAuth);
router.get("/sessions", listChatSessionsController);
router.get("/sessions/:sessionId", validateRequest({ params: sessionParams }), getChatSessionController);
router.post("/message", validateRequest(sendMessageSchema), sendChatMessageController);

export default router;
