import { Router } from "express";
import { z } from "zod";
import {
  approveTimesheetController,
  generateTimesheetController,
  listTimesheetsController,
  rejectTimesheetController,
  submitTimesheetController
} from "../controllers/timesheets.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();
const contributorRoles = ["DEVELOPER", "ENGINEER"] as const;
const approverRoles = ["PM", "PROJECT_MANAGER", "SUPER_ADMIN"] as const;
const idParams = z.object({
  id: z.string().trim().min(1)
});

const generateSchema = {
  body: z.object({
    weekStart: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date.")
      .optional()
  })
};

const rejectionSchema = {
  params: idParams,
  body: z.object({
    comment: z.string().trim().min(3)
  })
};

router.get("/", requireAuth, listTimesheetsController);
router.post(
  "/generate",
  requireAuth,
  requireRoles(...contributorRoles),
  validateRequest(generateSchema),
  generateTimesheetController
);
router.post(
  "/:id/submit",
  requireAuth,
  requireRoles(...contributorRoles),
  validateRequest({ params: idParams }),
  submitTimesheetController
);
router.post(
  "/:id/approve",
  requireAuth,
  requireRoles(...approverRoles),
  validateRequest({ params: idParams }),
  approveTimesheetController
);
router.post(
  "/:id/reject",
  requireAuth,
  requireRoles(...approverRoles),
  validateRequest(rejectionSchema),
  rejectTimesheetController
);

export default router;
