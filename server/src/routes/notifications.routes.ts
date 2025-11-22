import { Router } from "express";
import { z } from "zod";
import {
  createNotificationController,
  listNotificationsController,
  markNotificationReadController
} from "../controllers/notifications.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();
const idParams = z.object({
  id: z.string().trim().min(1)
});

const createNotificationSchema = {
  body: z.object({
    userId: z.string().trim().min(1).optional(),
    message: z.string().trim().min(1),
    type: z.string().trim().max(64).optional(),
    metadata: z.record(z.string(), z.any()).optional()
  })
};

router.use(requireAuth);
router.get("/", listNotificationsController);
router.post(
  "/",
  requireRoles("SUPER_ADMIN", "PM"),
  validateRequest(createNotificationSchema),
  createNotificationController
);
router.post("/:id/read", validateRequest({ params: idParams }), markNotificationReadController);

export default router;
