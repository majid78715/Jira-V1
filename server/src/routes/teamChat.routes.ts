import { Router } from "express";
import { z } from "zod";
import {
  createTeamChatMessageController,
  createTeamChatRoomController,
  deleteTeamChatRoomController,
  ensureDirectTeamChatRoomController,
  getTeamChatMessagesController,
  listTeamChatRoomsController
} from "../controllers/teamChat.controller";
import { requireAuth } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

const roomParams = z.object({
  roomId: z.string().trim().min(1)
});

const listMessagesQuery = z.object({
  limit: z.coerce.number().min(1).max(200).optional()
});

const createMessageBody = z.object({
  body: z.string().trim().min(1),
  mentions: z.array(z.string().trim().min(1)).optional()
});

const createRoomBody = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().max(240).optional(),
  topic: z.string().trim().max(240).optional()
});

const directRoomParams = z.object({
  userId: z.string().trim().min(1)
});

router.use(requireAuth);
router.get("/rooms", listTeamChatRoomsController);
router.post("/rooms", validateRequest({ body: createRoomBody }), createTeamChatRoomController);
router.get(
  "/rooms/:roomId/messages",
  validateRequest({ params: roomParams, query: listMessagesQuery }),
  getTeamChatMessagesController
);
router.post(
  "/rooms/:roomId/messages",
  validateRequest({ params: roomParams, body: createMessageBody }),
  createTeamChatMessageController
);
router.post(
  "/direct/:userId",
  validateRequest({ params: directRoomParams }),
  ensureDirectTeamChatRoomController
);
router.delete(
  "/rooms/:roomId",
  validateRequest({ params: roomParams }),
  deleteTeamChatRoomController
);

export default router;
