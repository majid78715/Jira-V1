import { Router } from "express";
import { z } from "zod";
import {
  approveLeaveController,
  createLeaveController,
  listLeaveController,
  rejectLeaveController,
  updateLeaveController
} from "../controllers/dayOffs.controller";
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

const isoTimestampSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid timestamp.");

const leaveBaseSchema = z.object({
  date: isoDateSchema,
  leaveType: z.enum(["ANNUAL", "SICK", "UNPAID", "EMERGENCY", "OTHER"] as const),
  isPartialDay: z.boolean().optional(),
  partialStartTimeUtc: isoTimestampSchema.optional(),
  partialEndTimeUtc: isoTimestampSchema.optional(),
  reason: z.string().trim().max(1024).optional(),
  projectImpactNote: z.string().trim().max(1024).optional(),
  contactDetails: z.string().trim().max(512).optional(),
  backupContactUserId: z.string().trim().optional(),
  attachmentIds: z.array(z.string().trim()).optional(),
  saveAsDraft: z.boolean().optional()
});

const createLeaveSchema = {
  body: leaveBaseSchema.refine(
    (payload) => {
      if (payload.isPartialDay) {
        return Boolean(payload.partialStartTimeUtc && payload.partialEndTimeUtc);
      }
      return true;
    },
    { message: "Partial day leave requires start and end times." }
  )
};

const updateLeaveSchema = {
  params: idParams,
  body: leaveBaseSchema
    .partial()
    .extend({
      action: z.enum(["UPDATE", "CANCEL"]).optional()
    })
    .refine(
      (payload) => {
        if (payload.action === "UPDATE") {
          return Boolean(payload.date || payload.leaveType || payload.reason || payload.attachmentIds);
        }
        return true;
      },
      { message: "Update requires at least one field to change." }
    )
};

const approvalSchema = {
  params: idParams,
  body: z.object({
    comment: z.string().trim().max(1024).optional()
  })
};

router.get("/", requireAuth, listLeaveController);
router.post("/", requireAuth, validateRequest(createLeaveSchema), createLeaveController);
router.patch("/:id", requireAuth, validateRequest(updateLeaveSchema), updateLeaveController);
router.post("/:id/approve", requireAuth, validateRequest(approvalSchema), approveLeaveController);
router.post("/:id/reject", requireAuth, validateRequest(approvalSchema), rejectLeaveController);

export default router;
