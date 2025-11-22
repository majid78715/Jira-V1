import { Project, User } from "./types";

const PRIVILEGED_ROLES: Array<User["role"]> = ["SUPER_ADMIN", "VP"];

export function isProjectMine(project: Project | null | undefined, user: User | null | undefined): boolean {
  if (!project || !user) {
    return false;
  }
  if (PRIVILEGED_ROLES.includes(user.role)) {
    return true;
  }
  if (project.ownerId === user.id) {
    return true;
  }
  if (project.deliveryManagerUserId === user.id) {
    return true;
  }
  return false;
}

export function canUserEditProject(project: Project | null | undefined, user: User | null | undefined): boolean {
  if (!project || !user) {
    return false;
  }
  if (PRIVILEGED_ROLES.includes(user.role)) {
    return true;
  }
  if (user.role === "PM" && project.ownerId === user.id) {
    return true;
  }
  if (user.role === "PROJECT_MANAGER" && project.deliveryManagerUserId === user.id) {
    return true;
  }
  return false;
}
