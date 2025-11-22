import { Router } from "express";
import { z } from "zod";
import {
  createAdminUserController,
  deleteAdminUserController,
  listAdminUsersController,
  patchAdminUserController
} from "../controllers/adminUsers.controller";
import { listRolePermissionsController, updateRolePermissionController } from "../controllers/rolePermissions.controller";
import { runAutomationController } from "../controllers/automation.controller";
import { getAiConfigController, updateAiConfigController } from "../controllers/adminSettings.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";
import { profileSchema } from "../utils/validation";

const roleValues = ["SUPER_ADMIN", "VP", "PM", "ENGINEER", "PROJECT_MANAGER", "DEVELOPER", "VIEWER"] as const;
const permissionModuleValues = [
  "dashboard",
  "projects",
  "tasks",
  "notifications",
  "teamDevelopers",
  "approvals",
  "alerts",
  "reports",
  "chat",
  "settings",
  "admin",
  "adminHolidays",
  "personas"
] as const;

const createAdminUserSchema = {
  body: z.object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    role: z.enum(roleValues),
    profile: profileSchema,
    companyId: z.string().trim().min(1).optional()
  })
};

const patchAdminUserSchema = {
  params: z.object({
    id: z.string().trim().min(1)
  }),
  body: z
    .object({
      email: z.string().trim().email().optional(),
      role: z.enum(roleValues).optional(),
      isActive: z.boolean().optional(),
      companyId: z.string().trim().min(1).optional(),
      profile: profileSchema.optional()
    })
    .refine(
      (payload) =>
        payload.role !== undefined ||
        payload.isActive !== undefined ||
        payload.profile !== undefined ||
        payload.companyId !== undefined ||
        payload.email !== undefined,
      {
        message: "At least one field must be provided."
      }
    )
};

const deleteAdminUserSchema = {
  params: z.object({
    id: z.string().trim().min(1)
  })
};

const rolePermissionsSchema = {
  body: z.object({
    role: z.enum(roleValues),
    modules: z.array(z.enum(permissionModuleValues)).default([])
  })
};

const aiConfigSchema = {
  body: z.object({
    provider: z.enum(["openai", "gemini", "claude", "local"]),
    apiKey: z.string().optional(),
    localUrl: z.string().optional(),
    modelName: z.string().optional()
  })
};

const router = Router();

router.use(requireAuth, requireRoles("SUPER_ADMIN"));
router.get("/users", listAdminUsersController);
router.post("/users", validateRequest(createAdminUserSchema), createAdminUserController);
router.patch("/users/:id", validateRequest(patchAdminUserSchema), patchAdminUserController);
router.delete("/users/:id", validateRequest(deleteAdminUserSchema), deleteAdminUserController);
router.get("/role-permissions", listRolePermissionsController);
router.post("/role-permissions", validateRequest(rolePermissionsSchema), updateRolePermissionController);
router.post("/run-automation", runAutomationController);
router.get("/ai-config", getAiConfigController);
router.put("/ai-config", validateRequest(aiConfigSchema), updateAiConfigController);

export default router;






