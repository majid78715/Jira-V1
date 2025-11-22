import { Router } from "express";
import { z } from "zod";
import {
  createProjectController,
  createProjectDraftController,
  createProjectTaskController,
  getProjectDetailController,
  listProjectTasksController,
  listProjectsController,
  updateProjectController,
  updateProjectDraftController,
  submitProjectPackageController,
  acceptProjectPackageController,
  sendBackProjectPackageController,
  activateProjectPackageController,
  deleteProjectController
} from "../controllers/projects.controller";
import { requireAuth, requireRoles } from "../middleware/rbac";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();
const projectStatuses = ["PROPOSED", "IN_PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
const projectTypes = ["PRODUCT_FEATURE", "PLATFORM_UPGRADE", "VENDOR_ENGAGEMENT", "EXPERIMENT"] as const;
const projectPriorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const projectStages = ["IDEA", "DISCOVERY", "PLANNING", "EXECUTION", "CLOSURE"] as const;
const projectHealthValues = ["RED", "AMBER", "GREEN"] as const;
const projectRiskLevels = ["LOW", "MEDIUM", "HIGH"] as const;
const rateModels = ["TIME_AND_MATERIAL", "FIXED_FEE", "MILESTONE_BASED"] as const;
const isoDateString = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date.");
const stringIdArray = z.array(z.string().trim().min(1));

const wizardProjectSchema = z.object({
  name: z.string().trim().min(2, "Project name is required."),
  description: z
    .string()
    .trim()
    .min(8, "Description must be at least 8 characters.")
    .max(512, "Description should be under 512 characters."),
  productManagerId: z.string().trim().min(1).optional(),
  productManagerIds: stringIdArray.optional(),
  vendorCompanyId: z.string().trim().min(1, "Vendor company is required."),
  projectManagerId: z.string().trim().min(1).optional(),
  projectManagerIds: stringIdArray.optional(),
  plannedStartDate: isoDateString.optional(),
  plannedEndDate: isoDateString.optional(),
  coreTeamUserIds: stringIdArray.default([]),
  taskWorkflowDefinitionId: z.string().trim().min(1).optional(),
  budgetBucket: z.number().positive().optional(),
  draftId: z.string().trim().min(1).optional()
});

const projectBaseSchema = z.object({
  name: z.string().trim().min(2),
  code: z.string().trim().min(2),
  budgetHours: z.number().positive(),
  estimatedEffortHours: z.number().positive().optional(),
  description: z.string().trim().max(2048).optional(),
  ownerId: z.string().trim().min(1).optional(),
  ownerIds: stringIdArray.optional(),
  projectType: z.enum(projectTypes),
  objectiveOrOkrId: z.string().trim().max(256).optional(),
  priority: z.enum(projectPriorities),
  stage: z.enum(projectStages),
  sponsorUserId: z.string().trim().min(1),
  deliveryManagerUserId: z.string().trim().min(1).optional(),
  deliveryManagerUserIds: stringIdArray.optional(),
  coreTeamUserIds: stringIdArray.default([]),
  stakeholderUserIds: stringIdArray.default([]),
  vendorCompanyIds: stringIdArray.optional(),
  primaryVendorId: z.string().trim().min(1).optional(),
  additionalVendorIds: stringIdArray.optional(),
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
  actualStartDate: isoDateString.optional(),
  actualEndDate: isoDateString.optional(),
  status: z.enum(projectStatuses).optional(),
  taskWorkflowDefinitionId: z.string().trim().min(1).optional(),
  health: z.enum(projectHealthValues),
  riskLevel: z.enum(projectRiskLevels),
  riskSummary: z.string().trim().max(1024).optional(),
  complianceFlags: stringIdArray.optional(),
  businessUnit: z.string().trim().min(2),
  productModule: z.string().trim().min(2),
  tags: stringIdArray.optional(),
  approvedBudgetAmount: z.number().positive().optional(),
  approvedBudgetCurrency: z.string().trim().min(3).max(8).optional(),
  timeTrackingRequired: z.boolean(),
  contractId: z.string().trim().max(128).optional(),
  rateModel: z.enum(rateModels),
  rateCardReference: z.string().trim().max(256).optional()
});

const projectIdParams = z.object({
  projectId: z.string().trim().min(1)
});

const idParams = z.object({
  id: z.string().trim().min(1)
});

const taskPriorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const taskItemTypes = ["BUG", "NEW_FEATURE", "EXISTING_FEATURE", "IMPROVEMENT"] as const;
const assignmentSchema = z.object({
  userId: z.string().trim().min(1),
  hours: z.number().min(0)
});
const projectTaskSchema = {
  params: projectIdParams,
  body: z.object({
    itemType: z.enum(taskItemTypes),
    title: z.string().trim().min(2),
    plannedStartDate: isoDateString.optional(),
    plannedCompletionDate: isoDateString.optional(),
    estimatedHours: z.number().min(0).optional(),
    parentId: z.string().trim().min(1).optional(),
    assignees: z.array(assignmentSchema).optional(),
    bugFields: z
      .object({
        priority: z.enum(taskPriorities).optional(),
        steps: z.string().trim().max(4000).optional(),
        expected: z.string().trim().max(4000).optional(),
        actual: z.string().trim().max(4000).optional()
      })
      .optional(),
    featureFields: z
      .object({
        featureType: z.enum(["NEW", "CURRENT"] as const).optional(),
        userStory: z.string().trim().max(4000).optional()
      })
      .optional(),
    newFeatureFields: z
      .object({
        userStory: z.string().trim().max(4000).optional()
      })
      .optional(),
    existingFeatureFields: z
      .object({
        userStory: z.string().trim().max(4000).optional()
      })
      .optional(),
    improvementFields: z
      .object({
        description: z.string().trim().max(4000).optional()
      })
      .optional(),
    taskFields: z
      .object({
        description: z.string().trim().max(4000).optional()
      })
      .optional()
  })
};

const packageSendBackSchema = {
  params: idParams,
  body: z.object({
    targetStage: z.enum(["PM", "PJM"] as const),
    reason: z.string().trim().min(3)
  })
};

router.get("/", requireAuth, listProjectsController);
router.post(
  "/",
  requireAuth,
  requireRoles("PM", "SUPER_ADMIN"),
  validateRequest({ body: wizardProjectSchema }),
  createProjectController
);
router.post(
  "/draft",
  requireAuth,
  requireRoles("PM", "SUPER_ADMIN"),
  validateRequest({ body: wizardProjectSchema }),
  createProjectDraftController
);
router.patch(
  "/draft/:id",
  requireAuth,
  requireRoles("PM", "SUPER_ADMIN"),
  validateRequest({ params: idParams, body: wizardProjectSchema.partial() }),
  updateProjectDraftController
);
router.get("/:id", requireAuth, validateRequest({ params: idParams }), getProjectDetailController);
router.patch(
  "/:id",
  requireAuth,
  requireRoles("PM", "SUPER_ADMIN"),
  validateRequest({ params: idParams, body: projectBaseSchema.partial() }),
  updateProjectController
);

router.delete(
  "/:id",
  requireAuth,
  requireRoles("PM", "SUPER_ADMIN", "VP"),
  validateRequest({ params: idParams }),
  deleteProjectController
);

router.post(
  "/:id/package/submit",
  requireAuth,
  validateRequest({ params: idParams }),
  submitProjectPackageController
);
router.post(
  "/:id/package/accept",
  requireAuth,
  validateRequest({ params: idParams }),
  acceptProjectPackageController
);
router.post(
  "/:id/package/send-back",
  requireAuth,
  validateRequest(packageSendBackSchema),
  sendBackProjectPackageController
);
router.post(
  "/:id/activate",
  requireAuth,
  validateRequest({ params: idParams }),
  activateProjectPackageController
);

router.get("/:projectId/tasks", requireAuth, validateRequest({ params: projectIdParams }), listProjectTasksController);
router.post(
  "/:projectId/tasks",
  requireAuth,
  requireRoles("PM", "PROJECT_MANAGER"),
  validateRequest(projectTaskSchema),
  createProjectTaskController
);

export default router;
