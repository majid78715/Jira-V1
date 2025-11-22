import { Project, ProjectPackageReturnTarget, ProjectPackageStatus, Role, User } from "./types";

export type PackageStageId = "PM" | "PJM" | "PM_FINAL";

export interface PackageStageDefinition {
  id: PackageStageId;
  status: Exclude<ProjectPackageStatus, "SENT_BACK" | "ACTIVE" | "ENG_REVIEW">;
  label: string;
  description: string;
  next?: ProjectPackageStatus;
  roles: Role[];
}

export const PACKAGE_STAGE_FLOW: PackageStageDefinition[] = [
  {
    id: "PM",
    status: "PM_DRAFT",
    label: "Product Manager Prep",
    description: "Create tasks then start the project",
    next: "PJM_REVIEW",
    roles: ["PM"]
  },
  {
    id: "PJM",
    status: "PJM_REVIEW",
    label: "Project Manager",
    description: "Project manager completion",
    next: "PM_ACTIVATE",
    roles: ["PROJECT_MANAGER"]
  },
  {
    id: "PM_FINAL",
    status: "PM_ACTIVATE",
    label: "Product Manager Approval",
    description: "Final PM approval and activation",
    next: "ACTIVE",
    roles: ["PM"]
  }
];

const STAGE_BY_STATUS = new Map(PACKAGE_STAGE_FLOW.map((stage) => [stage.status, stage]));
const RETURN_TARGETS: Record<ProjectPackageReturnTarget, PackageStageDefinition> = {
  PM: PACKAGE_STAGE_FLOW[0],
  PJM: PACKAGE_STAGE_FLOW[1],
  ENG: PACKAGE_STAGE_FLOW[1]
};
const SUPERVISOR_ROLES: Role[] = ["SUPER_ADMIN"];

export const PACKAGE_RETURN_OPTIONS: Array<{ id: ProjectPackageReturnTarget; label: string }> = [
  { id: "PM", label: "Product Manager" },
  { id: "PJM", label: "Project Manager" }
];

export function resolveProjectPackageStage(project: Project): PackageStageDefinition | null {
  const status = project.packageStatus ?? "PM_DRAFT";
  if (status === "ACTIVE") {
    return null;
  }
  if (status === "SENT_BACK") {
    if (project.packageSentBackTo && RETURN_TARGETS[project.packageSentBackTo]) {
      return RETURN_TARGETS[project.packageSentBackTo];
    }
    return PACKAGE_STAGE_FLOW[0];
  }
  return STAGE_BY_STATUS.get(status as PackageStageDefinition["status"]) ?? PACKAGE_STAGE_FLOW[0];
}

export function canEditPackageStage(project: Project, user: User): boolean {
  if (SUPERVISOR_ROLES.includes(user.role)) {
    return true;
  }
  const stage = resolveProjectPackageStage(project);
  if (!stage) {
    return false;
  }
  if ((stage.id === "PM" || stage.id === "PM_FINAL") && project.ownerId !== user.id) {
    return false;
  }
  if (stage.id === "PJM") {
    const isAssigned = project.deliveryManagerUserId === user.id;
    const isVendorMatch = user.companyId && project.vendorCompanyIds?.includes(user.companyId);
    if (!isAssigned && !isVendorMatch) {
      return false;
    }
  }
  return stage.roles.includes(user.role as Role);
}

export function buildPackageTimeline(project: Project): Array<{
  id: PackageStageId;
  label: string;
  status: "done" | "active" | "upcoming";
  isCurrent?: boolean;
  isSentBack?: boolean;
}> {
  const stage = resolveProjectPackageStage(project);
  const status = project.packageStatus ?? "PM_DRAFT";
  return PACKAGE_STAGE_FLOW.map((entry) => {
    if (status === "ACTIVE" || (stage && entry.id !== stage.id && stageOrder(entry.id) < stageOrder(stage.id))) {
      return { id: entry.id, label: entry.label, status: "done" };
    }
    if (stage && entry.id === stage.id) {
      return {
        id: entry.id,
        label: entry.label,
        status: "active",
        isCurrent: true,
        isSentBack: status === "SENT_BACK"
      };
    }
    return { id: entry.id, label: entry.label, status: "upcoming" };
  });
}

export function packageStatusBadge(project: Project): string {
  const status = project.packageStatus ?? "PM_DRAFT";
  if (status === "SENT_BACK") {
    const target = project.packageSentBackTo ? RETURN_TARGETS[project.packageSentBackTo] : PACKAGE_STAGE_FLOW[0];
    return `Sent back to ${target.label}`;
  }
  if (status === "ACTIVE") {
    return "Activated";
  }
  const stage = STAGE_BY_STATUS.get(status as PackageStageDefinition["status"]);
  return stage ? stage.label : "Unknown";
}

export function packageReturnLabel(target: ProjectPackageReturnTarget): string {
  return PACKAGE_RETURN_OPTIONS.find((option) => option.id === target)?.label ?? target;
}

function stageOrder(id: PackageStageId): number {
  return PACKAGE_STAGE_FLOW.findIndex((stage) => stage.id === id);
}
