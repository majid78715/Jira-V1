import { Router } from "express";
import { z } from "zod";
import { listAlertsController, resolveAlertController } from "../controllers/alerts.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();
const idParams = z.object({
  id: z.string().trim().min(1)
});

router.use(requireAuth);
router.get("/", requireRoles("SUPER_ADMIN", "PM", "PROJECT_MANAGER", "DEVELOPER", "ENGINEER"), listAlertsController);
router.post(
  "/:id/resolve",
  requireRoles("SUPER_ADMIN", "PM", "PROJECT_MANAGER"),
  validateRequest({ params: idParams }),
  resolveAlertController
);

export default router;
