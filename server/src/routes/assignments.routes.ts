import { Router } from "express";
import { z } from "zod";
import {
  cancelAssignmentController,
  createAssignmentController,
  listAssignmentsController,
  approveCompletionController
} from "../controllers/assignments.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();
const idParams = z.object({
  id: z.string().trim().min(1)
});

const createAssignmentSchema = {
  body: z.object({
    taskId: z.string().trim().min(1),
    developerId: z.string().trim().min(1),
    note: z.string().trim().max(1024).optional()
  })
};

const cancelSchema = {
  params: idParams,
  body: z.object({
    reason: z.string().trim().max(512).optional()
  })
};

router.get("/", requireAuth, listAssignmentsController);
router.post(
  "/",
  requireAuth,
  requireRoles("PROJECT_MANAGER", "PM"),
  validateRequest(createAssignmentSchema),
  createAssignmentController
);
router.post(
  "/:id/cancel",
  requireAuth,
  requireRoles("PM", "PROJECT_MANAGER"),
  validateRequest(cancelSchema),
  cancelAssignmentController
);
router.post(
  "/:id/approve-completion",
  requireAuth,
  requireRoles("PM", "PROJECT_MANAGER"),
  validateRequest({ params: idParams }),
  approveCompletionController
);

export default router;
