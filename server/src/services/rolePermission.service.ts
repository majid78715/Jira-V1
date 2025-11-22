import { PermissionModule, Role, RolePermission } from "../models/_types";
import { getRolePermissionByRole, setRolePermissions } from "../data/repositories";

export const PERMISSION_MODULES: PermissionModule[] = [
  "dashboard",
  "projects",
  "tasks",
  "notifications",
  "teamDevelopers",
  "approvals",
  "alerts",
  "reports",
  "chat",
  "settings",
  "admin",
  "adminHolidays",
  "personas"
];

export const ALL_ROLES: Role[] = [
  "SUPER_ADMIN",
  "VP",
  "PM",
  "ENGINEER",
  "PROJECT_MANAGER",
  "DEVELOPER",
  "VIEWER"
];

const DEFAULT_ROLE_MODULES: Record<Role, PermissionModule[]> = {
  SUPER_ADMIN: ["dashboard", "projects", "notifications", "alerts", "reports", "approvals", "chat", "settings", "admin", "personas"],
  PM: ["dashboard", "projects", "notifications", "alerts", "reports", "approvals", "chat", "settings", "admin", "personas"],
  PROJECT_MANAGER: ["dashboard", "projects", "notifications", "teamDevelopers", "reports", "chat", "settings", "personas"],
  DEVELOPER: ["dashboard", "tasks", "notifications", "chat", "settings", "personas"],
  ENGINEER: ["dashboard", "tasks", "notifications", "chat", "settings", "personas"],
  VP: ["dashboard", "projects", "notifications", "alerts", "reports", "chat", "settings", "personas"],
  VIEWER: ["dashboard", "projects", "notifications", "chat", "settings", "personas"]
};

function normalizeModules(modules: PermissionModule[]): PermissionModule[] {
  const allowed = new Set(PERMISSION_MODULES);
  return Array.from(new Set(modules)).filter((module) => allowed.has(module));
}

export function getDefaultModulesForRole(role: Role): PermissionModule[] {
  return DEFAULT_ROLE_MODULES[role] ?? [];
}

export async function resolveRoleModules(role: Role): Promise<PermissionModule[]> {
  const existing = await getRolePermissionByRole(role);
  const base = existing?.modules?.length ? existing.modules : getDefaultModulesForRole(role);
  return normalizeModules(base);
}

export async function listRolePermissionsWithDefaults(): Promise<RolePermission[]> {
  const defaults: RolePermission[] = [];
  for (const role of ALL_ROLES) {
    const existing = await getRolePermissionByRole(role);
    if (existing) {
      defaults.push({ ...existing, modules: normalizeModules(existing.modules) });
      continue;
    }
    const created = await setRolePermissions(role, getDefaultModulesForRole(role));
    defaults.push({ ...created, modules: normalizeModules(created.modules) });
  }
  return defaults;
}

export async function updateRolePermissions(role: Role, modules: PermissionModule[]): Promise<RolePermission> {
  const normalized = normalizeModules(modules);
  const appliedModules = normalized.length ? normalized : getDefaultModulesForRole(role);
  const record = await setRolePermissions(role, appliedModules);
  return { ...record, modules: appliedModules };
}

