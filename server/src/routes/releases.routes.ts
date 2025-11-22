import { Router } from "express";
import {
  getReleases,
  getRelease,
  createNewRelease,
  updateReleaseDetails,
  removeRelease
} from "../controllers/releases.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";

const router = Router();

router.use(requireAuth);

router.get("/", getReleases);
router.get("/:id", getRelease);
router.post("/", requireRoles("SUPER_ADMIN", "VP", "PM", "PROJECT_MANAGER"), createNewRelease);
router.patch("/:id", requireRoles("SUPER_ADMIN", "VP", "PM", "PROJECT_MANAGER"), updateReleaseDetails);
router.delete("/:id", requireRoles("SUPER_ADMIN", "VP", "PM", "PROJECT_MANAGER"), removeRelease);

export default router;
