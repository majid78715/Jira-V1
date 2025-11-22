import { Router } from "express";
import { listActivityController } from "../controllers/activity.controller";
import { requireAuth } from "../middleware/rbac";

const router = Router();

router.use(requireAuth);
router.get("/", listActivityController);

export default router;

