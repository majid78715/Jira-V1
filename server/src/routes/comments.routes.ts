import { Router } from "express";
import { z } from "zod";
import { createCommentController, listCommentsController } from "../controllers/comments.controller";
import { requireAuth } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();
const entityTypes = ["TASK", "TIMESHEET"] as const;

const createCommentSchema = {
  body: z.object({
    entityId: z.string().trim().min(1),
    entityType: z.enum(entityTypes),
    body: z.string().trim().min(1),
    attachmentIds: z.array(z.string().trim().min(1)).optional()
  })
};

router.use(requireAuth);
router.get("/", listCommentsController);
router.post("/", validateRequest(createCommentSchema), createCommentController);

export default router;
