import { listAssignments, listProjects, listTasksByIds, listUsers } from "../data/repositories";
import { Assignment, PublicUser, Task } from "../models/_types";

export type TimeScope = {
  allowedUserIds: Set<string> | null;
  allowedProjectIds: Set<string> | null;
  allowedVendorCompanyIds: Set<string> | null;
  readOnly: boolean;
};

const CONTRIBUTOR_ROLES: PublicUser["role"][] = ["DEVELOPER", "ENGINEER"];

const APPROVED_ASSIGNMENT_STATUSES: Assignment["status"][] = ["APPROVED", "COMPLETED"];

export async function resolveTimeScope(actor: PublicUser): Promise<TimeScope> {
  if (actor.role === "SUPER_ADMIN") {
    return {
      allowedUserIds: null,
      allowedProjectIds: null,
      allowedVendorCompanyIds: null,
      readOnly: false
    };
  }

  if (actor.role === "VP") {
    return {
      allowedUserIds: null,
      allowedProjectIds: null,
      allowedVendorCompanyIds: null,
      readOnly: true
    };
  }

  if (CONTRIBUTOR_ROLES.includes(actor.role)) {
    return {
      allowedUserIds: new Set([actor.id]),
      allowedProjectIds: null,
      allowedVendorCompanyIds: actor.companyId ? new Set([actor.companyId]) : null,
      readOnly: false
    };
  }

  if (actor.role === "PROJECT_MANAGER") {
    if (!actor.companyId) {
      return {
        allowedUserIds: new Set([actor.id]),
        allowedProjectIds: null,
        allowedVendorCompanyIds: null,
        readOnly: false
      };
    }
    const users = await listUsers();
    const scopedUsers = users.filter((user) => user.companyId === actor.companyId).map((user) => user.id);
    return {
      allowedUserIds: new Set(scopedUsers),
      allowedProjectIds: null,
      allowedVendorCompanyIds: new Set([actor.companyId]),
      readOnly: false
    };
  }

  if (actor.role === "PM") {
    return resolvePmScope(actor);
  }

  if (actor.role === "VIEWER") {
    return {
      allowedUserIds: new Set([actor.id]),
      allowedProjectIds: null,
      allowedVendorCompanyIds: actor.companyId ? new Set([actor.companyId]) : null,
      readOnly: true
    };
  }

  return {
    allowedUserIds: new Set([actor.id]),
    allowedProjectIds: null,
    allowedVendorCompanyIds: actor.companyId ? new Set([actor.companyId]) : null,
    readOnly: false
  };
}

async function resolvePmScope(actor: PublicUser): Promise<TimeScope> {
  const projects = await listProjects();
  const scopedProjects = projects.filter(
    (project) => project.ownerId === actor.id || project.coreTeamUserIds.includes(actor.id)
  );
  if (!scopedProjects.length) {
    return {
      allowedUserIds: new Set([actor.id]),
      allowedProjectIds: new Set(),
      allowedVendorCompanyIds: actor.companyId ? new Set([actor.companyId]) : null,
      readOnly: false
    };
  }
  const projectIds = new Set(scopedProjects.map((project) => project.id));
  const assignments = await listAssignments();
  const relevantAssignments = assignments.filter((assignment) => APPROVED_ASSIGNMENT_STATUSES.includes(assignment.status));
  const taskIds = Array.from(new Set(relevantAssignments.map((assignment) => assignment.taskId)));
  const tasks: Task[] = taskIds.length ? await listTasksByIds(taskIds) : [];
  const taskLookup = new Map(tasks.map((task) => [task.id, task.projectId]));
  const userIds = new Set<string>([actor.id]);
  scopedProjects.forEach((project) => {
    project.coreTeamUserIds.forEach((id) => userIds.add(id));
  });
  relevantAssignments.forEach((assignment) => {
    const projectId = taskLookup.get(assignment.taskId);
    if (projectId && projectIds.has(projectId)) {
      userIds.add(assignment.developerId);
    }
  });

  return {
    allowedUserIds: userIds,
    allowedProjectIds: projectIds,
    allowedVendorCompanyIds: actor.companyId ? new Set([actor.companyId]) : null,
    readOnly: false
  };
}
