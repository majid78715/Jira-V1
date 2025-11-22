import { Router } from "express";
import { z } from "zod";
import {
  createCompanyHolidayController,
  deleteCompanyHolidayController,
  listCompanyHolidaysController,
  updateCompanyHolidayController
} from "../controllers/companyHolidays.controller";
import { requireAuth } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

const idParams = z.object({
  id: z.string().trim().min(1)
});

const isoDateSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date.");

const baseHolidaySchema = z.object({
  name: z.string().trim().min(2),
  calendarName: z.string().trim().min(2),
  date: isoDateSchema,
  companyId: z.string().trim().optional(),
  vendorId: z.string().trim().optional(),
  isFullDay: z.boolean().optional(),
  partialStartTimeUtc: z.string().trim().optional(),
  partialEndTimeUtc: z.string().trim().optional(),
  recurrenceRule: z.string().trim().optional(),
  countryCode: z.string().trim().max(4).optional()
});

const createHolidaySchema = {
  body: baseHolidaySchema
};

const updateHolidaySchema = {
  params: idParams,
  body: baseHolidaySchema.partial().refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided."
  })
};

router.get("/", requireAuth, listCompanyHolidaysController);
router.post("/", requireAuth, validateRequest(createHolidaySchema), createCompanyHolidayController);
router.patch("/:id", requireAuth, validateRequest(updateHolidaySchema), updateCompanyHolidayController);
router.delete("/:id", requireAuth, validateRequest({ params: idParams }), deleteCompanyHolidayController);

export default router;
