import { Router } from "express";
import { z } from "zod";
import {
  approveProfileChangeRequestController,
  createProfileChangeRequestController,
  listPendingProfileChangeRequestsController,
  rejectProfileChangeRequestController
} from "../controllers/profile.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";
import { profileSchema } from "../utils/validation";

const router = Router();
const idParams = z.object({
  id: z.string().trim().min(1)
});

const profileChangeRequestSchema = {
  body: z.object({
    profile: profileSchema
  })
};

const decisionSchema = {
  params: idParams,
  body: z.object({
    comment: z.string().trim().max(512).optional()
  })
};

router.post(
  "/",
  requireAuth,
  requireRoles("PROJECT_MANAGER", "DEVELOPER"),
  validateRequest(profileChangeRequestSchema),
  createProfileChangeRequestController
);
router.get("/", requireAuth, requireRoles("PM"), listPendingProfileChangeRequestsController);
router.post(
  "/:id/approve",
  requireAuth,
  requireRoles("PM"),
  validateRequest(decisionSchema),
  approveProfileChangeRequestController
);
router.post(
  "/:id/reject",
  requireAuth,
  requireRoles("PM"),
  validateRequest(decisionSchema),
  rejectProfileChangeRequestController
);

export default router;
