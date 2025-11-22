import {
  createAssignment,
  getAssignmentById,
  getProjectById,
  getTaskById,
  getUserById,
  listAssignments,
  listTasksByIds,
  listUsersByRole,
  recordActivity,
  sendNotifications,
  updateAssignment,
  updateProject,
  updateTask
} from "../data/repositories";
import { Assignment, AssignmentStatus, PublicUser, Task } from "../models/_types";
import { nowISO } from "../utils/date";

type RequestAssignmentPayload = {
  taskId: string;
  developerId: string;
  note?: string;
};

type ListAssignmentsOptions = {
  status?: AssignmentStatus;
  taskId?: string;
  scope?: "my" | "pending" | "all";
};

export async function requestAssignment(actor: PublicUser, payload: RequestAssignmentPayload): Promise<Assignment> {
  ensureAssignmentRequester(actor);
  const task = await getTaskById(payload.taskId);
  if (!task) {
    throw new Error("Task not found.");
  }
  const developer = await getUserById(payload.developerId);
  if (!developer || !["DEVELOPER", "PM"].includes(developer.role)) {
    throw new Error("User must be a Developer or PM.");
  }
  if (!developer.isActive || developer.profileStatus !== "ACTIVE") {
    throw new Error("User is not active.");
  }
  const existing = await listAssignments({ taskId: task.id, developerId: developer.id, excludeStatuses: ["CANCELLED"] });
  if (existing.some((assignment) => assignment.status === "PENDING" || assignment.status === "APPROVED")) {
    throw new Error("User already assigned or pending approval for this task.");
  }

  const initialStatus: AssignmentStatus = "APPROVED";

  const assignment = await createAssignment({
    taskId: task.id,
    developerId: developer.id,
    requestedById: actor.id,
    requestedMessage: payload.note,
    status: initialStatus,
    approvedById: actor.id,
    approvedAt: nowISO()
  });

  await updateTask(task.id, { status: "IN_PROGRESS", assigneeUserId: developer.id });

  await recordActivity(
    actor.id,
    "ASSIGNMENT_REQUESTED",
    `Requested assignment for ${developer.profile.firstName} ${developer.profile.lastName}`,
    { taskId: task.id, assignmentId: assignment.id },
    assignment.id,
    "ASSIGNMENT"
  );

  await sendNotifications(
    [developer.id],
    `You have been assigned to task ${task.title}`,
    "ASSIGNMENT_APPROVED",
    { assignmentId: assignment.id }
  );

  return assignment;
}

export async function listAssignmentsForUser(actor: PublicUser, options: ListAssignmentsOptions = {}): Promise<{
  assignments: Assignment[];
  tasks: Task[];
}> {
  const filters: Parameters<typeof listAssignments>[0] = {};
  if (options.taskId) {
    filters.taskId = options.taskId;
  }
  if (options.status) {
    filters.status = options.status;
  }
  if (actor.role === "DEVELOPER") {
    filters.developerId = actor.id;
  } else if (actor.role === "PROJECT_MANAGER") {
    filters.requestedById = actor.id;
  } else if (actor.role === "PM" && options.scope === "pending") {
    filters.status = "PENDING";
  }

  const assignments = await listAssignments(filters);
  const tasks = await listTasksByIds(assignments.map((assignment) => assignment.taskId));
  return { assignments, tasks };
}

export async function approveAssignmentRequest(id: string, approver: PublicUser): Promise<Assignment> {
  throw new Error("Assignment requests are auto-approved by PM/Project Manager.");
}

export async function cancelAssignment(id: string, actor: PublicUser, reason?: string): Promise<Assignment> {
  const assignment = await getAssignmentOrThrow(id);
  if (actor.role !== "PM" && assignment.requestedById !== actor.id) {
    throw new Error("Only the requester or a PM can cancel an assignment.");
  }
  if (assignment.status === "COMPLETED" || assignment.status === "CANCELLED") {
    throw new Error("Assignment already finalized.");
  }
  const updated = await updateAssignment(assignment.id, {
    status: "CANCELLED",
    canceledAt: nowISO(),
    canceledById: actor.id,
    cancelReason: reason,
    requestedMessage: assignment.requestedMessage
  });
  await recordActivity(
    actor.id,
    "ASSIGNMENT_CANCELLED",
    "Cancelled assignment request",
    { assignmentId: assignment.id, taskId: assignment.taskId },
    assignment.id,
    "ASSIGNMENT"
  );
  await sendNotifications(
    [assignment.developerId, assignment.requestedById],
    "Assignment cancelled",
    "ASSIGNMENT_CANCELLED",
    { assignmentId: assignment.id }
  );
  return updated;
}

export async function completeAssignment(id: string, actor: PublicUser, note?: string): Promise<Assignment> {
  throw new Error("Developers do not submit assignments in this workflow.");
}

export async function approveTaskCompletion(id: string, actor: PublicUser): Promise<Assignment> {
  if (!["PM", "PROJECT_MANAGER"].includes(actor.role)) {
    throw new Error("Only PMs or Project Managers can approve task completion.");
  }
  const assignment = await getAssignmentOrThrow(id);
  if (!["APPROVED", "SUBMITTED"].includes(assignment.status)) {
    throw new Error("Only approved assignments can be marked complete.");
  }

  const updated = await updateAssignment(assignment.id, {
    status: "COMPLETED",
    approvedById: actor.id,
    approvedAt: nowISO()
  });
  await updateTask(assignment.taskId, { status: "DONE" });

  await recordActivity(
    actor.id,
    "ASSIGNMENT_COMPLETED",
    "Approved task completion",
    { assignmentId: assignment.id, taskId: assignment.taskId },
    assignment.id,
    "ASSIGNMENT"
  );

  await sendNotifications(
    [assignment.developerId],
    "Task completion approved",
    "ASSIGNMENT_COMPLETED",
    { assignmentId: assignment.id }
  );

  return updated;
}

export async function rejectTaskCompletion(id: string, actor: PublicUser, reason: string): Promise<Assignment> {
  throw new Error("Rejections are not used in the simplified workflow.");
}

async function getAssignmentOrThrow(id: string): Promise<Assignment> {
  const assignment = await getAssignmentById(id);
  if (!assignment) {
    throw new Error("Assignment not found.");
  }
  return assignment;
}

function ensureAssignmentRequester(actor: PublicUser) {
  if (!["PROJECT_MANAGER", "PM"].includes(actor.role)) {
    throw new Error("Only project managers and PMs can request assignments.");
  }
}
