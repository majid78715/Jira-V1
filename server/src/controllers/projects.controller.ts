import { Request, Response, NextFunction } from "express";
import {
  acceptProjectPackage,
  assertProjectAccess,
  createProjectDraft,
  createProjectFromWizard,
  activateProjectPackage,
  getProjectDetail,
  listProjectsForUser,
  sendBackProjectPackage,
  submitProjectPackage,
  updateProjectDraft,
  updateProjectRecord,
  deleteProject
} from "../services/project.service";
import { createTaskForProject, listTasksForProject } from "../services/task.service";

export async function listProjectsController(req: Request, res: Response, next: NextFunction) {
  try {
    const projects = await listProjectsForUser(req.currentUser!);
    res.json({ projects });
  } catch (error) {
    next(error);
  }
}

export async function createProjectController(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await createProjectFromWizard(req.currentUser!, req.body);
    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
}

export async function createProjectDraftController(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await createProjectDraft(req.currentUser!, req.body);
    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
}

export async function updateProjectDraftController(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await updateProjectDraft(req.currentUser!, req.params.id, req.body ?? {});
    res.json({ project });
  } catch (error) {
    next(error);
  }
}

export async function getProjectDetailController(req: Request, res: Response, next: NextFunction) {
  try {
    const details = await getProjectDetail(req.currentUser!, req.params.id);
    res.json(details);
  } catch (error) {
    next(error);
  }
}

export async function updateProjectController(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      name,
      code,
      budgetHours,
      estimatedEffortHours,
      description,
      ownerId,
      ownerIds,
      projectType,
      objectiveOrOkrId,
      priority,
      stage,
      sponsorUserId,
      deliveryManagerUserId,
      deliveryManagerUserIds,
      coreTeamUserIds,
      stakeholderUserIds,
      vendorCompanyIds,
      primaryVendorId,
      additionalVendorIds,
      startDate,
      endDate,
      actualStartDate,
      actualEndDate,
      status,
      taskWorkflowDefinitionId,
      health,
      riskLevel,
      riskSummary,
      complianceFlags,
      businessUnit,
      productModule,
      tags,
      approvedBudgetAmount,
      approvedBudgetCurrency,
      timeTrackingRequired,
      contractId,
      rateModel,
      rateCardReference
    } = req.body ?? {};
    const project = await updateProjectRecord(req.currentUser!, req.params.id, {
      name,
      code,
      budgetHours,
      estimatedEffortHours,
      description,
      vendorCompanyIds: Array.isArray(vendorCompanyIds) ? vendorCompanyIds : undefined,
      ownerId,
      ownerIds: Array.isArray(ownerIds) ? ownerIds : undefined,
      projectType,
      objectiveOrOkrId,
      priority,
      stage,
      sponsorUserId,
      deliveryManagerUserId,
      deliveryManagerUserIds: Array.isArray(deliveryManagerUserIds) ? deliveryManagerUserIds : undefined,
      coreTeamUserIds: Array.isArray(coreTeamUserIds) ? coreTeamUserIds : undefined,
      stakeholderUserIds: Array.isArray(stakeholderUserIds) ? stakeholderUserIds : undefined,
      primaryVendorId,
      additionalVendorIds: Array.isArray(additionalVendorIds) ? additionalVendorIds : undefined,
      startDate,
      endDate,
      actualStartDate,
      actualEndDate,
      status,
      taskWorkflowDefinitionId,
      health,
      riskLevel,
      riskSummary,
      complianceFlags: Array.isArray(complianceFlags) ? complianceFlags : undefined,
      businessUnit,
      productModule,
      tags: Array.isArray(tags) ? tags : undefined,
      approvedBudgetAmount,
      approvedBudgetCurrency,
      timeTrackingRequired,
      contractId,
      rateModel,
      rateCardReference
    });
    res.json({ project });
  } catch (error) {
    next(error);
  }
}

export async function listProjectTasksController(req: Request, res: Response, next: NextFunction) {
  try {
    await assertProjectAccess(req.currentUser!, req.params.projectId);
    const tasks = await listTasksForProject(req.params.projectId);
    res.json({ tasks });
  } catch (error) {
    next(error);
  }
}

export async function createProjectTaskController(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      itemType,
      title,
      plannedStartDate,
      plannedCompletionDate,
      assignees,
      parentId,
      bugFields,
      featureFields,
      newFeatureFields,
      existingFeatureFields,
      improvementFields,
      taskFields,
      estimatedHours
    } = req.body;

    if (!itemType || !title) {
      return res.status(400).json({ message: "itemType and title are required." });
    }

    let mappedFeatureFields = featureFields;
    if (itemType === "NEW_FEATURE" && newFeatureFields) {
      mappedFeatureFields = { featureType: "NEW", userStory: newFeatureFields.userStory };
    } else if (itemType === "EXISTING_FEATURE" && existingFeatureFields) {
      mappedFeatureFields = { featureType: "CURRENT", userStory: existingFeatureFields.userStory };
    }

    const task = await createTaskForProject(
      req.params.projectId,
      {
        itemType,
        title,
        plannedStartDate,
        plannedCompletionDate,
        assignees,
        parentId,
        bugFields,
        featureFields: mappedFeatureFields,
        improvementFields,
        taskFields,
        estimatedHours
      },
      req.currentUser!
    );
    res.status(201).json({ task });
  } catch (error) {
    next(error);
  }
}

export async function submitProjectPackageController(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await submitProjectPackage(req.currentUser!, req.params.id);
    res.json({ project });
  } catch (error) {
    next(error);
  }
}

export async function acceptProjectPackageController(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await acceptProjectPackage(req.currentUser!, req.params.id);
    res.json({ project });
  } catch (error) {
    next(error);
  }
}

export async function sendBackProjectPackageController(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await sendBackProjectPackage(req.currentUser!, req.params.id, {
      targetStage: req.body?.targetStage,
      reason: req.body?.reason
    });
    res.json({ project });
  } catch (error) {
    next(error);
  }
}

export async function activateProjectPackageController(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await activateProjectPackage(req.currentUser!, req.params.id);
    res.json({ project });
  } catch (error) {
    next(error);
  }
}

export async function deleteProjectController(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteProject(req.currentUser!, req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
