import { Router } from "express";
import {
  createMeetingController,
  deleteMeetingController,
  getMeetingController,
  listMeetingsController,
  updateMeetingController,
  suggestMeetingTimesController
} from "../controllers/meetings.controller";
import { requireAuth } from "../middleware/rbac";

const router = Router();

router.use(requireAuth);

router.get("/", listMeetingsController);
router.post("/", createMeetingController);
router.post("/suggest-times", suggestMeetingTimesController);
router.get("/:id", getMeetingController);
router.patch("/:id", updateMeetingController);
router.delete("/:id", deleteMeetingController);

export default router;
