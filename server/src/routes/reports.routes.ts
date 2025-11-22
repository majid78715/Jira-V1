import { Router } from "express";
import {
  executiveSummaryReportController,
  timesheetSummaryReportController,
  vendorPerformanceReportController
} from "../controllers/reports.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";

const router = Router();

router.use(requireAuth);
router.get(
  "/vendor-performance",
  requireRoles("SUPER_ADMIN", "PM", "PROJECT_MANAGER", "VP"),
  vendorPerformanceReportController
);
router.get(
  "/timesheet-summary",
  requireRoles("SUPER_ADMIN", "PM", "PROJECT_MANAGER", "VP"),
  timesheetSummaryReportController
);
router.get(
  "/executive-summary",
  requireRoles("SUPER_ADMIN", "PM", "PROJECT_MANAGER", "VP", "VIEWER"),
  executiveSummaryReportController
);

export default router;
