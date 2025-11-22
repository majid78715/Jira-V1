import {
  createWorkflowAction,
  createWorkflowInstance,
  findWorkScheduleForUser,
  getProjectById,
  getTaskById,
  getUserById,
  getWorkflowDefinitionById,
  getWorkflowInstanceByEntity,
  getWorkflowInstanceById,
  listAssignments,
  listCompanyHolidays,
  listDayOffsForUser,
  listUsersByRole,
  listWorkflowActions,
  recordActivity,
  sendNotifications,
  updateTask,
  updateWorkflowInstance
} from "../data/repositories";
import { addWorkingDuration } from "../utils/calcExpectedDate";
import { nowISO } from "../utils/date";
import {
  PublicUser,
  Role,
  Task,
  TaskEstimation,
  TaskEstimationStatus,
  TaskEstimationUnit,
  User,
  WorkflowAction,
  WorkflowActionType,
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowStepInstance
} from "../models/_types";
import { HttpError } from "../middleware/httpError";

type SubmitEstimatePayload = {
  quantity: number;
  unit: TaskEstimationUnit;
  notes?: string;
  confidence?: "LOW" | "MEDIUM" | "HIGH";
};

type WorkflowActionPayload = {
  action: WorkflowActionType;
  comment?: string;
};

type FinalApprovalPayload = {
  plannedStartDate: string;
  note?: string;
};

export type TaskWorkflowSummary = {
  definition: WorkflowDefinition;
  instance: WorkflowInstance;
  actions: WorkflowAction[];
};

const estimationSubmitterRoles: Role[] = ["PM"];

export async function submitTaskEstimate(
  taskId: string,
  actor: PublicUser,
  payload: SubmitEstimatePayload
): Promise<{ task: Task; workflow: TaskWorkflowSummary | null }> {
  if (!estimationSubmitterRoles.includes(actor.role)) {
    throw new Error("Only product managers can submit estimates.");
  }
  validateEstimatePayload(payload);
  const task = await loadTask(taskId);
  if (task.estimation?.status === "UNDER_REVIEW") {
    throw new Error("An estimate is already under review.");
  }
  if (task.estimation?.status === "APPROVED") {
    throw new Error("Task estimate already approved.");
  }
  const { definition, instance: rawInstance } = await ensureWorkflowInstance(task);
  const instance =
    rawInstance.status === "CHANGES_REQUESTED" || rawInstance.status === "REJECTED"
      ? await resetWorkflowInstance(rawInstance, definition)
      : rawInstance;
  const estimation: TaskEstimation = {
    quantity: payload.quantity,
    unit: payload.unit,
    notes: payload.notes?.trim(),
    confidence: payload.confidence,
    submittedById: actor.id,
    submittedAt: nowISO(),
    updatedAt: nowISO(),
    status: "UNDER_REVIEW"
  };
  const updatedTask = await updateTask(task.id, {
    estimation,
    workflowInstanceId: instance.id
  });
  const currentStep = instance.steps.find((step) => step.status === "ACTIVE");
  await recordActivity(
    actor.id,
    "TASK_ESTIMATE_SUBMITTED",
    `Submitted estimate (${payload.quantity} ${payload.unit.toLowerCase()})`,
    { taskId: task.id },
    task.id,
    "TASK"
  );
  if (currentStep) {
    await notifyRole(
      currentStep.assigneeRole,
      `Task ${task.title} ready for ${currentStep.name}`,
      {
        taskId: task.id,
        stepId: currentStep.stepId
      }
    );
  }
  const workflow = await getTaskWorkflowPayload(task.id);
  return { task: updatedTask, workflow };
}

export async function performTaskWorkflowAction(
  taskId: string,
  actor: PublicUser,
  payload: WorkflowActionPayload
): Promise<TaskWorkflowSummary> {
  const task = await loadTask(taskId);
  const { definition, instance: rawInstance } = await ensureWorkflowInstance(task);
  const instance = await getWorkflowInstanceById(rawInstance.id);
  if (!instance) {
    throw new Error("Workflow instance not found.");
  }
  const stepIndex = instance.steps.findIndex((step) => step.stepId === instance.currentStepId);
  if (stepIndex === -1) {
    throw new Error("No active workflow step found.");
  }
  const currentStep = instance.steps[stepIndex];
  if (currentStep.assigneeRole !== actor.role) {
    throw new Error("You are not authorized for this workflow step.");
  }
  const stepDefinition = definition.steps.find((step) => step.id === currentStep.stepId);
  if (!stepDefinition) {
    throw new Error("Workflow definition mismatch for current step.");
  }
  const comment = payload.comment?.trim();
  const commentRequired =
    (payload.action === "REJECT" && stepDefinition.requiresCommentOnReject) ||
    (payload.action === "SEND_BACK" && stepDefinition.requiresCommentOnSendBack);
  if (commentRequired && !comment) {
    throw new HttpError(400, "Comment is required for this action.");
  }
  const actionAllowed = stepDefinition.actions.includes(payload.action);
  if (!actionAllowed) {
    throw new Error("Action not allowed for this step.");
  }
  if (
    payload.action === "APPROVE" &&
    definition.steps[definition.steps.length - 1]?.id === currentStep.stepId
  ) {
    throw new Error("Use the final approval endpoint to complete this step.");
  }

  const actionTime = nowISO();
  let estimationStatus: TaskEstimationStatus | undefined;
  let updatedInstance: WorkflowInstance;
  switch (payload.action) {
    case "APPROVE": {
      const nextIndex = stepIndex + 1;
      const steps = instance.steps.map((step, idx) => {
        if (idx === stepIndex) {
          return {
            ...step,
            status: "APPROVED",
            actedById: actor.id,
            actedAt: actionTime,
            action: payload.action,
            comment
          };
        }
        if (idx === nextIndex) {
          return {
            ...step,
            status: "ACTIVE",
            actedById: undefined,
            actedAt: undefined,
            action: undefined,
            comment: undefined
          };
        }
        if (idx > nextIndex) {
          return {
            ...step,
            status: "PENDING",
            actedById: undefined,
            actedAt: undefined,
            action: undefined,
            comment: undefined
          };
        }
        return step;
      }) as WorkflowStepInstance[];
      updatedInstance = await updateWorkflowInstance(instance.id, {
        steps,
        status: "IN_PROGRESS",
        currentStepId: steps[nextIndex]?.stepId
      });
      const nextStep = steps[nextIndex];
      if (nextStep) {
        await notifyRole(nextStep.assigneeRole, `Task ${task.title} ready for ${nextStep.name}`, {
          taskId: task.id,
          stepId: nextStep.stepId
        });
      }
      break;
    }
    case "REJECT": {
      const steps = instance.steps.map((step, idx) => {
        if (idx === stepIndex) {
          return {
            ...step,
            status: "REJECTED",
            actedById: actor.id,
            actedAt: actionTime,
            action: payload.action,
            comment
          };
        }
        return {
          ...step,
          status: "PENDING",
          actedById: undefined,
          actedAt: undefined,
          action: undefined,
          comment: undefined
        };
      }) as WorkflowStepInstance[];
      estimationStatus = "REJECTED";
      updatedInstance = await updateWorkflowInstance(instance.id, {
        steps,
        status: "REJECTED",
        currentStepId: undefined
      });
      if (task.estimation?.submittedById) {
        await sendNotifications(
          [task.estimation.submittedById],
          `Task ${task.title} estimate rejected`,
          "WORKFLOW_ACTION",
          { taskId: task.id }
        );
      }
      break;
    }
    case "REQUEST_CHANGE": {
      const steps = createStepInstances(definition);
      steps[0] = {
        ...steps[0],
        status: "ACTIVE"
      };
      estimationStatus = "CHANGES_REQUESTED";
      updatedInstance = await updateWorkflowInstance(instance.id, {
        steps,
        status: "CHANGES_REQUESTED",
        currentStepId: steps[0].stepId
      });
      if (task.estimation?.submittedById) {
        await sendNotifications(
          [task.estimation.submittedById],
          `Changes requested for task ${task.title}`,
          "WORKFLOW_ACTION",
          { taskId: task.id }
        );
      }
      break;
    }
    case "SEND_BACK": {
      if (stepIndex === 0) {
        return performTaskWorkflowAction(taskId, actor, { action: "REQUEST_CHANGE", comment });
      }
      const targetIndex = Math.max(0, stepIndex - 1);
      const steps = instance.steps.map((step, idx) => {
        if (idx === stepIndex) {
          return {
            ...step,
            status: "SENT_BACK",
            actedById: actor.id,
            actedAt: actionTime,
            action: payload.action,
            comment
          };
        }
        if (idx === targetIndex) {
          return {
            ...step,
            status: "ACTIVE",
            actedById: undefined,
            actedAt: undefined,
            action: undefined,
            comment: undefined
          };
        }
        if (idx > targetIndex) {
          return {
            ...step,
            status: "PENDING",
            actedById: undefined,
            actedAt: undefined,
            action: undefined,
            comment: undefined
          };
        }
        return step;
      }) as WorkflowStepInstance[];
      updatedInstance = await updateWorkflowInstance(instance.id, {
        steps,
        status: "IN_PROGRESS",
        currentStepId: steps[targetIndex].stepId
      });
      const targetStep = steps[targetIndex];
      await notifyRole(targetStep.assigneeRole, `Task ${task.title} sent back`, {
        taskId: task.id,
        stepId: targetStep.stepId
      });
      break;
    }
    default:
      throw new Error("Unsupported workflow action.");
  }

  if (estimationStatus && task.estimation) {
    await updateTask(task.id, {
      estimation: {
        ...task.estimation,
        status: estimationStatus,
        updatedAt: nowISO()
      }
    });
  }

  await createWorkflowAction({
    instanceId: instance.id,
    stepId: currentStep.stepId,
    actorId: actor.id,
    action: payload.action,
    comment
  });

  await recordActivity(
    actor.id,
    `TASK_WORKFLOW_${payload.action}`,
    `Performed ${payload.action.toLowerCase()} on ${currentStep.name}`,
    { taskId: task.id, stepId: currentStep.stepId },
    task.id,
    "TASK"
  );

  const actions = await listWorkflowActions(instance.id);
  return {
    definition,
    instance: updatedInstance,
    actions
  };
}

export async function finalApproveTaskAndStart(
  taskId: string,
  actor: PublicUser,
  payload: FinalApprovalPayload
): Promise<{ task: Task; workflow: TaskWorkflowSummary }> {
  if (actor.role !== "PM") {
    throw new HttpError(403, "Only PMs can perform the final approval.");
  }
  if (!payload.plannedStartDate) {
    throw new HttpError(400, "plannedStartDate is required.");
  }
  const task = await loadTask(taskId);
  if (!task.estimation || task.estimation.status === "REJECTED") {
    throw new HttpError(400, "Task does not have an active estimate.");
  }
  const assignee = (await resolveTaskAssignee(task)) ?? actor;
  const { definition, instance } = await ensureWorkflowInstance(task);
  const currentStep = instance.steps.find((step) => step.status === "ACTIVE");
  const finalStep = definition.steps[definition.steps.length - 1];
  if (!currentStep || !finalStep || currentStep.stepId !== finalStep.id) {
    throw new HttpError(400, "Task is not ready for final approval.");
  }

  const schedule = await findWorkScheduleForUser(assignee.id, assignee.companyId);
  const holidays = await listCompanyHolidays({ companyId: assignee.companyId });
  const dayOffs = await listDayOffsForUser(assignee.id);
  const expectedCompletionDate = addWorkingDuration(
    payload.plannedStartDate,
    task.estimation.quantity,
    task.estimation.unit,
    assignee.profile.timeZone || actor.profile.timeZone,
    schedule?.slots,
    holidays,
    dayOffs
  );

  const updatedTask = await updateTask(task.id, {
    plannedStartDate: payload.plannedStartDate,
    expectedCompletionDate,
    status: "SELECTED",
    estimation: {
      ...task.estimation,
      status: "APPROVED",
      updatedAt: nowISO()
    }
  });

  const steps = instance.steps.map((step) =>
    step.stepId === currentStep.stepId
      ? {
          ...step,
          status: "APPROVED",
          actedById: actor.id,
          actedAt: nowISO(),
          action: "APPROVE",
          comment: payload.note
        }
      : step
  ) as WorkflowStepInstance[];
  const updatedInstance = await updateWorkflowInstance(instance.id, {
    steps,
    status: "COMPLETED",
    currentStepId: undefined
  });
  await createWorkflowAction({
    instanceId: instance.id,
    stepId: currentStep.stepId,
    actorId: actor.id,
    action: "APPROVE",
    comment: payload.note,
    metadata: {
      plannedStartDate: payload.plannedStartDate,
      expectedCompletionDate
    }
  });
  await recordActivity(
    actor.id,
    "TASK_FINAL_APPROVED",
    `Final approval with start date ${new Date(payload.plannedStartDate).toLocaleString()}`,
    { taskId: task.id, expectedCompletionDate },
    task.id,
    "TASK"
  );
  const notifyIds = [
    task.estimation?.submittedById,
    task.createdById
  ].filter((id): id is string => Boolean(id));
  if (notifyIds.length) {
    await sendNotifications(
      notifyIds,
      `Task ${task.title} approved and scheduled`,
      "WORKFLOW_ACTION",
      { taskId: task.id, expectedCompletionDate }
    );
  }

  const actions = await listWorkflowActions(instance.id);
  return {
    task: updatedTask,
    workflow: { definition, instance: updatedInstance, actions }
  };
}

export async function getTaskWorkflowPayload(taskId: string): Promise<TaskWorkflowSummary | null> {
  const task = await getTaskById(taskId);
  if (!task?.workflowInstanceId) {
    return null;
  }
  const instance = await getWorkflowInstanceById(task.workflowInstanceId);
  if (!instance) {
    return null;
  }
  const definition = await getWorkflowDefinitionById(instance.definitionId);
  if (!definition) {
    return null;
  }
  const actions = await listWorkflowActions(instance.id);
  return { definition, instance, actions };
}

async function ensureWorkflowInstance(task: Task): Promise<{
  definition: WorkflowDefinition;
  instance: WorkflowInstance;
}> {
  let instance = task.workflowInstanceId
    ? await getWorkflowInstanceById(task.workflowInstanceId)
    : await getWorkflowInstanceByEntity("TASK", task.id);
  let definition = instance ? await getWorkflowDefinitionById(instance.definitionId) : undefined;
  if (!instance || !definition) {
    const definitionForProject = await loadProjectWorkflowDefinition(task.projectId);
    definition = definitionForProject;
    const stepInstances = createStepInstances(definition);
    instance = await createWorkflowInstance({
      definitionId: definition.id,
      entityId: task.id,
      entityType: "TASK",
      status: "IN_PROGRESS",
      currentStepId: stepInstances[0]?.stepId,
      steps: stepInstances
    });
    await updateTask(task.id, { workflowInstanceId: instance.id });
  }
  return { definition, instance };
}

async function loadProjectWorkflowDefinition(projectId: string): Promise<WorkflowDefinition> {
  const project = await getProjectById(projectId);
  if (!project?.taskWorkflowDefinitionId) {
    throw new Error("Project is missing a workflow configuration.");
  }
  const definition = await getWorkflowDefinitionById(project.taskWorkflowDefinitionId);
  if (!definition) {
    throw new Error("Workflow definition configured on project no longer exists.");
  }
  if (definition.entityType !== "TASK") {
    throw new Error("Project workflow definition is invalid for tasks.");
  }
  if (!definition.isActive) {
    throw new Error("Project workflow definition is not active.");
  }
  return definition;
}

function createStepInstances(definition: WorkflowDefinition): WorkflowStepInstance[] {
  return definition.steps.map((step, index) => ({
    stepId: step.id,
    name: step.name,
    assigneeRole: step.assigneeRole,
    approverType: step.approverType,
    approverRole: step.approverRole,
    dynamicApproverType: step.dynamicApproverType,
    requiresCommentOnReject: step.requiresCommentOnReject,
    requiresCommentOnSendBack: step.requiresCommentOnSendBack,
    status: index === 0 ? "ACTIVE" : "PENDING"
  }));
}

async function resetWorkflowInstance(instance: WorkflowInstance, definition: WorkflowDefinition) {
  const steps = createStepInstances(definition);
  return updateWorkflowInstance(instance.id, {
    steps,
    status: "IN_PROGRESS",
    currentStepId: steps[0]?.stepId
  });
}

function validateEstimatePayload(payload: SubmitEstimatePayload) {
  if (Number.isNaN(payload.quantity) || payload.quantity <= 0) {
    throw new Error("quantity must be greater than zero.");
  }
  if (!["HOURS", "DAYS"].includes(payload.unit)) {
    throw new Error("unit must be HOURS or DAYS.");
  }
}

async function notifyRole(role: Role, message: string, metadata: Record<string, unknown>) {
  const recipients = await listUsersByRole(role);
  if (!recipients.length) {
    return;
  }
  await sendNotifications(
    recipients.map((user) => user.id),
    message,
    "WORKFLOW_ACTION_REQUIRED",
    metadata
  );
}

async function loadTask(taskId: string): Promise<Task> {
  const task = await getTaskById(taskId);
  if (!task) {
    throw new HttpError(404, "Task not found.");
  }
  return task;
}

async function resolveTaskAssignee(task: Task): Promise<User | null> {
  const assignments = await listAssignments({ taskId: task.id });
  const activeAssignment =
    assignments.find((assignment) => assignment.status === "APPROVED") ??
    assignments.find((assignment) => assignment.status === "COMPLETED");
  const candidateIds = [
    activeAssignment?.developerId,
    task.estimation?.submittedById
  ].filter((value): value is string => Boolean(value));
  for (const candidateId of candidateIds) {
    const candidate = await getUserById(candidateId);
    if (candidate && isDeveloperRole(candidate.role)) {
      return candidate;
    }
  }
  return null;
}

function isDeveloperRole(role: Role) {
  return role === "DEVELOPER" || role === "ENGINEER";
}
