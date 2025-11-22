import { Router } from "express";
import { getProjectCalendarController, getUserCalendarController } from "../controllers/calendar.controller";
import { requireAuth } from "../middleware/rbac";

const router = Router();

router.get("/user/:userId", requireAuth, getUserCalendarController);
router.get("/project/:projectId", requireAuth, getProjectCalendarController);

export default router;
