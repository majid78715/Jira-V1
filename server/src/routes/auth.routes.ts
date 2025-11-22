import { Router } from "express";
import { z } from "zod";
import {
  loginController,
  impersonateController,
  currentUserController,
  logoutController,
  changePasswordFirstLoginController,
  changePasswordController
} from "../controllers/auth.controller";
import { acceptInvitationController } from "../controllers/invitations.controller";
import { requireAuth } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";
import { profileSchema } from "../utils/validation";
import { createRateLimiter } from "../middleware/rateLimit";
import { MIN_PASSWORD_LENGTH } from "../services/user.service";

const skipRateLimitInTest = () => process.env.NODE_ENV === "test";

const loginSchema = {
  body: z.object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    password: z.string().min(8)
  })
};

const impersonateSchema = {
  body: z.object({
    userId: z.string().min(1)
  })
};

const acceptInvitationSchema = {
  body: z.object({
    token: z.string().trim().min(1),
    password: z.string().min(8),
    profile: profileSchema
  })
};

const changePasswordFirstLoginSchema = {
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH),
    confirmNewPassword: z.string().min(MIN_PASSWORD_LENGTH)
  })
};

const changePasswordSchema = {
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH),
    confirmNewPassword: z.string().min(MIN_PASSWORD_LENGTH)
  })
};

const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many login attempts. Please wait a minute.",
  keyGenerator: (req) => `${req.ip}:auth`,
  skip: skipRateLimitInTest
});

const invitationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: "Too many invitation attempts. Please wait before retrying.",
  keyGenerator: (req) => `${req.ip}:invitation`,
  skip: skipRateLimitInTest
});

const router = Router();

router.post("/login", authRateLimiter, validateRequest(loginSchema), loginController);
router.post("/impersonate", validateRequest(impersonateSchema), impersonateController);
router.post("/accept-invitation", invitationRateLimiter, validateRequest(acceptInvitationSchema), acceptInvitationController);
router.get("/me", requireAuth, currentUserController);
router.post("/logout", requireAuth, logoutController);
router.post(
  "/change-password-first-login",
  requireAuth,
  validateRequest(changePasswordFirstLoginSchema),
  changePasswordFirstLoginController
);
router.post("/change-password", requireAuth, validateRequest(changePasswordSchema), changePasswordController);

export default router;
