import { Router } from "express";
import { z } from "zod";
import {
  createCompanyController,
  listCompaniesController,
  updateCompanyController,
  deleteCompanyController
} from "../controllers/companies.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";
import { timeZoneSchema } from "../utils/validation";

const router = Router();
const companyTypes = ["HUMAIN", "VENDOR"] as const;

const slaSchema = z.object({
  responseTimeHours: z.number().nonnegative().optional(),
  resolutionTimeHours: z.number().nonnegative().optional(),
  notes: z.string().trim().max(512).optional()
});

const companyBaseSchema = z.object({
  name: z.string().trim().min(2),
  type: z.enum(companyTypes),
  description: z.string().trim().max(512).optional(),
  isActive: z.boolean().optional(),
  ceoUserId: z.string().trim().min(1).optional(),
  vendorOwnerUserId: z.string().trim().min(1).optional(),
  vendorCeoUserId: z.string().trim().min(1).optional(),
  region: z.string().trim().max(128).optional(),
  timeZone: timeZoneSchema.optional(),
  slaConfig: slaSchema.optional()
});

const idParamsSchema = z.object({
  id: z.string().trim().min(1)
});

router.get("/", requireAuth, listCompaniesController);
router.post(
  "/",
  requireAuth,
  requireRoles("SUPER_ADMIN"),
  validateRequest({ body: companyBaseSchema }),
  createCompanyController
);
router.patch(
  "/:id",
  requireAuth,
  requireRoles("SUPER_ADMIN"),
  validateRequest({ params: idParamsSchema, body: companyBaseSchema.partial() }),
  updateCompanyController
);
router.delete(
  "/:id",
  requireAuth,
  requireRoles("SUPER_ADMIN"),
  validateRequest({ params: idParamsSchema }),
  deleteCompanyController
);

export default router;
