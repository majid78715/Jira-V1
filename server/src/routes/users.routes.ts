import { Router } from "express";
import { z } from "zod";
import {
  approveProfileController,
  listPendingProfilesController,
  rejectProfileController
} from "../controllers/profile.controller";
import {
  getUserPreferencesController,
  listUsersDirectoryController,
  updateOwnProfileController,
  updateUserPreferencesController
} from "../controllers/users.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";
import { profileSchema } from "../utils/validation";

const router = Router();
const userIdParams = z.object({
  id: z.string().trim().min(1)
});

const profileDecisionSchema = {
  params: userIdParams,
  body: z.object({
    comment: z.string().trim().max(512).optional()
  })
};

const timeValue = z
  .string()
  .regex(/^([0-1]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm in 24-hour format.");

const notificationPreferencesSchema = z
  .object({
    dailyDigestEmail: z.boolean().optional(),
    taskAssignmentEmail: z.boolean().optional(),
    commentMentionEmail: z.boolean().optional(),
    timesheetReminderEmail: z.boolean().optional(),
    alertEscalationsEmail: z.boolean().optional()
  })
  .strict()
  .optional();

const workflowPreferencesSchema = z
  .object({
    autoSubscribeOnAssignment: z.boolean().optional(),
    autoShareStatusWithTeam: z.boolean().optional(),
    autoCaptureFocusBlocks: z.boolean().optional()
  })
  .strict()
  .optional();

const availabilityPreferencesSchema = z
  .object({
    meetingHoursStart: timeValue.optional(),
    meetingHoursEnd: timeValue.optional(),
    shareCalendarWithTeam: z.boolean().optional(),
    protectFocusTime: z.boolean().optional()
  })
  .strict()
  .optional();

const updatePreferencesSchema = {
  params: userIdParams,
  body: z
    .object({
      notificationPreferences: notificationPreferencesSchema,
      workflowPreferences: workflowPreferencesSchema,
      availabilityPreferences: availabilityPreferencesSchema
    })
    .strict()
    .refine(
      (value) => Boolean(value.notificationPreferences || value.workflowPreferences || value.availabilityPreferences),
      { message: "At least one preference group must be provided." }
    )
};

const updateOwnProfileSchema = {
  body: z.object({
    profile: profileSchema
  })
};

router.get("/", requireAuth, listUsersDirectoryController);
router.get("/pending-profiles", requireAuth, requireRoles("PM"), listPendingProfilesController);
router.post(
  "/:id/approve-profile",
  requireAuth,
  requireRoles("PM"),
  validateRequest(profileDecisionSchema),
  approveProfileController
);
router.post(
  "/:id/reject-profile",
  requireAuth,
  requireRoles("PM"),
  validateRequest(profileDecisionSchema),
  rejectProfileController
);
router.get(
  "/:id/preferences",
  requireAuth,
  validateRequest({ params: userIdParams }),
  getUserPreferencesController
);
router.post(
  "/:id/preferences",
  requireAuth,
  validateRequest(updatePreferencesSchema),
  updateUserPreferencesController
);
router.post(
  "/me/profile",
  requireAuth,
  validateRequest(updateOwnProfileSchema),
  updateOwnProfileController
);

export default router;
