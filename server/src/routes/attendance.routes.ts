import { Router } from "express";
import { clockInController, clockOutController, getAttendanceController } from "../controllers/attendance.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";

const router = Router();
const attendanceRoles = ["DEVELOPER", "ENGINEER"] as const;

router.get("/", requireAuth, requireRoles(...attendanceRoles), getAttendanceController);
router.post("/clock-in", requireAuth, requireRoles(...attendanceRoles), clockInController);
router.post("/clock-out", requireAuth, requireRoles(...attendanceRoles), clockOutController);

export default router;
