import { Router } from "express";
import { z } from "zod";
import { listProjectManagersController, listDevelopersController } from "../controllers/invitations.controller";
import {
  deleteProductManagerController,
  listProductManagersController,
  updateProductManagerController
} from "../controllers/productManagers.controller";
import { createVendorContactController } from "../controllers/vendorContacts.controller";
import { listVpDirectoryController } from "../controllers/vpDirectory.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";
import { profileSchema } from "../utils/validation";

const router = Router();
const productManagerIdParams = z.object({
  id: z.string().trim().min(1)
});

const updateProductManagerSchema = {
  params: productManagerIdParams,
  body: z
    .object({
      email: z.string().trim().email().optional(),
      companyId: z.string().trim().min(1).optional(),
      profile: profileSchema.partial().optional(),
      isActive: z.boolean().optional(),
      vpUserId: z.string().trim().min(1).optional(),
      preferredCompanyIds: z.array(z.string().trim().min(1)).optional()
    })
    .refine(
      (payload) =>
        Boolean(payload.email) ||
        Boolean(payload.companyId) ||
        payload.isActive !== undefined ||
        (payload.profile && Object.keys(payload.profile).length > 0) ||
        Boolean(payload.vpUserId) ||
        Array.isArray(payload.preferredCompanyIds),
      { message: "At least one field must be provided." }
    )
};

const vendorContactSchema = {
  body: z.object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    companyId: z.string().trim().min(1),
    profile: profileSchema
  })
};

router.get("/project-managers", requireAuth, requireRoles("PM", "SUPER_ADMIN"), listProjectManagersController);
router.post(
  "/project-managers",
  requireAuth,
  requireRoles("SUPER_ADMIN"),
  validateRequest(vendorContactSchema),
  createVendorContactController
);
router.get("/developers", requireAuth, requireRoles("PROJECT_MANAGER"), listDevelopersController);
router.get("/product-managers", requireAuth, requireRoles("SUPER_ADMIN"), listProductManagersController);
router.patch(
  "/product-managers/:id",
  requireAuth,
  requireRoles("SUPER_ADMIN"),
  validateRequest(updateProductManagerSchema),
  updateProductManagerController
);
router.delete(
  "/product-managers/:id",
  requireAuth,
  requireRoles("SUPER_ADMIN"),
  validateRequest({ params: productManagerIdParams }),
  deleteProductManagerController
);
router.get("/vps", requireAuth, requireRoles("SUPER_ADMIN"), listVpDirectoryController);

export default router;
