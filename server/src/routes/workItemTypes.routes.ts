import { Router } from "express";
import {
  getWorkItemTypes,
  getWorkItemType,
  createNewWorkItemType,
  updateWorkItemTypeDetails,
  removeWorkItemType
} from "../controllers/workItemTypes.controller";
import { requireAuth } from "../middleware/rbac";

const router = Router();

router.use(requireAuth);

router.get("/", getWorkItemTypes);
router.get("/:id", getWorkItemType);
router.post("/", createNewWorkItemType);
router.patch("/:id", updateWorkItemTypeDetails);
router.delete("/:id", removeWorkItemType);

export default router;
