import { Router } from "express";
import { z } from "zod";
import {
  addTaskCommentController,
  bulkUpdateTasksController,
  finalApproveTaskController,
  getTaskDetailController,
  createSubtaskController,
  submitTaskEstimateController,
  updateTaskController,
  deleteTaskController,
  bulkDeleteTasksController
} from "../controllers/tasks.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();
const isoDateSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date.");

const paramsSchema = z.object({
  taskId: z.string().trim().min(1)
});

const taskStatuses = ["NEW", "PLANNED", "BACKLOG", "SELECTED", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"] as const;
const taskTypes = ["STORY", "TASK", "BUG", "CHANGE", "SPIKE", "MILESTONE"] as const;
const taskPriorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

const updateTaskSchema = {
  params: paramsSchema,
  body: z
    .object({
      title: z.string().trim().min(1).optional(),
      description: z.string().trim().max(4096).optional(),
      budgetHours: z.number().positive().optional(),
      requiredSkills: z.array(z.string().trim().min(1)).optional(),
      acceptanceCriteria: z.array(z.string().trim().min(1)).optional(),
      dueDate: isoDateSchema.optional(),
      plannedStartDate: isoDateSchema.optional(),
      status: z.enum(taskStatuses).optional(),
      taskType: z.enum(taskTypes).optional(),
      priority: z.enum(taskPriorities).optional(),
      assigneeUserId: z.string().trim().min(1).optional(),
      reporterUserId: z.string().trim().min(1).optional(),
      isVendorTask: z.boolean().optional(),
      vendorId: z.string().trim().min(1).optional(),
      estimateStoryPoints: z.number().positive().optional(),
      dependencyTaskIds: z.array(z.string().trim().min(1)).optional(),
      linkedIssueIds: z.array(z.string().trim().min(1)).optional(),
      epicId: z.string().trim().min(1).optional(),
      component: z.string().trim().max(128).optional(),
      environment: z.string().trim().max(64).optional()
    })
    .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
      message: "At least one field must be provided."
    })
};

const commentSchema = {
  params: paramsSchema,
  body: z.object({
    body: z.string().trim().min(1),
    attachmentIds: z.array(z.string().trim().min(1)).optional()
  })
};

const estimateSchema = {
  params: paramsSchema,
  body: z.object({
    quantity: z.number().positive(),
    unit: z.enum(["HOURS", "DAYS"] as const),
    notes: z.string().trim().max(1024).optional(),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"] as const).optional()
  })
};

const finalApprovalSchema = {
  params: paramsSchema,
  body: z.object({
    plannedStartDate: isoDateSchema,
    note: z.string().trim().max(1024).optional()
  })
};

const subtaskSchema = {
  params: paramsSchema,
  body: z.object({
    title: z.string().trim().min(2),
    description: z.string().trim().max(4096).optional(),
    assigneeUserId: z.string().trim().min(1).optional()
  })
};

const bulkUpdateSchema = z.object({
  taskIds: z.array(z.string().trim().min(1)).min(1),
  status: z.enum(taskStatuses).optional(),
  assigneeUserId: z.string().trim().min(1).optional(),
  vendorId: z.string().trim().min(1).optional()
}).refine((payload) => Boolean(payload.status || payload.assigneeUserId || payload.vendorId), {
  message: "Provide status, assigneeUserId, or vendorId to update."
});

router.get("/:taskId", requireAuth, validateRequest({ params: paramsSchema }), getTaskDetailController);
router.patch(
  "/:taskId",
  requireAuth,
  requireRoles("PM", "PROJECT_MANAGER", "ENGINEER", "DEVELOPER"),
  validateRequest(updateTaskSchema),
  updateTaskController
);
router.post(
  "/bulk-update",
  requireAuth,
  requireRoles("PM", "PROJECT_MANAGER", "ENGINEER", "DEVELOPER"),
  validateRequest({ body: bulkUpdateSchema }),
  bulkUpdateTasksController
);
router.post("/:taskId/comments", requireAuth, validateRequest(commentSchema), addTaskCommentController);
router.post(
  "/:taskId/estimate",
  requireAuth,
  requireRoles("PM"),
  validateRequest(estimateSchema),
  submitTaskEstimateController
);
router.post(
  "/:taskId/final-approve-and-start",
  requireAuth,
  requireRoles("PM"),
  validateRequest(finalApprovalSchema),
  finalApproveTaskController
);
router.post(
  "/:taskId/subtasks",
  requireAuth,
  requireRoles("PM", "PROJECT_MANAGER"),
  validateRequest(subtaskSchema),
  createSubtaskController
);

router.delete(
  "/:taskId",
  requireAuth,
  requireRoles("PM", "PROJECT_MANAGER"),
  validateRequest({ params: paramsSchema }),
  deleteTaskController
);

router.post(
  "/bulk-delete",
  requireAuth,
  requireRoles("PM", "PROJECT_MANAGER"),
  validateRequest({ body: z.object({ taskIds: z.array(z.string().trim().min(1)).min(1) }) }),
  bulkDeleteTasksController
);

export default router;
