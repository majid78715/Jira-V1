import { Router } from "express";
import {
  getWorkflowSchemes,
  getWorkflowScheme,
  createNewWorkflowScheme,
  updateWorkflowSchemeDetails,
  removeWorkflowScheme
} from "../controllers/workflows.controller";
import { requireAuth } from "../middleware/rbac";

const router = Router();

router.use(requireAuth);

router.get("/", getWorkflowSchemes);
router.get("/:id", getWorkflowScheme);
router.post("/", createNewWorkflowScheme);
router.patch("/:id", updateWorkflowSchemeDetails);
router.delete("/:id", removeWorkflowScheme);

export default router;
