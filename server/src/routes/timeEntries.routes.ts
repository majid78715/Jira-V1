import { Router } from "express";
import { z } from "zod";
import {
  createTimeEntryController,
  listTimeEntriesController,
  updateTimeEntryController
} from "../controllers/timeEntries.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();
const timeRoles = ["DEVELOPER", "PM"] as const;
const dateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD.");
const timeSchema = z.string().trim().regex(/^([0-1]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm.");

const maxMinutesPerEntry = 12 * 60;

const createTimeEntrySchema = z
  .object({
    projectId: z.string().trim().min(1),
    taskId: z.string().trim().min(1),
    date: dateSchema,
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    minutes: z.number().int().min(1).max(maxMinutesPerEntry).optional(),
    hours: z.number().positive().max(12).optional(),
    note: z.string().trim().max(1024).optional(),
    workTypeCode: z.string().trim().max(64).optional(),
    billable: z.boolean().optional(),
    location: z.string().trim().max(128).optional(),
    costRate: z.number().nonnegative().optional(),
    costAmount: z.number().nonnegative().optional()
  })
  .superRefine((payload, ctx) => {
    const hasWindowFields = payload.startTime !== undefined || payload.endTime !== undefined;
    const hasDurationFields = payload.minutes !== undefined || payload.hours !== undefined;
    if (hasWindowFields) {
      if (!payload.startTime || !payload.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "startTime and endTime must be provided together.",
          path: ["startTime"]
        });
      }
      return;
    }
    if (!hasDurationFields) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide minutes or hours when start/end are not supplied.",
        path: ["minutes"]
      });
    }
  });

const idParams = z.object({
  id: z.string().trim().min(1)
});

const updateTimeEntrySchema = createTimeEntrySchema.partial().superRefine((payload, ctx) => {
  if (!Object.keys(payload).length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one field must be provided.",
      path: ["projectId"]
    });
  }
});

router.get("/", requireAuth, requireRoles(...timeRoles), listTimeEntriesController);
router.post(
  "/",
  requireAuth,
  requireRoles(...timeRoles),
  validateRequest({ body: createTimeEntrySchema }),
  createTimeEntryController
);
router.patch(
  "/:id",
  requireAuth,
  requireRoles(...timeRoles),
  validateRequest({
    params: idParams,
    body: updateTimeEntrySchema
  }),
  updateTimeEntryController
);

export default router;
