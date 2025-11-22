import { Router } from "express";
import { z } from "zod";
import { getUserScheduleController, saveUserScheduleController } from "../controllers/schedule.controller";
import { requireAuth } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();
const userParams = z.object({
  userId: z.string().trim().min(1)
});

const slotSchema = z.object({
  day: z.number().int().min(0).max(6),
  start: z.string().trim().regex(/^([0-1]\d|2[0-3]):[0-5]\d$/),
  end: z.string().trim().regex(/^([0-1]\d|2[0-3]):[0-5]\d$/)
});

const scheduleSchema = {
  params: userParams,
  body: z.object({
    slots: z.array(slotSchema).min(1)
  })
};

router.get("/:userId", requireAuth, validateRequest({ params: userParams }), getUserScheduleController);
router.post("/:userId", requireAuth, validateRequest(scheduleSchema), saveUserScheduleController);

export default router;
