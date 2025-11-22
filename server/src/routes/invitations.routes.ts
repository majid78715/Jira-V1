import { Router } from "express";
import { z } from "zod";
import {
  inviteProjectManagerController,
  inviteDeveloperController,
  inviteProductManagerController,
  cancelInvitationController
} from "../controllers/invitations.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";
import { createRateLimiter } from "../middleware/rateLimit";

const router = Router();
const invitationLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many invitations created. Please wait before retrying.",
  keyGenerator: (req) => `${req.ip}:invitations`,
  skip: () => process.env.NODE_ENV === "test"
});

const projectManagerInviteSchema = {
  body: z.object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    companyId: z.string().trim().min(1)
  })
};

const developerInviteSchema = {
  body: z.object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1)
  })
};

const productManagerInviteSchema = {
  body: z.object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    companyId: z.string().trim().min(1),
    vpUserId: z.string().trim().min(1).optional(),
    preferredCompanyIds: z.array(z.string().trim().min(1)).optional()
  })
};

const invitationIdSchema = {
  params: z.object({
    id: z.string().trim().min(1)
  })
};

router.post(
  "/project-manager",
  requireAuth,
  requireRoles("PM"),
  invitationLimiter,
  validateRequest(projectManagerInviteSchema),
  inviteProjectManagerController
);
router.post(
  "/developer",
  requireAuth,
  requireRoles("PROJECT_MANAGER"),
  invitationLimiter,
  validateRequest(developerInviteSchema),
  inviteDeveloperController
);
router.post(
  "/product-manager",
  requireAuth,
  requireRoles("SUPER_ADMIN"),
  invitationLimiter,
  validateRequest(productManagerInviteSchema),
  inviteProductManagerController
);
router.delete(
  "/:id",
  requireAuth,
  requireRoles("SUPER_ADMIN", "PM", "PROJECT_MANAGER"),
  validateRequest(invitationIdSchema),
  cancelInvitationController
);

export default router;
