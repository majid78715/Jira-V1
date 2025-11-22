import { Router } from "express";
import { exportUserCalendarICSController } from "../controllers/calendar.controller";
import { requireAuth } from "../middleware/rbac";

const router = Router();

router.get("/ics/user/:userId", requireAuth, exportUserCalendarICSController);

export default router;
