import { Router } from "express";
import { z } from "zod";
import {
  createWorkflowDefinitionController,
  deleteWorkflowDefinitionController,
  listWorkflowDefinitionsController,
  updateWorkflowDefinitionController
} from "../controllers/workflowDefinitions.controller";
import { performTaskWorkflowActionController } from "../controllers/workflowTasks.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();
const entityTypes = ["TASK"] as const;
const roles = ["SUPER_ADMIN", "VP", "PM", "ENGINEER", "PROJECT_MANAGER", "DEVELOPER", "VIEWER"] as const;
const workflowActions = ["APPROVE", "REJECT", "SEND_BACK", "REQUEST_CHANGE"] as const;
const approverTypes = ["ROLE", "DYNAMIC"] as const;
const dynamicApprovers = ["ENGINEERING_TEAM", "TASK_PROJECT_MANAGER", "TASK_PM", "TASK_ASSIGNED_DEVELOPER"] as const;

const idParams = z.object({
  id: z.string().trim().min(1)
});

const workflowDefinitionSchema = {
  body: z.object({
    name: z.string().trim().min(1),
    description: z.string().trim().max(2048).optional(),
    isActive: z.boolean().optional(),
    entityType: z.enum(entityTypes),
    steps: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).optional(),
            name: z.string().trim().min(1),
            description: z.string().trim().max(1024).optional(),
            order: z.number().int().min(0).optional(),
            approverType: z.enum(approverTypes),
            approverRole: z.string().min(1).optional(),
            dynamicApproverType: z.enum(dynamicApprovers).optional(),
            requiresCommentOnReject: z.boolean().optional(),
            requiresCommentOnSendBack: z.boolean().optional(),
            actions: z.array(z.enum(workflowActions)).optional()
          })
          .superRefine((step, ctx) => {
            if (step.approverType === "ROLE" && !step.approverRole) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "approverRole is required when approverType is ROLE",
                path: ["approverRole"]
              });
            }
            if (step.approverType === "DYNAMIC" && !step.dynamicApproverType) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "dynamicApproverType is required when approverType is DYNAMIC",
                path: ["dynamicApproverType"]
              });
            }
          })
      )
      .min(1)
  })
};

const updateWorkflowSchema = {
  params: idParams,
  body: workflowDefinitionSchema.body.partial()
};

const taskActionSchema = {
  params: z.object({
    taskId: z.string().trim().min(1)
  }),
  body: z.object({
    action: z.enum(workflowActions),
    comment: z.string().trim().max(1024).optional()
  })
};

router.get(
  "/definitions",
  requireAuth,
  requireRoles("PM", "SUPER_ADMIN"),
  listWorkflowDefinitionsController
);
router.post(
  "/definitions",
  requireAuth,
  requireRoles("PM", "SUPER_ADMIN"),
  validateRequest(workflowDefinitionSchema),
  createWorkflowDefinitionController
);
router.patch(
  "/definitions/:id",
  requireAuth,
  requireRoles("PM", "SUPER_ADMIN"),
  validateRequest(updateWorkflowSchema),
  updateWorkflowDefinitionController
);
router.delete(
  "/definitions/:id",
  requireAuth,
  requireRoles("PM", "SUPER_ADMIN"),
  validateRequest({ params: idParams }),
  deleteWorkflowDefinitionController
);

router.post(
  "/tasks/:taskId/actions",
  requireAuth,
  validateRequest(taskActionSchema),
  performTaskWorkflowActionController
);

export default router;
