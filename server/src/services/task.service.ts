import {
  createTask,
  createTaskComment,
  deleteTask as deleteTaskRepo,
  getProjectById,
  getTaskById,
  getUserById,
  listActivityLogsForEntity,
  listAssignments,
  listProjectTasks,
  listTaskComments,
  recordActivity,
  updateTask
} from "../data/repositories";
import {
  Assignment,
  Project,
  PublicUser,
  Role,
  Task,
  TaskAssignmentPlanEntry,
  TaskComment
} from "../models/_types";
import { TaskWorkflowSummary, getTaskWorkflowPayload } from "./taskWorkflow.service";
import { HttpError } from "../middleware/httpError";
import { assertProjectEditAccess } from "./project.service";

type AssignmentInput = {
  userId: string;
  hours: number;
};

type CreateItemTaskPayload = {
  itemType: Task["itemType"];
  title: string;
  plannedStartDate?: string;
  plannedCompletionDate?: string;
  estimatedHours?: number;
  parentId?: string;
  assignees?: AssignmentInput[];
  bugFields?: {
    priority?: Task["priority"];
    steps?: string;
    expected?: string;
    actual?: string;
  };
  featureFields?: {
    featureType?: "NEW" | "CURRENT";
    userStory?: string;
  };
  improvementFields?: {
    description?: string;
  };
  taskFields?: {
    description?: string;
  };
};

type UpdateTaskPayload = Partial<{
  title: string;
  description: string;
  budgetHours: number;
  requiredSkills: string[];
  acceptanceCriteria: string[];
  dueDate: string;
  plannedStartDate: string;
  taskType: Task["taskType"];
  priority: Task["priority"];
  assigneeUserId: string;
  reporterUserId: string;
  isVendorTask: boolean;
  vendorId: string;
  estimateStoryPoints: number;
  dependencyTaskIds: string[];
  linkedIssueIds: string[];
  epicId: string;
  component: string;
  environment: string;
}> & {
  status?: Task["status"];
};

export async function listTasksForProject(projectId: string): Promise<Task[]> {
  return listProjectTasks(projectId);
}

export async function createTaskForProject(
  projectId: string,
  payload: CreateItemTaskPayload,
  actor: PublicUser
): Promise<Task> {
  enforceTaskEditor(actor);
  const project = await assertProjectEditAccess(actor, projectId);
  if (!payload.title?.trim()) {
    throw new Error("title is required.");
  }
  
  // Assignees are optional now
  const assignmentPlan = normalizeAssignees(payload.assignees);
  
  // Use provided estimatedHours or calculate from plan if available, or default to 0
  let estimationHours = payload.estimatedHours ?? 0;
  if (assignmentPlan.length > 0) {
     const planHours = assignmentPlan.reduce((sum, entry) => sum + entry.hours, 0);
     if (planHours > 0) {
       estimationHours = planHours;
     }
  }

  // validateBudget(estimationHours); // Allow 0 hours as per requirement

  const costAmount = await calculateEstimatedCost(assignmentPlan);
  
  // Removed autoSprint logic
  const sprintCode = undefined; 

  const taskType = determineTaskType(payload.itemType);
  const priority = determinePriority(payload.itemType, payload.bugFields?.priority);
  const typeMeta = buildTypeMeta(payload);
  const description = buildDescription(payload);
  const reporterUserId = project.ownerId || actor.id;

  const task = await createTask({
    projectId,
    itemType: payload.itemType,
    title: payload.title,
    description,
    createdById: actor.id,
    reporterUserId,
    taskType,
    priority,
    budgetHours: estimationHours,
    estimateStoryPoints: undefined,
    requiredSkills: [],
    acceptanceCriteria: [],
    dependencyTaskIds: [],
    linkedIssueIds: [],
    epicId: undefined,
    component: undefined,
    sprintId: undefined,
    sprint: undefined,
    environment: undefined,
    dueDate: payload.plannedCompletionDate,
    plannedStartDate: payload.plannedStartDate,
    assigneeUserId: assignmentPlan[0]?.userId,
    isVendorTask: false,
    vendorId: undefined,
    status: "NEW",
    estimationHours,
    costAmount,
    assignmentPlan,
    typeMeta,
    parentId: payload.parentId
  });

  await recordActivity(
    actor.id,
    "TASK_CREATED",
    `Created task ${task.title} for ${project.name}`,
    { projectId: project.id, taskId: task.id },
    task.id,
    "TASK"
  );
  return task;
}

export async function getTaskDetail(taskId: string): Promise<{
  task: Task;
  project: Project;
  assignments: Assignment[];
  comments: TaskComment[];
  activity: Awaited<ReturnType<typeof listActivityLogsForEntity>>;
  subtasks: Task[];
  workflow: TaskWorkflowSummary | null;
}> {
  const task = await getTaskById(taskId);
  if (!task) {
    throw new Error("Task not found.");
  }
  const project = await getProjectById(task.projectId);
  if (!project) {
    throw new Error("Project not found.");
  }
  const [assignments, rawComments, activity, workflow] = await Promise.all([
    listAssignments({ taskId: task.id }),
    listTaskComments(task.id),
    listActivityLogsForEntity(task.id, "TASK"),
    getTaskWorkflowPayload(task.id)
  ]);
  const subtasks = (await listProjectTasks(task.projectId)).filter((t) => t.parentId === task.id);
  const comments: TaskComment[] = rawComments.map((c) => ({
    ...c,
    taskId: c.entityId
  }));
  return { task, project, assignments, comments, activity, subtasks, workflow };
}

export async function createSubtask(
  parentTaskId: string,
  payload: { title: string; description?: string; assigneeUserId?: string; assignees?: AssignmentInput[] },
  actor: PublicUser
): Promise<Task> {
  enforceTaskEditor(actor);
  const parent = await getTaskById(parentTaskId);
  if (!parent) {
    throw new Error("Parent task not found.");
  }
  await assertProjectEditAccess(actor, parent.projectId);
  if (!payload.title?.trim()) {
    throw new Error("title is required.");
  }

  const assignmentPlan = normalizeAssignees(payload.assignees);
  // If assigneeUserId is provided but not in plan, add it with 0 hours
  if (payload.assigneeUserId && !assignmentPlan.some(a => a.userId === payload.assigneeUserId)) {
    assignmentPlan.unshift({ userId: payload.assigneeUserId, hours: 0 });
  }

  const now = new Date();
  const subtask = await createTask({
    projectId: parent.projectId,
    itemType: "IMPROVEMENT",
    title: payload.title.trim(),
    description: payload.description?.trim(),
    createdById: actor.id,
    reporterUserId: parent.reporterUserId ?? actor.id,
    taskType: "TASK",
    priority: "MEDIUM",
    budgetHours: 0,
    estimateStoryPoints: undefined,
    requiredSkills: [],
    acceptanceCriteria: [],
    dependencyTaskIds: [],
    linkedIssueIds: [],
    epicId: undefined,
    component: undefined,
    sprintId: undefined,
    sprint: undefined,
    environment: undefined,
    dueDate: parent.dueDate,
    plannedStartDate: parent.plannedStartDate ?? now.toISOString(),
    assigneeUserId: assignmentPlan[0]?.userId ?? payload.assigneeUserId,
    isVendorTask: false,
    vendorId: undefined,
    status: "NEW",
    estimationHours: 0,
    costAmount: 0,
    assignmentPlan,
    typeMeta: undefined,
    parentId: parent.id,
    releaseId: parent.releaseId
  });

  await recordActivity(
    actor.id,
    "TASK_CREATED",
    `Created subtask ${subtask.title}`,
    { projectId: parent.projectId, taskId: subtask.id, parentId: parent.id },
    subtask.id,
    "TASK"
  );
  return subtask;
}

export async function updateTaskRecord(taskId: string, payload: UpdateTaskPayload, actor: PublicUser): Promise<Task> {
  enforceTaskEditor(actor);
  if (payload.budgetHours !== undefined) {
    validateBudget(payload.budgetHours);
  }
  const existing = await getTaskById(taskId);
  if (!existing) {
    throw new Error("Task not found.");
  }
  await assertProjectEditAccess(actor, existing.projectId);
  if (existing.estimation?.status === "APPROVED") {
    throw new HttpError(400, "Approved tasks are immutable outside the admin correction flow.");
  }
  const task = await updateTask(taskId, payload);
  await recordActivity(
    actor.id,
    "TASK_UPDATED",
    `Updated task ${task.title}`,
    { taskId },
    task.id,
    "TASK"
  );
  return task;
}

export async function addTaskComment(
  taskId: string,
  actor: PublicUser,
  body: string,
  attachmentIds?: string[]
): Promise<TaskComment> {
  if (!body?.trim()) {
    throw new Error("comment is required.");
  }
  const task = await getTaskById(taskId);
  if (!task) {
    throw new Error("Task not found.");
  }
  const comment = await createTaskComment({
    taskId,
    authorId: actor.id,
    body,
    attachmentIds
  });
  await recordActivity(actor.id, "TASK_COMMENTED", "Added a task comment", { taskId }, task.id, "TASK");
  return { ...comment, taskId: comment.entityId };
}

export async function deleteTask(taskId: string, actor: PublicUser): Promise<void> {
  enforceTaskEditor(actor);
  const task = await getTaskById(taskId);
  if (!task) {
    throw new Error("Task not found.");
  }
  await assertProjectEditAccess(actor, task.projectId);
  
  await deleteTaskRepo(taskId);
  
  await recordActivity(
    actor.id,
    "TASK_DELETED",
    `Deleted task ${task.title}`,
    { taskId, projectId: task.projectId },
    task.projectId,
    "PROJECT"
  );
}

export async function bulkDeleteTasks(actor: PublicUser, taskIds: string[]): Promise<void> {
  enforceTaskEditor(actor);
  for (const taskId of taskIds) {
    // We call the service function to ensure checks and logging happen for each
    // Optimization: could batch this, but for now sequential is fine
    await deleteTask(taskId, actor);
  }
}

function validateBudget(value: number) {
  if (Number.isNaN(value) || value <= 0) {
    throw new Error("budgetHours must be greater than zero.");
  }
}

function enforceTaskEditor(actor: PublicUser) {
  if (!["PM", "PROJECT_MANAGER"].includes(actor.role)) {
    throw new Error("Insufficient permissions to modify tasks.");
  }
}

export async function bulkUpdateTasks(
  actor: PublicUser,
  taskIds: string[],
  changes: { status?: Task["status"]; assigneeUserId?: string; vendorId?: string }
): Promise<Task[]> {
  enforceTaskEditor(actor);
  const updates: Task[] = [];
  for (const taskId of taskIds) {
    const payload: UpdateTaskPayload = {};
    if (changes.status) {
      payload.status = changes.status;
    }
    if (changes.assigneeUserId !== undefined) {
      payload.assigneeUserId = changes.assigneeUserId;
    }
    if (changes.vendorId !== undefined) {
      payload.vendorId = changes.vendorId;
      payload.isVendorTask = Boolean(changes.vendorId);
    }
    if (!Object.keys(payload).length) {
      continue;
    }
    const updated = await updateTaskRecord(taskId, payload, actor);
    updates.push(updated);
  }
  return updates;
}

function determineTaskType(itemType: Task["itemType"]): Task["taskType"] {
  switch (itemType) {
    case "BUG":
      return "BUG";
    case "NEW_FEATURE":
    case "EXISTING_FEATURE":
      return "STORY";
    case "IMPROVEMENT":
      return "TASK";
    default:
      return "TASK";
  }
}

function determinePriority(itemType: Task["itemType"], bugPriority?: Task["priority"]): Task["priority"] {
  if (itemType === "BUG") {
    return bugPriority ?? "HIGH";
  }
  return "MEDIUM";
}

function buildTypeMeta(payload: CreateItemTaskPayload): Task["typeMeta"] {
  const meta: Task["typeMeta"] = {};
  if (payload.itemType === "BUG" && payload.bugFields) {
    meta.bug = {
      priority: payload.bugFields.priority,
      stepsToReproduce: payload.bugFields.steps,
      expectedResult: payload.bugFields.expected,
      actualResult: payload.bugFields.actual
    };
  }
  if (payload.itemType === "NEW_FEATURE" && payload.featureFields) {
    meta.newFeature = {
      userStory: payload.featureFields.userStory
    };
  }
  if (payload.itemType === "EXISTING_FEATURE" && payload.featureFields) {
    meta.existingFeature = {
      userStory: payload.featureFields.userStory
    };
  }
  if (payload.itemType === "IMPROVEMENT" && payload.improvementFields) {
    meta.improvement = {
      description: payload.improvementFields.description
    };
  }
  return meta;
}

function buildDescription(payload: CreateItemTaskPayload): string | undefined {
  if (payload.taskFields?.description) {
    return payload.taskFields.description;
  }
  if (payload.itemType === "IMPROVEMENT") {
    return payload.improvementFields?.description;
  }
  if (payload.itemType === "BUG" && payload.bugFields) {
    const sections = [
      payload.bugFields.steps ? `Steps:\n${payload.bugFields.steps}` : null,
      payload.bugFields.expected ? `Expected:\n${payload.bugFields.expected}` : null,
      payload.bugFields.actual ? `Actual:\n${payload.bugFields.actual}` : null
    ].filter(Boolean);
    return sections.length ? sections.join("\n\n") : undefined;
  }
  return undefined;
}

function normalizeAssignees(entries?: AssignmentInput[]): TaskAssignmentPlanEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .map((entry) => ({
      userId: entry.userId?.trim(),
      hours: Number(entry.hours)
    }))
    .filter((entry) => Boolean(entry.userId) && entry.hours >= 0) as TaskAssignmentPlanEntry[];
}

async function calculateEstimatedCost(plan: TaskAssignmentPlanEntry[]): Promise<number> {
  let total = 0;
  for (const entry of plan) {
    const user = await getUserById(entry.userId);
    if (!user) {
      throw new Error("Assignee not found.");
    }
    const rate = getHourlyRate(user.role);
    total += rate * entry.hours;
  }
  return Number(total.toFixed(2));
}

const ROLE_RATE_FALLBACK: Partial<Record<Role, number>> = {
  ENGINEER: 120,
  DEVELOPER: 95,
  PM: 150,
  SUPER_ADMIN: 175,
  VP: 200
};

function getHourlyRate(role: Role): number {
  return ROLE_RATE_FALLBACK[role] ?? 100;
}
