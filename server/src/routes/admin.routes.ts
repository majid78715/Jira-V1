import { Router } from "express";
import { z } from "zod";
import {
  createAdminUserController,
  deleteAdminUserController,
  listAdminUsersController,
  patchAdminUserController
} from "../controllers/adminUsers.controller";
import { listRolePermissionsController, updateRolePermissionController } from "../controllers/rolePermissions.controller";
import { listRolesController, createRoleController, deleteRoleController } from "../controllers/roles.controller";
import { runAutomationController } from "../controllers/automation.controller";
import { getAiConfigController, updateAiConfigController } from "../controllers/adminSettings.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";
import { profileSchema } from "../utils/validation";

// We allow string for role to support custom roles
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
    role: z.string().min(1),
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
      role: z.string().min(1).optional(),
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
    role: z.string().min(1),
    modules: z.array(z.enum(permissionModuleValues)).default([])
  })
};

const createRoleSchema = {
  body: z.object({
    name: z.string().trim().min(1).regex(/^[A-Z0-9_]+$/, "Role name must be uppercase alphanumeric with underscores"),
    description: z.string().optional()
  })
};

const deleteRoleSchema = {
  params: z.object({
    roleName: z.string().trim().min(1)
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

// Role Management
router.get("/roles", listRolesController);
router.post("/roles", validateRequest(createRoleSchema), createRoleController);
router.delete("/roles/:roleName", validateRequest(deleteRoleSchema), deleteRoleController);

router.get("/role-permissions", listRolePermissionsController);
router.post("/role-permissions", validateRequest(rolePermissionsSchema), updateRolePermissionController);
router.post("/run-automation", runAutomationController);
router.get("/ai-config", getAiConfigController);
router.put("/ai-config", validateRequest(aiConfigSchema), updateAiConfigController);

export default router;






