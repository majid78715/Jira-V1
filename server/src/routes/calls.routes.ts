import { Router } from "express";
import { getCallsConfigController, getSpeechTokenController } from "../controllers/calls.controller";
import { requireAuth } from "../middleware/rbac";

const router = Router();

router.use(requireAuth);
router.get("/config", getCallsConfigController);
router.get("/speech-token", getSpeechTokenController);

export default router;
