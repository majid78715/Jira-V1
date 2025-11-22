import {
  createProject,
  getCompanyById,
  getProjectById,
  getUserById,
  getWorkflowDefinitionById,
  listCompanies,
  listProjectTasks,
  listProjects,
  listUsers,
  listWorkflowDefinitions,
  listTimeEntries,
  recordActivity,
  sendNotifications,
  toPublicUser,
  updateProject,
  updateTask,
  deleteProject as deleteProjectRepo
} from "../data/repositories";
import {
  Project,
  ProjectStatus,
  ProjectHealth,
  ProjectPriority,
  ProjectStage,
  ProjectRiskLevel,
  ProjectType,
  ProjectRateModel,
  ProjectPackageStatus,
  ProjectPackageReturnTarget,
  PublicCompany,
  PublicUser,
  Task,
  TimeEntry,
  WorkflowDefinition,
  Role
} from "../models/_types";
import { HttpError } from "../middleware/httpError";

const projectStatuses: ProjectStatus[] = ["PROPOSED", "IN_PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];
const projectHealthValues: ProjectHealth[] = ["RED", "AMBER", "GREEN"];
const projectPriorities: ProjectPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const projectStages: ProjectStage[] = ["IDEA", "DISCOVERY", "PLANNING", "EXECUTION", "CLOSURE"];
const projectRiskLevels: ProjectRiskLevel[] = ["LOW", "MEDIUM", "HIGH"];
const projectTypes: ProjectType[] = ["PRODUCT_FEATURE", "PLATFORM_UPGRADE", "VENDOR_ENGAGEMENT", "EXPERIMENT"];
const rateModels: ProjectRateModel[] = ["TIME_AND_MATERIAL", "FIXED_FEE", "MILESTONE_BASED"];

type PackageStageDefinition = {
  id: "PM" | "PJM" | "PM_FINAL";
  status: Exclude<ProjectPackageStatus, "SENT_BACK" | "ACTIVE" | "ENG_REVIEW">;
  label: string;
  next?: ProjectPackageStatus;
  roles: Role[];
};

const PACKAGE_STAGE_FLOW: PackageStageDefinition[] = [
  {
    id: "PM",
    status: "PM_DRAFT",
    label: "Product Manager Prep",
    next: "PJM_REVIEW",
    roles: ["PM"]
  },
  {
    id: "PJM",
    status: "PJM_REVIEW",
    label: "Project Manager",
    next: "PM_ACTIVATE",
    roles: ["PROJECT_MANAGER"]
  },
  {
    id: "PM_FINAL",
    status: "PM_ACTIVATE",
    label: "Product Manager Approval",
    next: "ACTIVE",
    roles: ["PM"]
  }
];

const PACKAGE_STAGE_BY_STATUS = new Map(PACKAGE_STAGE_FLOW.map((stage) => [stage.status, stage]));
const PACKAGE_RETURN_TARGETS: Record<ProjectPackageReturnTarget, PackageStageDefinition> = {
  PM: PACKAGE_STAGE_FLOW[0],
  PJM: PACKAGE_STAGE_FLOW[1],
  ENG: PACKAGE_STAGE_FLOW[1]
};
const PACKAGE_SUPERVISOR_ROLES: Role[] = ["SUPER_ADMIN"];

type CreateProjectPayload = {
  name: string;
  code: string;
  budgetHours: number;
  estimatedEffortHours?: number;
  description?: string;
  ownerId?: string;
  ownerIds?: string[];
  projectType: ProjectType;
  objectiveOrOkrId?: string;
  priority: ProjectPriority;
  stage: ProjectStage;
  sponsorUserId: string;
  deliveryManagerUserId?: string;
  deliveryManagerUserIds?: string[];
  coreTeamUserIds: string[];
  stakeholderUserIds: string[];
  vendorCompanyIds?: string[];
  primaryVendorId?: string;
  additionalVendorIds?: string[];
  startDate?: string;
  endDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  status?: ProjectStatus;
  taskWorkflowDefinitionId?: string;
  health: ProjectHealth;
  riskLevel: ProjectRiskLevel;
  riskSummary?: string;
  complianceFlags?: string[];
  businessUnit: string;
  productModule: string;
  tags?: string[];
  approvedBudgetAmount?: number;
  approvedBudgetCurrency?: string;
  timeTrackingRequired: boolean;
  contractId?: string;
  rateModel: ProjectRateModel;
  rateCardReference?: string;
  isDraft?: boolean;
  packageStatus?: ProjectPackageStatus;
  packageSentBackTo?: ProjectPackageReturnTarget;
  packageSentBackReason?: string;
};

type UpdateProjectPayload = Partial<CreateProjectPayload>;
type WizardProjectInput = {
  name: string;
  description: string;
  productManagerIds: string[];
  vendorCompanyId: string;
  projectManagerIds: string[];
  plannedStartDate?: string;
  plannedEndDate?: string;
  coreTeamUserIds?: string[];
  taskWorkflowDefinitionId?: string;
  budgetBucket?: number;
};
type ProjectMetrics = {
  hoursLogged: number;
  hoursLoggedPercent: number;
  totalTasks: number;
  completedTasks: number;
  progressPercent: number;
};
type ProjectView = Project & {
  owner?: PublicUser;
  sponsor?: PublicUser;
  deliveryManager?: PublicUser;
  metrics?: ProjectMetrics;
  coreTeamMembers?: PublicUser[];
  stakeholderMembers?: PublicUser[];
};

export async function listProjectsForUser(actor: PublicUser): Promise<ProjectView[]> {
  const projects = await listProjects();
  const users = await listUsers();
  const userCompanyMap = new Map(users.map((u) => [u.id, u.companyId]));

  const visible = projects.filter((project) =>
    canUserAccessProject(actor, project, userCompanyMap.get(project.ownerId))
  );

  if (!visible.length) {
    return [];
  }
  const metricsMap = await computeProjectMetrics(visible);
  const userIds = new Set<string>();
  visible.forEach((project) => {
    if (project.ownerId) {
      userIds.add(project.ownerId);
    }
    if (project.sponsorUserId) {
      userIds.add(project.sponsorUserId);
    }
    if (project.deliveryManagerUserId) {
      userIds.add(project.deliveryManagerUserId);
    }
  });
  const userMap = await buildUserMap(Array.from(userIds));
  return visible.map((project) => ({
    ...project,
    owner: userMap.get(project.ownerId),
    sponsor: project.sponsorUserId ? userMap.get(project.sponsorUserId) : undefined,
    deliveryManager: project.deliveryManagerUserId ? userMap.get(project.deliveryManagerUserId) : undefined,
    metrics: metricsMap.get(project.id)
  }));
}

export async function deleteProject(actor: PublicUser, projectId: string): Promise<void> {
  const project = await assertProjectEditAccess(actor, projectId);
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "VP" && project.ownerId !== actor.id) {
      throw new HttpError(403, "Only the project owner or admins can delete a project.");
  }
  await deleteProjectRepo(projectId);
  await recordActivity(
    actor.id,
    "PROJECT_DELETED",
    `Deleted project ${project.name}`,
    { projectId },
    projectId,
    "PROJECT"
  );
}

export async function createProjectFromWizard(actor: PublicUser, payload: WizardProjectInput & { draftId?: string }): Promise<Project> {
  const normalized = await buildWizardProjectPayload(payload);
  if (payload.draftId) {
      const existing = await assertProjectEditAccess(actor, payload.draftId);
      const updated = await updateProject(existing.id, {
          ...normalized,
          isDraft: false,
          packageStatus: "PM_DRAFT"
      });
      await recordActivity(
        actor.id,
        "PROJECT_CREATED",
        `Created project ${updated.name} from draft`,
        { projectId: updated.id },
        updated.id,
        "PROJECT"
      );
      return updated;
  }
  const project = await createProjectRecord(actor, normalized);
  return applyPackageState(project.id, { isDraft: false, packageStatus: "PM_DRAFT" });
}

export async function createProjectDraft(actor: PublicUser, payload: WizardProjectInput): Promise<Project> {
  const normalized = await buildWizardProjectPayload(payload);
  const project = await createProjectRecord(actor, normalized);
  return applyPackageState(project.id, { isDraft: true, packageStatus: "PM_DRAFT" });
}

export async function updateProjectDraft(
  actor: PublicUser,
  projectId: string,
  payload: Partial<WizardProjectInput>
): Promise<Project> {
  const existing = await assertProjectEditAccess(actor, projectId);
  const mergedInput: WizardProjectInput = {
    name: payload.name ?? existing.name,
    description: payload.description ?? existing.description ?? "",
    productManagerIds: payload.productManagerIds ?? existing.ownerIds,
    vendorCompanyId: payload.vendorCompanyId ?? existing.primaryVendorId ?? existing.vendorCompanyIds[0],
    projectManagerIds: payload.projectManagerIds ?? existing.deliveryManagerUserIds,
    plannedStartDate: payload.plannedStartDate ?? existing.startDate,
    plannedEndDate: payload.plannedEndDate ?? existing.endDate,
    coreTeamUserIds: payload.coreTeamUserIds ?? existing.coreTeamUserIds,
    taskWorkflowDefinitionId: payload.taskWorkflowDefinitionId ?? existing.taskWorkflowDefinitionId,
    budgetBucket: payload.budgetBucket ?? existing.budgetHours
  };
  const normalized = await buildWizardProjectPayload(mergedInput);
  const updated = await updateProject(projectId, {
    name: normalized.name,
    description: normalized.description,
    ownerId: normalized.ownerId,
    ownerIds: normalized.ownerIds,
    deliveryManagerUserId: normalized.deliveryManagerUserId,
    deliveryManagerUserIds: normalized.deliveryManagerUserIds,
    coreTeamUserIds: normalized.coreTeamUserIds,
    stakeholderUserIds: normalized.stakeholderUserIds,
    vendorCompanyIds: normalized.vendorCompanyIds,
    primaryVendorId: normalized.primaryVendorId,
    additionalVendorIds: normalized.additionalVendorIds,
    startDate: normalized.startDate,
    endDate: normalized.endDate,
    taskWorkflowDefinitionId: normalized.taskWorkflowDefinitionId,
    budgetHours: normalized.budgetHours,
    estimatedEffortHours: normalized.estimatedEffortHours
  });
  return applyPackageState(updated.id, { isDraft: true, packageStatus: "PM_DRAFT" });
}

export async function submitProjectPackage(actor: PublicUser, projectId: string): Promise<Project> {
  const project = await assertProjectAccess(actor, projectId);
  const stage = resolveActivePackageStage(project);
  if (!stage) {
    throw new HttpError(400, "Project package is already active.");
  }
  ensureStageAccess(actor, stage, project);
  const tasks = await listProjectTasks(projectId);
  if (stage.id === "PM" && tasks.length === 0) {
    throw new HttpError(400, "Add at least one task before starting the project.");
  }
  if (stage.id === "PJM") {
    const hasAssignedDeveloper = tasks.some((task) => Boolean(task.assigneeUserId));
    const hasCompletedTask = tasks.some((task) => task.status === "DONE");
    if (!hasAssignedDeveloper) {
      throw new HttpError(400, "Assign a developer before submitting to the product manager.");
    }
    if (!hasCompletedTask) {
      throw new HttpError(400, "Complete at least one task before submitting to the product manager.");
    }
  }
  if (stage.status === "PM_ACTIVATE") {
    throw new HttpError(400, "Use the activation endpoint for the final stage.");
  }

  const nextStatus = stage.next;
  if (!nextStatus) {
    throw new HttpError(400, "Unable to determine the next package stage.");
  }
  const updated = await updateProject(projectId, {
    packageStatus: nextStatus,
    packageSentBackTo: undefined,
    packageSentBackReason: undefined,
    isDraft: false
  });
  if (nextStatus === "PJM_REVIEW") {
    const recipients = new Set<string>();
    if (project.deliveryManagerUserId) recipients.add(project.deliveryManagerUserId);
    if (project.deliveryManagerUserIds) project.deliveryManagerUserIds.forEach(id => recipients.add(id));
    
    if (recipients.size > 0) {
      await sendNotifications(Array.from(recipients), `New project assigned: ${project.name}`, "PROJECT_PACKAGE_ASSIGNED", {
        projectId
      });
    }
  }
  await recordActivity(
    actor.id,
    "PROJECT_PACKAGE_SUBMITTED",
    `Advanced project package to ${nextStatus}`,
    { projectId },
    projectId,
    "PROJECT"
  );
  return updated;
}

export async function acceptProjectPackage(actor: PublicUser, projectId: string): Promise<Project> {
  const project = await assertProjectAccess(actor, projectId);
  const stage = resolveActivePackageStage(project);
  if (!stage) {
    throw new HttpError(400, "Project package is already active.");
  }
  ensureStageAccess(actor, stage, project);
  await recordActivity(
    actor.id,
    "PROJECT_PACKAGE_ACCEPTED",
    `Accepted ${stage.label} stage`,
    { projectId },
    projectId,
    "PROJECT"
  );
  return project;
}

export async function sendBackProjectPackage(
  actor: PublicUser,
  projectId: string,
  payload: { targetStage: ProjectPackageReturnTarget; reason: string }
): Promise<Project> {
  const project = await assertProjectAccess(actor, projectId);
  const stage = resolveActivePackageStage(project);
  if (!stage) {
    throw new HttpError(400, "Project package is already active.");
  }
  ensureStageAccess(actor, stage, project);
  const targetStage = PACKAGE_RETURN_TARGETS[payload.targetStage];
  if (!targetStage) {
    throw new HttpError(400, "Invalid send-back target.");
  }
  const reason = payload.reason?.trim();
  if (!reason) {
    throw new HttpError(400, "A reason is required to send the package back.");
  }
  const updated = await updateProject(projectId, {
    packageStatus: "SENT_BACK",
    packageSentBackTo: payload.targetStage,
    packageSentBackReason: reason,
    isDraft: payload.targetStage === "PM" ? true : project.isDraft
  });
  await recordActivity(
    actor.id,
    "PROJECT_PACKAGE_SENT_BACK",
    `Sent package back to ${targetStage.label}`,
    { projectId, reason },
    projectId,
    "PROJECT"
  );
  return updated;
}

export async function activateProjectPackage(actor: PublicUser, projectId: string): Promise<Project> {
  const project = await assertProjectAccess(actor, projectId);
  const stage = resolveActivePackageStage(project);
  if (!stage || stage.status !== "PM_ACTIVATE") {
    throw new HttpError(400, "Project package is not ready for activation.");
  }
  ensureStageAccess(actor, stage, project);
  const tasks = await listProjectTasks(projectId);
  if (!tasks.length) {
    throw new HttpError(400, "Add at least one task before starting the project.");
  }
  const [updated, refreshedTasks, timeEntries] = await Promise.all([
    updateProject(projectId, {
      packageStatus: "ACTIVE",
      packageSentBackTo: undefined,
      packageSentBackReason: undefined,
      isDraft: false,
      status: "ACTIVE"
    }),
    listProjectTasks(projectId),
    listTimeEntries({ projectId })
  ]);
  await promoteNewTasksToPlanned(refreshedTasks);
  await autoProgressPlannedTasks(refreshedTasks, timeEntries);
  await recordActivity(
    actor.id,
    "PROJECT_PACKAGE_ACTIVATED",
    "Activated project package",
    { projectId },
    projectId,
    "PROJECT"
  );
  return updated;
}

export async function createProjectRecord(actor: PublicUser, payload: CreateProjectPayload): Promise<Project> {
  validateBudget(payload.budgetHours);
  if (payload.estimatedEffortHours !== undefined) {
    validateBudget(payload.estimatedEffortHours);
  }
  const ownerId = payload.ownerId ?? actor.id;
  const ownerIds = payload.ownerIds ?? [ownerId];
  await ensureUserExists(ownerId, "Owner");
  await ensureUsersExist(ownerIds, "Owner");
  await ensureUserExists(payload.sponsorUserId, "Sponsor");
  if (payload.deliveryManagerUserId) {
    await ensureUserExists(payload.deliveryManagerUserId, "Delivery manager");
  }
  if (payload.deliveryManagerUserIds) {
    await ensureUsersExist(payload.deliveryManagerUserIds, "Delivery manager");
  }
  await ensureUsersExist(payload.coreTeamUserIds, "Core team member");
  await ensureUsersExist(payload.stakeholderUserIds, "Stakeholder");
  const { vendorCompanyIds, primaryVendorId, additionalVendorIds } = await resolveVendorInputs({
    vendorCompanyIds: payload.vendorCompanyIds,
    primaryVendorId: payload.primaryVendorId,
    additionalVendorIds: payload.additionalVendorIds
  });
  const status = normalizeStatus(payload.status) ?? "PROPOSED";
  const health = normalizeHealth(payload.health);
  const riskLevel = normalizeRiskLevel(payload.riskLevel);
  const priority = normalizePriority(payload.priority);
  const stage = normalizeStage(payload.stage);
  const projectType = normalizeProjectType(payload.projectType);
  const rateModel = normalizeRateModel(payload.rateModel);
  const workflowDefinitionId = await resolveTaskWorkflowDefinition(payload.taskWorkflowDefinitionId);
  const project = await createProject({
    name: payload.name,
    code: payload.code.toUpperCase(),
    description: payload.description,
    ownerId,
    ownerIds,
    projectType,
    objectiveOrOkrId: payload.objectiveOrOkrId,
    priority,
    stage,
    sponsorUserId: payload.sponsorUserId,
    deliveryManagerUserId: payload.deliveryManagerUserId,
    deliveryManagerUserIds: payload.deliveryManagerUserIds ?? [],
    coreTeamUserIds: payload.coreTeamUserIds,
    stakeholderUserIds: payload.stakeholderUserIds,
    vendorCompanyIds,
    primaryVendorId,
    additionalVendorIds,
    budgetHours: payload.budgetHours,
    estimatedEffortHours: payload.estimatedEffortHours ?? payload.budgetHours,
    approvedBudgetAmount: payload.approvedBudgetAmount,
    approvedBudgetCurrency: payload.approvedBudgetCurrency,
    timeTrackingRequired: payload.timeTrackingRequired,
    status,
    health,
    riskLevel,
    riskSummary: payload.riskSummary,
    complianceFlags: payload.complianceFlags ?? [],
    businessUnit: payload.businessUnit,
    productModule: payload.productModule,
    tags: payload.tags ?? [],
    contractId: payload.contractId,
    rateModel,
    rateCardReference: payload.rateCardReference,
    startDate: payload.startDate,
    endDate: payload.endDate,
    actualStartDate: payload.actualStartDate,
    actualEndDate: payload.actualEndDate,
    taskWorkflowDefinitionId: workflowDefinitionId
  });

  await recordActivity(
    actor.id,
    "PROJECT_CREATED",
    `Created project ${project.name}`,
    { projectId: project.id },
    project.id,
    "PROJECT"
  );
  return project;
}

export async function getProjectDetail(actor: PublicUser, projectId: string): Promise<{
  project: ProjectView;
  tasks: Task[];
  vendors: PublicCompany[];
}> {
  const project = await assertProjectAccess(actor, projectId);
  const [tasks, companies, timeEntries] = await Promise.all([
    listProjectTasks(projectId),
    listCompanies(),
    listTimeEntries({ projectId })
  ]);
  await autoProgressPlannedTasks(tasks, timeEntries);
  const vendors = companies.filter((company) => project.vendorCompanyIds.includes(company.id));
  const userMap = await buildUserMap(
    [
      project.ownerId,
      project.sponsorUserId,
      project.deliveryManagerUserId,
      ...project.coreTeamUserIds,
      ...project.stakeholderUserIds
    ].filter((id): id is string => Boolean(id))
  );
  const metrics = buildMetricsFromData(project, tasks, timeEntries);
  return {
    project: {
      ...project,
      owner: userMap.get(project.ownerId),
      sponsor: project.sponsorUserId ? userMap.get(project.sponsorUserId) : undefined,
      deliveryManager: project.deliveryManagerUserId ? userMap.get(project.deliveryManagerUserId) : undefined,
      metrics,
      coreTeamMembers: project.coreTeamUserIds.map((id) => userMap.get(id)).filter((u): u is PublicUser => !!u),
      stakeholderMembers: project.stakeholderUserIds.map((id) => userMap.get(id)).filter((u): u is PublicUser => !!u)
    },
    tasks,
    vendors
  };
}

export async function updateProjectRecord(actor: PublicUser, projectId: string, payload: UpdateProjectPayload): Promise<Project> {
  if (payload.budgetHours !== undefined) {
    validateBudget(payload.budgetHours);
  }
  if (payload.estimatedEffortHours !== undefined) {
    validateBudget(payload.estimatedEffortHours);
  }
  if (payload.ownerId) {
    await ensureUserExists(payload.ownerId, "Owner");
  }
  if (payload.ownerIds) {
    await ensureUsersExist(payload.ownerIds, "Owner");
  }
  if (payload.sponsorUserId) {
    await ensureUserExists(payload.sponsorUserId, "Sponsor");
  }
  if (payload.deliveryManagerUserId) {
    await ensureUserExists(payload.deliveryManagerUserId, "Delivery manager");
  }
  if (payload.deliveryManagerUserIds) {
    await ensureUsersExist(payload.deliveryManagerUserIds, "Delivery manager");
  }
  if (payload.coreTeamUserIds) {
    await ensureUsersExist(payload.coreTeamUserIds, "Core team member");
  }
  if (payload.stakeholderUserIds) {
    await ensureUsersExist(payload.stakeholderUserIds, "Stakeholder");
  }
  const vendorCompanyIds = payload.vendorCompanyIds ? await filterValidVendors(payload.vendorCompanyIds) : undefined;
  const additionalVendorIds = payload.additionalVendorIds ? await filterValidVendors(payload.additionalVendorIds) : undefined;
  const primaryVendorId = payload.primaryVendorId ? await ensureVendorExists(payload.primaryVendorId) : undefined;
  const workflowDefinitionId =
    payload.taskWorkflowDefinitionId !== undefined
      ? await resolveTaskWorkflowDefinition(payload.taskWorkflowDefinitionId)
      : undefined;
  const existing = await assertProjectEditAccess(actor, projectId);
  const project = await updateProject(projectId, {
    ...payload,
    vendorCompanyIds,
    primaryVendorId,
    additionalVendorIds,
    status: normalizeStatus(payload.status),
    health: payload.health ? normalizeHealth(payload.health) : undefined,
    priority: payload.priority ? normalizePriority(payload.priority) : undefined,
    stage: payload.stage ? normalizeStage(payload.stage) : undefined,
    projectType: payload.projectType ? normalizeProjectType(payload.projectType) : undefined,
    riskLevel: payload.riskLevel ? normalizeRiskLevel(payload.riskLevel) : undefined,
    rateModel: payload.rateModel ? normalizeRateModel(payload.rateModel) : undefined,
    taskWorkflowDefinitionId: workflowDefinitionId
  });
  await recordActivity(
    actor.id,
    "PROJECT_UPDATED",
    `Updated project ${project.name}`,
    { projectId },
    project.id,
    "PROJECT"
  );
  await notifyHealthEscalation(existing, project);
  return project;
}

async function filterValidVendors(vendorIds: string[]): Promise<string[]> {
  const unique = Array.from(new Set(vendorIds.filter(Boolean)));
  if (!unique.length) {
    return [];
  }
  const validated: string[] = [];
  for (const id of unique) {
    const company = await getCompanyById(id);
    if (!company) {
      throw new Error(`Vendor company ${id} not found.`);
    }
    if (company.type !== "VENDOR") {
      throw new Error(`Company ${company.name} is not a vendor.`);
    }
    validated.push(company.id);
  }
  return validated;
}

function validateBudget(value: number) {
  if (Number.isNaN(value) || value <= 0) {
    throw new Error("budgetHours must be greater than zero.");
  }
}

function normalizeStatus(status?: ProjectStatus | string): ProjectStatus | undefined {
  if (!status) {
    return undefined;
  }
  return projectStatuses.includes(status as ProjectStatus) ? (status as ProjectStatus) : undefined;
}

async function resolveTaskWorkflowDefinition(id?: string): Promise<string> {
  const trimmed = id?.trim();
  if (trimmed) {
    const definition = await getWorkflowDefinitionById(trimmed);
    validateTaskWorkflowDefinition(definition);
    return trimmed;
  }

  const definitions = await listWorkflowDefinitions("TASK");
  const active = definitions.find((definition) => definition.isActive);
  if (!active) {
    throw new Error("No active task workflow definitions available.");
  }
  return active.id;
}

function validateTaskWorkflowDefinition(definition?: WorkflowDefinition): asserts definition is WorkflowDefinition {
  if (!definition) {
    throw new Error("Workflow definition not found.");
  }
  if (definition.entityType !== "TASK") {
    throw new Error("Workflow definition must target tasks.");
  }
  if (!definition.isActive) {
    throw new Error("Workflow definition is not active.");
  }
}

export async function assertProjectAccess(actor: PublicUser, projectId: string): Promise<Project> {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new HttpError(404, "Project not found.");
  }

  let ownerCompanyId: string | undefined;
  if (project.ownerId) {
    const owner = await getUserById(project.ownerId);
    ownerCompanyId = owner?.companyId;
  }

  if (!canUserAccessProject(actor, project, ownerCompanyId)) {
    throw new HttpError(403, "Insufficient permissions to access this project.");
  }
  return project;
}

export async function assertProjectEditAccess(actor: PublicUser, projectId: string): Promise<Project> {
  const project = await assertProjectAccess(actor, projectId);
  if (!canUserManageProject(actor, project)) {
    throw new HttpError(403, "You can only modify projects you own or manage.");
  }
  return project;
}

export function canUserAccessProject(actor: PublicUser, project: Project, ownerCompanyId?: string): boolean {
  if (!actor) {
    return false;
  }
  if (isPrivilegedActor(actor)) {
    return true;
  }
  if (project.ownerId === actor.id || project.deliveryManagerUserId === actor.id) {
    return true;
  }
  if (project.ownerIds?.includes(actor.id) || project.deliveryManagerUserIds?.includes(actor.id)) {
    return true;
  }
  if (actor.companyId && project.vendorCompanyIds.includes(actor.companyId)) {
    return true;
  }
  if ((actor.role === "PM" || actor.role === "PROJECT_MANAGER") && actor.companyId) {
    if (ownerCompanyId && ownerCompanyId === actor.companyId) {
      return true;
    }
  }
  return false;
}

export function canUserManageProject(actor: PublicUser, project: Project): boolean {
  if (!actor) {
    return false;
  }
  if (isPrivilegedActor(actor)) {
    return true;
  }
  if (actor.role === "PM" && (project.ownerId === actor.id || project.ownerIds?.includes(actor.id))) {
    return true;
  }
  if (actor.role === "PROJECT_MANAGER") {
    if (project.deliveryManagerUserId === actor.id || project.deliveryManagerUserIds?.includes(actor.id)) {
      return true;
    }
    if (actor.companyId && project.vendorCompanyIds.includes(actor.companyId)) {
      return true;
    }
  }
  return false;
}

function isPrivilegedActor(actor: PublicUser): boolean {
  return actor.role === "SUPER_ADMIN" || actor.role === "VP";
}

async function buildUserMap(userIds: string[]): Promise<Map<string, PublicUser>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (!unique.length) {
    return new Map();
  }
  const users = await listUsers();
  return new Map(users.filter((user) => unique.includes(user.id)).map((user) => [user.id, user]));
}

async function ensureUserExists(userId: string, label: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error(`${label} not found.`);
  }
}

async function ensureUsersExist(userIds: string[], label: string): Promise<void> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  await Promise.all(unique.map((id) => ensureUserExists(id, label)));
}

async function ensureVendorExists(vendorId: string): Promise<string> {
  const vendor = await getCompanyById(vendorId);
  if (!vendor) {
    throw new Error("Vendor not found.");
  }
  if (vendor.type !== "VENDOR") {
    throw new Error("Company is not a vendor.");
  }
  return vendor.id;
}

async function resolveVendorInputs(payload: {
  vendorCompanyIds?: string[];
  primaryVendorId?: string;
  additionalVendorIds?: string[];
}): Promise<{ vendorCompanyIds: string[]; primaryVendorId?: string; additionalVendorIds: string[] }> {
  const validatedAdditional = await filterValidVendors(payload.additionalVendorIds ?? []);
  const normalizedPrimary = payload.primaryVendorId ? (await filterValidVendors([payload.primaryVendorId]))[0] : undefined;
  const baseIds = await filterValidVendors([
    ...(payload.vendorCompanyIds ?? []),
    ...(normalizedPrimary ? [normalizedPrimary] : [])
  ]);
  const vendorCompanyIds = Array.from(new Set([...baseIds, ...validatedAdditional]));
  return {
    vendorCompanyIds,
    primaryVendorId: normalizedPrimary,
    additionalVendorIds: validatedAdditional
  };
}

async function buildWizardProjectPayload(payload: WizardProjectInput): Promise<CreateProjectPayload> {
  if (!payload.name?.trim()) {
    throw new Error("Project name is required.");
  }
  const description = payload.description?.trim();
  if (!description) {
    throw new Error("Project description is required.");
  }
  if (!payload.productManagerIds || payload.productManagerIds.length === 0) {
    throw new Error("At least one Product manager is required.");
  }
  if (!payload.vendorCompanyId) {
    throw new Error("Vendor company is required.");
  }
  if (!payload.projectManagerIds || payload.projectManagerIds.length === 0) {
    throw new Error("At least one Project manager is required.");
  }
  await ensureUsersExist(payload.productManagerIds, "Product manager");
  const vendorInputs = await resolveVendorInputs({
    vendorCompanyIds: [payload.vendorCompanyId],
    primaryVendorId: payload.vendorCompanyId,
    additionalVendorIds: []
  });
  
  for (const pmId of payload.projectManagerIds) {
    await validateProjectManagerForVendor(pmId, vendorInputs.primaryVendorId);
  }

  const workflowDefinitionId = await resolveTaskWorkflowDefinition(payload.taskWorkflowDefinitionId);
  const budgetHours =
    typeof payload.budgetBucket === "number" && payload.budgetBucket > 0 ? payload.budgetBucket : 80;
  validateBudget(budgetHours);
  const coreTeamUserIds = Array.isArray(payload.coreTeamUserIds)
    ? Array.from(new Set(payload.coreTeamUserIds.filter(Boolean)))
    : [];
  if (coreTeamUserIds.length) {
    await ensureUsersExist(coreTeamUserIds, "Core team member");
  }
  
  const primaryOwnerId = payload.productManagerIds[0];
  const primaryDeliveryManagerId = payload.projectManagerIds[0];

  return {
    name: payload.name.trim(),
    code: generateProjectCode(payload.name),
    budgetHours,
    estimatedEffortHours: budgetHours,
    description: description.slice(0, 512),
    ownerId: primaryOwnerId,
    ownerIds: payload.productManagerIds,
    projectType: "PRODUCT_FEATURE",
    objectiveOrOkrId: undefined,
    priority: "MEDIUM",
    stage: "PLANNING",
    sponsorUserId: primaryOwnerId,
    deliveryManagerUserId: primaryDeliveryManagerId,
    deliveryManagerUserIds: payload.projectManagerIds,
    coreTeamUserIds,
    stakeholderUserIds: [],
    vendorCompanyIds: vendorInputs.vendorCompanyIds,
    primaryVendorId: vendorInputs.primaryVendorId,
    additionalVendorIds: vendorInputs.additionalVendorIds,
    startDate: payload.plannedStartDate,
    endDate: payload.plannedEndDate,
    actualStartDate: undefined,
    actualEndDate: undefined,
    status: "PROPOSED",
    taskWorkflowDefinitionId: workflowDefinitionId,
    health: "GREEN",
    riskLevel: "LOW",
    riskSummary: undefined,
    complianceFlags: [],
    businessUnit: "GENERAL",
    productModule: "CORE",
    tags: [],
    approvedBudgetAmount: undefined,
    approvedBudgetCurrency: undefined,
    timeTrackingRequired: true,
    contractId: undefined,
    rateModel: "TIME_AND_MATERIAL",
    rateCardReference: undefined
  };
}

function normalizeHealth(value: ProjectHealth | string): ProjectHealth {
  const normalized = value?.toString().toUpperCase();
  if (!normalized || !projectHealthValues.includes(normalized as ProjectHealth)) {
    throw new Error("Invalid health value.");
  }
  return normalized as ProjectHealth;
}

function normalizePriority(value: ProjectPriority | string): ProjectPriority {
  const normalized = value?.toString().toUpperCase();
  if (!normalized || !projectPriorities.includes(normalized as ProjectPriority)) {
    throw new Error("Invalid priority value.");
  }
  return normalized as ProjectPriority;
}

function normalizeStage(value: ProjectStage | string): ProjectStage {
  const normalized = value?.toString().toUpperCase();
  if (!normalized || !projectStages.includes(normalized as ProjectStage)) {
    throw new Error("Invalid stage value.");
  }
  return normalized as ProjectStage;
}

function normalizeRiskLevel(value: ProjectRiskLevel | string): ProjectRiskLevel {
  const normalized = value?.toString().toUpperCase();
  if (!normalized || !projectRiskLevels.includes(normalized as ProjectRiskLevel)) {
    throw new Error("Invalid risk level.");
  }
  return normalized as ProjectRiskLevel;
}

function normalizeProjectType(value: ProjectType | string): ProjectType {
  const normalized = value?.toString().toUpperCase();
  if (!normalized || !projectTypes.includes(normalized as ProjectType)) {
    throw new Error("Invalid project type.");
  }
  return normalized as ProjectType;
}

function normalizeRateModel(value: ProjectRateModel | string): ProjectRateModel {
  const normalized = value?.toString().toUpperCase().replace(/[\s&-]/g, "_");
  if (!normalized || !rateModels.includes(normalized as ProjectRateModel)) {
    throw new Error("Invalid rate model.");
  }
  return normalized as ProjectRateModel;
}

async function computeProjectMetrics(projects: Project[]): Promise<Map<string, ProjectMetrics>> {
  const entries = await Promise.all(
    projects.map(async (project) => {
      const [tasks, timeEntries] = await Promise.all([listProjectTasks(project.id), listTimeEntries({ projectId: project.id })]);
      return [project.id, buildMetricsFromData(project, tasks, timeEntries)] as const;
    })
  );
  return new Map(entries);
}

function buildMetricsFromData(project: Project, tasks: Task[], timeEntries: TimeEntry[]): ProjectMetrics {
  const totalMinutes = timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
  const hoursLogged = totalMinutes / 60;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === "DONE").length;
  const progressPercent = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const hoursLoggedPercent = project.estimatedEffortHours
    ? Math.min(100, Math.round((hoursLogged / project.estimatedEffortHours) * 100))
    : 0;
  return {
    hoursLogged,
    hoursLoggedPercent,
    totalTasks,
    completedTasks,
    progressPercent
  };
}

async function notifyHealthEscalation(previous: Project, next: Project): Promise<void> {
  if (previous.health === next.health || next.health !== "RED") {
    return;
  }
  const recipients = new Set([next.ownerId, next.sponsorUserId].filter(Boolean));
  if (next.ownerIds) {
    next.ownerIds.forEach(id => recipients.add(id));
  }
  
  if (recipients.size === 0) {
    return;
  }
  await sendNotifications(Array.from(recipients) as string[], `Project ${next.name} is ${next.health}`, "PROJECT_HEALTH_ALERT", {
    projectId: next.id,
    health: next.health
  });
}

async function validateProjectManagerForVendor(userId: string, vendorId?: string): Promise<void> {
  await ensureUserExists(userId, "Project manager");
  if (!vendorId) {
    return;
  }
  const manager = await getUserById(userId);
  if (!manager) {
    throw new Error("Project manager not found.");
  }
  if (manager.companyId && manager.companyId !== vendorId) {
    throw new Error("Project manager must belong to the selected vendor.");
  }
}

async function promoteNewTasksToPlanned(tasks: Task[]): Promise<void> {
  const updates = tasks
    .filter((task) => task.status === "NEW")
    .map(async (task) => {
      await updateTask(task.id, { status: "PLANNED" });
      task.status = "PLANNED";
    });
  await Promise.all(updates);
}

async function autoProgressPlannedTasks(tasks: Task[], timeEntries: TimeEntry[]): Promise<void> {
  if (!tasks.length) {
    return;
  }
  const now = Date.now();
  const entriesByTask = new Set(timeEntries.map((entry) => entry.taskId).filter(Boolean));
  const updates = tasks
    .filter((task) => task.status === "PLANNED")
    .filter((task) => {
      const startReached = task.plannedStartDate ? Date.parse(task.plannedStartDate) <= now : false;
      return startReached || entriesByTask.has(task.id);
    })
    .map(async (task) => {
      await updateTask(task.id, { status: "IN_PROGRESS" });
      task.status = "IN_PROGRESS";
    });
  await Promise.all(updates);
}

function resolveActivePackageStage(project: Project): PackageStageDefinition | null {
  const status = project.packageStatus ?? "PM_DRAFT";
  if (status === "ACTIVE") {
    return null;
  }
  if (status === "SENT_BACK") {
    if (project.packageSentBackTo && PACKAGE_RETURN_TARGETS[project.packageSentBackTo]) {
      return PACKAGE_RETURN_TARGETS[project.packageSentBackTo];
    }
    return PACKAGE_STAGE_FLOW[0];
  }
  return PACKAGE_STAGE_BY_STATUS.get(status as PackageStageDefinition["status"]) ?? PACKAGE_STAGE_FLOW[0];
}

function ensureStageAccess(actor: PublicUser, stage: PackageStageDefinition, project?: Project): void {
  if (PACKAGE_SUPERVISOR_ROLES.includes(actor.role)) {
    return;
  }
  if (!stage.roles.includes(actor.role)) {
    throw new HttpError(403, "You cannot act on this package stage.");
  }
  if ((stage.id === "PM" || stage.id === "PM_FINAL") && project) {
    const isOwner = project.ownerId === actor.id || project.ownerIds?.includes(actor.id);
    if (!isOwner) {
      throw new HttpError(403, "Only the project owner can act on this stage.");
    }
  }
  if (stage.id === "PJM" && project) {
    const isAssigned = project.deliveryManagerUserId === actor.id || project.deliveryManagerUserIds?.includes(actor.id);
    const isVendorMatch = actor.companyId && project.vendorCompanyIds.includes(actor.companyId);
    if (!isAssigned && !isVendorMatch) {
      throw new HttpError(403, "Only the assigned project manager or a vendor colleague can act on this stage.");
    }
  }
}

async function applyPackageState(
  projectId: string,
  metadata: Partial<Pick<Project, "isDraft" | "packageStatus" | "packageSentBackTo" | "packageSentBackReason">>
): Promise<Project> {
  return updateProject(projectId, metadata);
}

function generateProjectCode(value: string): string {
  const slug = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4)
    .padEnd(4, "P");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${slug}-${suffix}`;
}
