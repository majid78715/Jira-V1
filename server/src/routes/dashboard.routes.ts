import { Router } from "express";
import {
  createDashboardViewController,
  dashboardAlertsController,
  dashboardChartsController,
  dashboardProjectsController,
  dashboardSummaryController,
  dashboardTaskExceptionsController,
  dashboardVendorPerformanceController,
  deleteDashboardViewController,
  listDashboardViewsController
} from "../controllers/dashboard.controller";
import { requireAuth } from "../middleware/rbac";

const router = Router();

router.use(requireAuth);

router.get("/summary", dashboardSummaryController);
router.get("/charts", dashboardChartsController);
router.get("/projects", dashboardProjectsController);
router.get("/task-exceptions", dashboardTaskExceptionsController);
router.get("/vendor-performance", dashboardVendorPerformanceController);
router.get("/alerts", dashboardAlertsController);

router.get("/views", listDashboardViewsController);
router.post("/views", createDashboardViewController);
router.delete("/views/:viewId", deleteDashboardViewController);

export default router;
