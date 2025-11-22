import { Attachment, AttachmentEntityType, Project, PublicUser, Task } from "../models/_types";
import {
  createAttachment,
  getProjectById,
  getTaskById,
  getTimesheetById,
  getUserById,
  listAttachments,
  listAssignments,
  recordActivity
} from "../data/repositories";
import { HttpError } from "../middleware/httpError";

type AttachmentFilters = {
  entityId?: string;
  entityType?: AttachmentEntityType;
};

type RegisterAttachmentInput = AttachmentFilters & {
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
};

export async function fetchAttachments(actor: PublicUser, filters: AttachmentFilters = {}): Promise<Attachment[]> {
  if (!filters.entityId || !filters.entityType) {
    throw new HttpError(400, "entityId and entityType are required.");
  }
  await assertAttachmentScope(actor, filters.entityType, filters.entityId);
  return listAttachments({ entityId: filters.entityId, entityType: filters.entityType });
}

export async function registerAttachment(actor: PublicUser, payload: RegisterAttachmentInput): Promise<Attachment> {
  if (!payload.entityId || !payload.entityType) {
    throw new HttpError(400, "entityId and entityType are required.");
  }
  await assertAttachmentScope(actor, payload.entityType, payload.entityId);
  const attachment = await createAttachment({
    entityId: payload.entityId,
    entityType: payload.entityType,
    uploaderId: actor.id,
    fileName: payload.fileName,
    originalName: payload.originalName,
    mimeType: payload.mimeType,
    size: payload.size,
    url: payload.url
  });

  if (payload.entityId && payload.entityType) {
    await recordActivity(
      actor.id,
      "ATTACHMENT_UPLOADED",
      `Uploaded ${payload.originalName}`,
      { attachmentId: attachment.id, entityType: payload.entityType },
      payload.entityId,
      payload.entityType
    );
  }

  return attachment;
}

async function assertAttachmentScope(actor: PublicUser, entityType: AttachmentEntityType, entityId: string) {
  switch (entityType) {
    case "PROJECT": {
      const project = await getProjectById(entityId);
      if (!project) {
        throw new HttpError(404, "Project not found.");
      }
      await enforceProjectAccess(actor, project);
      return;
    }
    case "TASK": {
      const task = await getTaskById(entityId);
      if (!task) {
        throw new HttpError(404, "Task not found.");
      }
      const project = await getProjectById(task.projectId);
      if (!project) {
        throw new HttpError(404, "Project not found.");
      }
      await enforceTaskAccess(actor, task, project);
      return;
    }
    case "TIMESHEET": {
      const timesheet = await getTimesheetById(entityId);
      if (!timesheet) {
        throw new HttpError(404, "Timesheet not found.");
      }
      await enforceTimesheetAccess(actor, timesheet.userId);
      return;
    }
    case "PROFILE": {
      await enforceProfileAccess(actor, entityId);
      return;
    }
    default:
      throw new HttpError(400, "Unsupported attachment entity.");
  }
}

async function enforceProjectAccess(actor: PublicUser, project: Project) {
  if (isAdmin(actor)) {
    return;
  }
  if (actor.role === "PROJECT_MANAGER") {
    if (actor.companyId && project.vendorCompanyIds.includes(actor.companyId)) {
      return;
    }
    throw new HttpError(403, "You do not have access to this project.");
  }
  if (isDeliveryRole(actor)) {
    const hasAssignment = await hasAssignmentInProject(actor.id, project.id);
    if (hasAssignment) {
      return;
    }
    throw new HttpError(403, "You are not assigned to this project.");
  }
  throw new HttpError(403, "You do not have access to this project.");
}

async function enforceTaskAccess(actor: PublicUser, task: Task, project: Project) {
  if (isAdmin(actor)) {
    return;
  }
  if (actor.role === "PROJECT_MANAGER") {
    if (actor.companyId && project.vendorCompanyIds.includes(actor.companyId)) {
      return;
    }
    throw new HttpError(403, "You do not have access to this task.");
  }
  if (isDeliveryRole(actor)) {
    const assignments = await listAssignments({ taskId: task.id });
    const hasAssignment = assignments.some(
      (assignment) =>
        assignment.developerId === actor.id && ["APPROVED", "COMPLETED"].includes(assignment.status)
    );
    if (hasAssignment) {
      return;
    }
    throw new HttpError(403, "You are not assigned to this task.");
  }
  throw new HttpError(403, "You do not have access to this task.");
}

async function enforceTimesheetAccess(actor: PublicUser, userId: string) {
  if (actor.id === userId) {
    return;
  }
  const owner = await getUserById(userId);
  if (!owner) {
    throw new HttpError(404, "User not found.");
  }
  if (isAdmin(actor)) {
    return;
  }
  if (actor.role === "PROJECT_MANAGER") {
    if (actor.companyId && owner.companyId === actor.companyId) {
      return;
    }
    throw new HttpError(403, "You do not have access to this timesheet.");
  }
  throw new HttpError(403, "You do not have access to this timesheet.");
}

async function enforceProfileAccess(actor: PublicUser, userId: string) {
  if (actor.id === userId) {
    return;
  }
  const target = await getUserById(userId);
  if (!target) {
    throw new HttpError(404, "User not found.");
  }
  if (isAdmin(actor)) {
    return;
  }
  if (actor.role === "PROJECT_MANAGER") {
    if (actor.companyId && target.companyId === actor.companyId) {
      return;
    }
    throw new HttpError(403, "You do not have access to this profile.");
  }
  throw new HttpError(403, "You do not have access to this profile.");
}

async function hasAssignmentInProject(developerId: string, projectId: string) {
  const assignments = await listAssignments({ developerId });
  for (const assignment of assignments) {
    if (!["APPROVED", "COMPLETED"].includes(assignment.status)) {
      continue;
    }
    const task = await getTaskById(assignment.taskId);
    if (task?.projectId === projectId) {
      return true;
    }
  }
  return false;
}

function isAdmin(actor: PublicUser) {
  return actor.role === "PM" || actor.role === "SUPER_ADMIN";
}

function isDeliveryRole(actor: PublicUser) {
  return actor.role === "DEVELOPER" || actor.role === "ENGINEER";
}
