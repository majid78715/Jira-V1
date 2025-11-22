import { Router } from "express";
import { listAttachmentsController } from "../controllers/attachments.controller";
import { requireAuth } from "../middleware/rbac";

const router = Router();

router.use(requireAuth);
router.get("/", listAttachmentsController);

export default router;

