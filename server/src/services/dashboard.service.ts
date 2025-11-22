import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { readDatabase } from "../data/db";
import {
  DashboardAlertRow,
  DashboardAlertsSummary,
  DashboardChartPayload,
  DashboardFilterParams,
  DashboardKpiCard,
  DashboardProjectRow,
  DashboardSavedView,
  DashboardSummaryPayload,
  DashboardTaskExceptionRow,
  DashboardTaskExceptionType,
  DashboardVendorRow,
  DashboardTimeGranularity,
  Project,
  ProjectHealth,
  ProjectRiskLevel,
  ProjectStatus,
  PublicUser,
  Task,
  TaskPriority,
  TaskStatus,
  TimeEntry,
  Alert,
  Assignment,
  Company,
  User
} from "../models/_types";
import { HttpError } from "../middleware/httpError";
import { getUserById, recordActivity, toPublicUser, updateUser } from "../data/repositories";
import { nowISO } from "../utils/date";

const DEFAULT_DAILY_HOURS = 8;
const DEFAULT_BUDGET_RATE = 150;
const MAX_PROJECT_ROWS = 50;
const MAX_TASK_ROWS = 50;
const MAX_VENDOR_ROWS = 25;

type NormalizedDashboardFilters = {
  dateFrom: DateTime;
  dateTo: DateTime;
  timeGranularity: DashboardTimeGranularity;
  businessUnitIds: string[];
  productModuleIds: string[];
  projectIds: string[];
  vendorIds: string[];
  productManagerIds: string[];
  statusList: ProjectStatus[];
  riskLevels: ProjectRiskLevel[];
  healthList: ProjectHealth[];
  rangeDays: number;
  original: DashboardFilterParams;
};

type DashboardComputationContext = {
  actor: PublicUser;
  user: User;
  filters: NormalizedDashboardFilters;
  projects: Project[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  alerts: Alert[];
  assignments: Assignment[];
  companies: Company[];
  users: User[];
};

export async function getDashboardSummary(
  actor: PublicUser,
  filters: DashboardFilterParams = {}
): Promise<DashboardSummaryPayload> {
  const context = await buildContext(actor, filters);
  return {
    kpi_cards: buildKpis(context),
    charts: buildCharts(context),
    projects_summary_rows: buildProjectRows(context),
    task_exceptions_rows: buildTaskExceptions(context),
    vendor_performance_rows: buildVendorRows(context),
    alerts_summary: buildAlertSummary(context),
    saved_views: context.actor.preferences?.savedDashboardViews ?? []
  };
}

export async function getDashboardCharts(
  actor: PublicUser,
  filters: DashboardFilterParams = {}
): Promise<Record<string, DashboardChartPayload>> {
  const context = await buildContext(actor, filters);
  return buildCharts(context);
}

export async function getDashboardProjects(
  actor: PublicUser,
  filters: DashboardFilterParams = {}
): Promise<DashboardProjectRow[]> {
  const context = await buildContext(actor, filters);
  return buildProjectRows(context);
}

export async function getDashboardTaskExceptions(
  actor: PublicUser,
  filters: DashboardFilterParams = {}
): Promise<DashboardTaskExceptionRow[]> {
  const context = await buildContext(actor, filters);
  return buildTaskExceptions(context);
}

export async function getDashboardVendorPerformance(
  actor: PublicUser,
  filters: DashboardFilterParams = {}
): Promise<DashboardVendorRow[]> {
  const context = await buildContext(actor, filters);
  return buildVendorRows(context);
}

export async function getDashboardAlerts(
  actor: PublicUser,
  filters: DashboardFilterParams = {}
): Promise<DashboardAlertsSummary> {
  const context = await buildContext(actor, filters);
  return buildAlertSummary(context);
}

export async function listSavedDashboardViews(actor: PublicUser): Promise<DashboardSavedView[]> {
  const user = await getUserById(actor.id);
  if (!user) {
    throw new HttpError(404, "User not found.");
  }
  return user.preferences?.savedDashboardViews ?? [];
}

export async function saveDashboardView(
  actor: PublicUser,
  payload: { name: string; filters?: DashboardFilterParams }
): Promise<DashboardSavedView> {
  if (!payload.name?.trim()) {
    throw new HttpError(400, "View name is required.");
  }
  const user = await getUserById(actor.id);
  if (!user) {
    throw new HttpError(404, "User not found.");
  }
  const normalized = normalizeFilters(payload.filters ?? {}, user);
  const view: DashboardSavedView = {
    id: randomUUID(),
    name: payload.name.trim(),
    filterParams: serializeFilters(normalized),
    createdAt: nowISO()
  };
  const existing = user.preferences?.savedDashboardViews ?? [];
  const updatedViews = [...existing.filter((item) => item.name !== view.name), view].slice(-10);
  await updateUser(user.id, {
    preferences: {
      ...(user.preferences ?? { savedDashboardViews: [] }),
      savedDashboardViews: updatedViews,
      managedVendorIds: user.preferences?.managedVendorIds
    }
  });
  await recordActivity(actor.id, "DASHBOARD_VIEW_SAVED", `Saved dashboard view ${view.name}`, {
    viewId: view.id
  });
  return view;
}

export async function deleteDashboardView(actor: PublicUser, viewId: string): Promise<void> {
  if (!viewId?.trim()) {
    throw new HttpError(400, "View id is required.");
  }
  const user = await getUserById(actor.id);
  if (!user) {
    throw new HttpError(404, "User not found.");
  }
  const existing = user.preferences?.savedDashboardViews ?? [];
  const nextViews = existing.filter((view) => view.id !== viewId);
  if (nextViews.length === existing.length) {
    throw new HttpError(404, "View not found.");
  }
  await updateUser(user.id, {
    preferences: {
      ...(user.preferences ?? { savedDashboardViews: [] }),
      savedDashboardViews: nextViews,
      managedVendorIds: user.preferences?.managedVendorIds
    }
  });
  await recordActivity(actor.id, "DASHBOARD_VIEW_DELETED", "Deleted dashboard view", { viewId });
}
async function buildContext(actor: PublicUser, filterInput: DashboardFilterParams): Promise<DashboardComputationContext> {
  const userRecord = await getUserById(actor.id);
  if (!userRecord) {
    throw new HttpError(404, "User not found.");
  }
  const filters = normalizeFilters(filterInput ?? {}, userRecord);
  const db = await readDatabase();
  const scopedProjects = scopeProjects(db.projects, userRecord, filters);
  const projectIds = new Set(scopedProjects.map((project) => project.id));
  const tasks = db.tasks.filter((task) => projectIds.has(task.projectId));
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const timeEntries = db.timeEntries.filter(
    (entry) =>
      projectIds.has(entry.projectId) &&
      isWithinRange(entry.date, filters.dateFrom, filters.dateTo)
  );
  const alerts = db.alerts.filter((alert) => {
    if (alert.projectId && !projectIds.has(alert.projectId)) {
      return false;
    }
    return isWithinRange(alert.createdAt, filters.dateFrom, filters.dateTo);
  });
  const assignments = db.assignments.filter((assignment) => {
    const task = taskMap.get(assignment.taskId);
    return task ? projectIds.has(task.projectId) : false;
  });
  return {
    actor: toPublicUser(userRecord),
    user: userRecord,
    filters,
    projects: scopedProjects,
    tasks,
    timeEntries,
    alerts,
    assignments,
    companies: db.companies,
    users: db.users
  };
}

function normalizeFilters(input: DashboardFilterParams | undefined, user: User): NormalizedDashboardFilters {
  const safeInput = input ?? {};
  const now = DateTime.now();
  const defaultWindowDays =
    user.role === "PM" ? 90 : user.role === "PROJECT_MANAGER" ? 60 : user.role === "VP" ? 75 : 60;
  const defaultTo = now.endOf("day");
  const defaultFrom = defaultTo.minus({ days: defaultWindowDays });

  const from = parseDate(safeInput.dateFrom) ?? defaultFrom;
  const to = parseDate(safeInput.dateTo) ?? defaultTo;
  if (from > to) {
    throw new HttpError(400, "date_from cannot be after date_to.");
  }

  const timeGranularity = normalizeGranularity(safeInput.timeGranularity);
  const normalizeList = (value?: unknown): string[] => {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value.map((item) => item?.toString().trim()).filter(Boolean) as string[];
    }
    if (typeof value === "string") {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  };

  const rangeDays = Math.max(1, Math.floor(to.diff(from, "days").days) + 1);

  return {
    dateFrom: from,
    dateTo: to,
    timeGranularity,
    businessUnitIds: normalizeList(safeInput.businessUnitIds),
    productModuleIds: normalizeList(safeInput.productModuleIds),
    projectIds: normalizeList(safeInput.projectIds),
    vendorIds: normalizeList(safeInput.vendorIds),
    productManagerIds: normalizeList(safeInput.productManagerIds),
    statusList: normalizeProjectStatusList(safeInput.statusList as ProjectStatus[] | undefined),
    riskLevels: normalizeRiskList(safeInput.riskLevels as ProjectRiskLevel[] | undefined),
    healthList: normalizeHealthList(safeInput.healthList as ProjectHealth[] | undefined),
    rangeDays,
    original: {
      ...safeInput,
      dateFrom: from.toISO() ?? undefined,
      dateTo: to.toISO() ?? undefined,
      timeGranularity
    }
  };
}

function scopeProjects(projects: Project[], user: User, filters: NormalizedDashboardFilters): Project[] {
  const allowed = projects.filter((project) => canAccessProject(user, project));
  return allowed.filter((project) => projectMatchesFilters(project, filters, user));
}

function canAccessProject(user: User, project: Project): boolean {
  if (["SUPER_ADMIN", "VP"].includes(user.role)) {
    return true;
  }
  if (user.role === "PM") {
    return project.ownerId === user.id || project.coreTeamUserIds.includes(user.id);
  }
  if (user.role === "PROJECT_MANAGER") {
    const vendorIds = new Set([
      ...(user.preferences?.managedVendorIds ?? []),
      ...(user.companyId ? [user.companyId] : [])
    ]);
    if (!vendorIds.size) {
      return false;
    }
    return projectVendorIds(project).some((id) => vendorIds.has(id));
  }
  return project.ownerId === user.id || project.coreTeamUserIds.includes(user.id);
}

function projectMatchesFilters(
  project: Project,
  filters: NormalizedDashboardFilters,
  user: User
): boolean {
  if (filters.businessUnitIds.length && !filters.businessUnitIds.includes(project.businessUnit)) {
    return false;
  }
  if (filters.productModuleIds.length && !filters.productModuleIds.includes(project.productModule)) {
    return false;
  }
  if (filters.projectIds.length && !filters.projectIds.includes(project.id)) {
    return false;
  }
  if (filters.productManagerIds.length && (!project.ownerId || !filters.productManagerIds.includes(project.ownerId))) {
    return false;
  }
  if (filters.statusList.length && !filters.statusList.includes(project.status)) {
    return false;
  }
  if (filters.riskLevels.length && !filters.riskLevels.includes(project.riskLevel)) {
    return false;
  }
  if (filters.healthList.length && !filters.healthList.includes(project.health)) {
    return false;
  }
  if (filters.vendorIds.length) {
    const vendorSet = new Set(filters.vendorIds);
    const scopeVendors = user.role === "PROJECT_MANAGER"
      ? new Set([
          ...(user.preferences?.managedVendorIds ?? []),
          ...(user.companyId ? [user.companyId] : [])
        ])
      : null;
    const vendors = projectVendorIds(project);
    const matchesVendor = vendors.some((vendorId) => vendorSet.has(vendorId));
    if (!matchesVendor) {
      return false;
    }
    if (scopeVendors && !vendors.some((id) => scopeVendors.has(id))) {
      return false;
    }
  }
  return true;
}
function buildKpis(context: DashboardComputationContext): DashboardKpiCard[] {
  const kpis: DashboardKpiCard[] = [];
  kpis.push(buildActiveProjectsCard(context));
  kpis.push(buildOnTrackCard(context));
  kpis.push(buildVendorsOnlineCard(context));
  kpis.push(buildThroughputCard(context));
  kpis.push(buildOverdueTasksCard(context));
  kpis.push(buildHoursLoggedCard(context));
  kpis.push(buildBudgetCard(context));
  kpis.push(buildAlertsCard(context));
  kpis.push(buildCycleTimeCard(context));
  return kpis;
}

function buildCharts(context: DashboardComputationContext): Record<string, DashboardChartPayload> {
  return {
    portfolio_status_distribution: buildStatusDistributionChart(context),
    project_health_by_bu_or_product: buildHealthByDimensionChart(context),
    progress_vs_plan: buildProgressVsPlanChart(context),
    throughput_trend: buildThroughputTrendChart(context),
    wip_bottlenecks: buildWipChart(context),
    capacity_vs_expected: buildCapacityChart(context),
    completed_vs_pending_per_project: buildCompletedPendingChart(context),
    monthly_progress_overview: buildMonthlyOverviewChart(context),
    vendor_performance_sla: buildVendorSlaChart(context),
    risk_issue_heatmap: buildRiskHeatmapChart(context)
  };
}

function buildProjectRows(context: DashboardComputationContext): DashboardProjectRow[] {
  const userMap = buildUserMap(context.users);
  const vendorMap = buildCompanyMap(context.companies);
  const alertsByProject = groupByProject(context.alerts);
  const timeByProject = aggregateTimeByProject(context.timeEntries);
  const tasksByProject = aggregateTasksByProject(context.tasks);

  return context.projects
    .map((project) => {
      const taskStats = tasksByProject.get(project.id) ?? { total: 0, done: 0 };
      const hoursLogged = timeByProject.get(project.id) ?? 0;
      const progressPercent = taskStats.total ? Math.round((taskStats.done / taskStats.total) * 100) : 0;
      const plannedPercent = computePlannedPercent(project, context.filters.dateTo);
      return {
        projectId: project.id,
        name: project.name,
        code: project.code,
        status: project.status,
        health: project.health,
        riskLevel: project.riskLevel,
        businessUnit: project.businessUnit,
        productModule: project.productModule,
        ownerId: project.ownerId,
        ownerName: userDisplayName(userMap.get(project.ownerId)),
        sponsorName: userDisplayName(userMap.get(project.sponsorUserId)),
        progressPercent,
        plannedPercent,
        budgetHours: project.budgetHours,
        hoursLogged,
        tasksTotal: taskStats.total,
        tasksDone: taskStats.done,
        openAlerts: alertsByProject.get(project.id) ?? 0,
        vendors: projectVendorIds(project).map((vendorId) => ({
          id: vendorId,
          name: vendorMap.get(vendorId)?.name ?? "Unassigned"
        })),
        updatedAt: project.updatedAt
      };
    })
    .sort((a, b) => b.openAlerts - a.openAlerts || b.riskLevel.localeCompare(a.riskLevel))
    .slice(0, MAX_PROJECT_ROWS);
}

function buildTaskExceptions(context: DashboardComputationContext): DashboardTaskExceptionRow[] {
  const userMap = buildUserMap(context.users);
  const vendorMap = buildCompanyMap(context.companies);
  const projectMap = new Map(context.projects.map((project) => [project.id, project]));
  const now = DateTime.now();
  const rows: DashboardTaskExceptionRow[] = [];
  for (const task of context.tasks) {
    const project = projectMap.get(task.projectId);
    if (!project) {
      continue;
    }
    if (task.status === "BLOCKED") {
      rows.push(buildTaskExceptionRow(task, project, "BLOCKED", now, userMap, vendorMap));
      continue;
    }
    if (task.dueDate) {
      const due = DateTime.fromISO(task.dueDate);
      if (due.isValid && due < now && task.status !== "DONE") {
        rows.push(buildTaskExceptionRow(task, project, "OVERDUE", now, userMap, vendorMap, due));
        continue;
      }
    }
    if (["CRITICAL", "HIGH"].includes(task.priority) && ["IN_PROGRESS", "IN_REVIEW"].includes(task.status)) {
      rows.push(buildTaskExceptionRow(task, project, "AT_RISK", now, userMap, vendorMap));
    }
  }
  return rows
    .sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0))
    .slice(0, MAX_TASK_ROWS);
}

function buildVendorRows(context: DashboardComputationContext): DashboardVendorRow[] {
  const vendorMap = buildCompanyMap(context.companies);
  const vendors = new Map<
    string,
    {
      hours: number;
      activeProjects: Set<string>;
      overdueTasks: number;
      blockedTasks: number;
      completedOnTime: number;
      completedLate: number;
      contributors: Set<string>;
    }
  >();
  const projectVendors = new Map(context.projects.map((project) => [project.id, projectVendorIds(project)]));
  for (const entry of context.timeEntries) {
    const vendorIds = projectVendors.get(entry.projectId) ?? [];
    for (const vendorId of vendorIds) {
      if (!vendors.has(vendorId)) {
        vendors.set(vendorId, {
          hours: 0,
          activeProjects: new Set(),
          overdueTasks: 0,
          blockedTasks: 0,
          completedOnTime: 0,
          completedLate: 0,
          contributors: new Set()
        });
      }
      const bucket = vendors.get(vendorId)!;
      bucket.hours += entry.minutes / 60;
      bucket.activeProjects.add(entry.projectId);
      bucket.contributors.add(entry.userId);
    }
  }
  for (const task of context.tasks) {
    const vendorsForTask = task.vendorId ? [task.vendorId] : projectVendors.get(task.projectId) ?? [];
    if (!vendorsForTask.length) {
      continue;
    }
    const due = task.dueDate ? DateTime.fromISO(task.dueDate) : null;
    const completedAt = task.status === "DONE" ? DateTime.fromISO(task.updatedAt) : null;
    for (const vendorId of vendorsForTask) {
      if (!vendors.has(vendorId)) {
        vendors.set(vendorId, {
          hours: 0,
          activeProjects: new Set([task.projectId]),
          overdueTasks: 0,
          blockedTasks: 0,
          completedOnTime: 0,
          completedLate: 0,
          contributors: new Set()
        });
      }
      const bucket = vendors.get(vendorId)!;
      if (task.status === "BLOCKED") {
        bucket.blockedTasks += 1;
      }
      if (due && due < DateTime.now() && task.status !== "DONE") {
        bucket.overdueTasks += 1;
      }
      if (completedAt && due) {
        if (completedAt <= due) {
          bucket.completedOnTime += 1;
        } else {
          bucket.completedLate += 1;
        }
      }
    }
  }
  return Array.from(vendors.entries())
    .map(([vendorId, stats]) => {
      const expectedHours =
        stats.contributors.size > 0
          ? calculateWorkdays(context.filters.dateFrom, context.filters.dateTo) *
            DEFAULT_DAILY_HOURS *
            stats.contributors.size
          : 0;
      const slaTotal = stats.completedOnTime + stats.completedLate;
      return {
        vendorId,
        vendorName: vendorMap.get(vendorId)?.name ?? "Unassigned",
        activeProjects: stats.activeProjects.size,
        hoursLogged: Number(stats.hours.toFixed(1)),
        utilisationPercent:
          expectedHours > 0 ? Math.min(200, Math.round((stats.hours / expectedHours) * 100)) : 0,
        slaAdherencePercent: slaTotal > 0 ? Math.round((stats.completedOnTime / slaTotal) * 100) : 0,
        overdueTasks: stats.overdueTasks,
        blockedTasks: stats.blockedTasks
      };
    })
    .sort((a, b) => b.hoursLogged - a.hoursLogged)
    .slice(0, MAX_VENDOR_ROWS);
}

function buildAlertSummary(context: DashboardComputationContext): DashboardAlertsSummary {
  const projectMap = new Map(context.projects.map((project) => [project.id, project]));
  const vendorMap = buildCompanyMap(context.companies);
  const rows: DashboardAlertRow[] = [];
  const counts = new Map<string, number>();
  for (const alert of context.alerts) {
    if (alert.status !== "OPEN") {
      continue;
    }
    counts.set(alert.type, (counts.get(alert.type) ?? 0) + 1);
    rows.push({
      id: alert.id,
      type: alert.type,
      status: alert.status,
      message: alert.message,
      projectId: alert.projectId,
      projectName: alert.projectId ? projectMap.get(alert.projectId)?.name : undefined,
      vendorId: alert.companyId,
      vendorName: alert.companyId ? vendorMap.get(alert.companyId)?.name : undefined,
      severity: alert.severity,
      createdAt: alert.createdAt
    });
  }
  return {
    openCount: rows.length,
    byType: Object.fromEntries(Array.from(counts.entries())),
    rows: rows.slice(0, 100)
  };
}
function buildTaskExceptionRow(
  task: Task,
  project: Project,
  type: DashboardTaskExceptionType,
  now: DateTime,
  userMap: Map<string, User>,
  vendorMap: Map<string, Company>,
  dueDate?: DateTime
): DashboardTaskExceptionRow {
  const vendorId = task.vendorId ?? projectVendorIds(project)[0];
  const vendorName = vendorId ? vendorMap.get(vendorId)?.name : undefined;
  return {
    taskId: task.id,
    title: task.title,
    projectId: project.id,
    projectName: project.name,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    assigneeId: task.assigneeUserId,
    assigneeName: task.assigneeUserId ? userDisplayName(userMap.get(task.assigneeUserId)) : undefined,
    vendorId,
    vendorName,
    exceptionType: type,
    daysOverdue: dueDate ? Math.max(0, Math.ceil(now.diff(dueDate, "days").days)) : undefined,
    blockedDays:
      type === "BLOCKED"
        ? Math.max(0, Math.ceil(now.diff(DateTime.fromISO(task.updatedAt), "days").days))
        : undefined,
    riskLevel: project.riskLevel,
    updatedAt: task.updatedAt
  };
}

function serializeFilters(filters: NormalizedDashboardFilters): DashboardFilterParams {
  return {
    dateFrom: filters.dateFrom.toISO() ?? undefined,
    dateTo: filters.dateTo.toISO() ?? undefined,
    timeGranularity: filters.timeGranularity,
    businessUnitIds: filters.businessUnitIds,
    productModuleIds: filters.productModuleIds,
    projectIds: filters.projectIds,
    vendorIds: filters.vendorIds,
    productManagerIds: filters.productManagerIds,
    statusList: filters.statusList,
    riskLevels: filters.riskLevels,
    healthList: filters.healthList
  };
}

function parseDate(value?: string): DateTime | null {
  if (!value) {
    return null;
  }
  const parsed = DateTime.fromISO(value);
  return parsed.isValid ? parsed : null;
}

function normalizeGranularity(value?: string): DashboardTimeGranularity {
  if (!value) {
    return "week";
  }
  const normalized = value.toLowerCase();
  if (["day", "week", "month", "quarter"].includes(normalized)) {
    return normalized as DashboardTimeGranularity;
  }
  return "week";
}

function normalizeProjectStatusList(values?: ProjectStatus[]): ProjectStatus[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const allowed: ProjectStatus[] = ["PROPOSED", "IN_PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];
  return values.filter((value) => allowed.includes(value));
}

function normalizeRiskList(values?: ProjectRiskLevel[]): ProjectRiskLevel[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const allowed: ProjectRiskLevel[] = ["LOW", "MEDIUM", "HIGH"];
  return values.filter((value) => allowed.includes(value));
}

function normalizeHealthList(values?: ProjectHealth[]): ProjectHealth[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const allowed: ProjectHealth[] = ["GREEN", "AMBER", "RED"];
  return values.filter((value) => allowed.includes(value));
}

function projectVendorIds(project: Project): string[] {
  const vendorIds = new Set<string>();
  project.vendorCompanyIds.forEach((vendorId) => vendorIds.add(vendorId));
  if (project.primaryVendorId) {
    vendorIds.add(project.primaryVendorId);
  }
  project.additionalVendorIds.forEach((vendorId) => vendorIds.add(vendorId));
  return Array.from(vendorIds);
}

function buildUserMap(users: User[]): Map<string, User> {
  return new Map(users.map((user) => [user.id, user]));
}

function buildCompanyMap(companies: Company[]): Map<string, Company> {
  return new Map(companies.map((company) => [company.id, company]));
}

function userDisplayName(user?: User): string | undefined {
  if (!user) {
    return undefined;
  }
  return `${user.profile.firstName} ${user.profile.lastName}`.trim();
}

function isWithinRange(value: string, from: DateTime, to: DateTime): boolean {
  const timestamp = DateTime.fromISO(value);
  if (!timestamp.isValid) {
    return false;
  }
  return (timestamp >= from || timestamp.hasSame(from, "day")) && (timestamp <= to || timestamp.hasSame(to, "day"));
}

function calculateWorkdays(from: DateTime, to: DateTime): number {
  let cursor = from.startOf("day");
  let workdays = 0;
  while (cursor <= to) {
    const weekday = cursor.weekday;
    if (weekday >= 1 && weekday <= 5) {
      workdays += 1;
    }
    cursor = cursor.plus({ days: 1 });
  }
  return workdays;
}

function aggregateTimeByProject(timeEntries: TimeEntry[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of timeEntries) {
    totals.set(entry.projectId, (totals.get(entry.projectId) ?? 0) + entry.minutes / 60);
  }
  return totals;
}

function aggregateTasksByProject(tasks: Task[]): Map<string, { total: number; done: number }> {
  const map = new Map<string, { total: number; done: number }>();
  for (const task of tasks) {
    if (!map.has(task.projectId)) {
      map.set(task.projectId, { total: 0, done: 0 });
    }
    const bucket = map.get(task.projectId)!;
    bucket.total += 1;
    if (task.status === "DONE") {
      bucket.done += 1;
    }
  }
  return map;
}

function groupByProject(alerts: Alert[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const alert of alerts) {
    if (alert.status !== "OPEN" || !alert.projectId) {
      continue;
    }
    counts.set(alert.projectId, (counts.get(alert.projectId) ?? 0) + 1);
  }
  return counts;
}

function computePlannedPercent(project: Project, asOf: DateTime): number {
  if (!project.startDate || !project.endDate) {
    return 100;
  }
  const start = DateTime.fromISO(project.startDate);
  const end = DateTime.fromISO(project.endDate);
  if (!start.isValid || !end.isValid || end <= start) {
    return 100;
  }
  const duration = end.diff(start, "days").days;
  const elapsed = Math.min(Math.max(asOf.diff(start, "days").days, 0), duration);
  const planned = Math.round((elapsed / duration) * 100);
  return Math.max(0, Math.min(100, planned));
}
function buildActiveProjectsCard(context: DashboardComputationContext): DashboardKpiCard {
  const active = context.projects.filter((project) => project.status === "ACTIVE").length;
  return {
    id: "active-projects",
    label: "Active Projects",
    primaryValue: String(active),
    secondaryText: `${context.projects.length} in scope`
  };
}

function buildOnTrackCard(context: DashboardComputationContext): DashboardKpiCard {
  const onTrack = context.projects.filter((project) => project.health === "GREEN").length;
  const atRisk = context.projects.filter((project) => project.health !== "GREEN").length;
  return {
    id: "on-track",
    label: "Projects On Track",
    primaryValue: `${onTrack}/${context.projects.length}`,
    secondaryText: `At risk: ${atRisk}`
  };
}

function buildVendorsOnlineCard(context: DashboardComputationContext): DashboardKpiCard {
  const projectVendors = new Map(context.projects.map((project) => [project.id, projectVendorIds(project)]));
  const timeVendors = new Set<string>();
  for (const entry of context.timeEntries) {
    for (const vendorId of projectVendors.get(entry.projectId) ?? []) {
      timeVendors.add(vendorId);
    }
  }
  const vendors = new Set<string>();
  context.projects.forEach((project) => projectVendorIds(project).forEach((id) => vendors.add(id)));
  return {
    id: "vendors-online",
    label: "Vendors Online",
    primaryValue: `${timeVendors.size}/${vendors.size || 1}`,
    secondaryText: timeVendors.size ? `${timeVendors.size} active during range` : "No vendor activity"
  };
}

function buildThroughputCard(context: DashboardComputationContext): DashboardKpiCard {
  const completed = context.tasks.filter(
    (task) => task.status === "DONE" && isWithinRange(task.updatedAt, context.filters.dateFrom, context.filters.dateTo)
  ).length;
  const previousFrom = context.filters.dateFrom.minus({ days: context.filters.rangeDays });
  const previousTo = context.filters.dateFrom.minus({ days: 1 });
  const previousCompleted = context.tasks.filter(
    (task) => task.status === "DONE" && isWithinRange(task.updatedAt, previousFrom, previousTo)
  ).length;
  const trend = computeTrend(completed, previousCompleted);
  return {
    id: "throughput",
    label: "Period Throughput",
    primaryValue: `${completed} tasks`,
    trendValue: trend.trendValue,
    trendDirection: trend.direction
  };
}

function buildOverdueTasksCard(context: DashboardComputationContext): DashboardKpiCard {
  const now = DateTime.now();
  const openTasks = context.tasks.filter((task) => task.status !== "DONE");
  const overdue = openTasks.filter((task) => task.dueDate && DateTime.fromISO(task.dueDate) < now).length;
  const share = openTasks.length ? Math.round((overdue / openTasks.length) * 100) : 0;
  return {
    id: "overdue-tasks",
    label: "Overdue Tasks",
    primaryValue: String(overdue),
    secondaryText: `${share}% of open work`
  };
}

function buildHoursLoggedCard(context: DashboardComputationContext): DashboardKpiCard {
  const hoursLogged = context.timeEntries.reduce((sum, entry) => sum + entry.minutes / 60, 0);
  const people = new Set<string>();
  context.timeEntries.forEach((entry) => people.add(entry.userId));
  context.projects.forEach((project) => {
    if (project.ownerId) {
      people.add(project.ownerId);
    }
    project.coreTeamUserIds.forEach((id) => people.add(id));
  });
  context.assignments.forEach((assignment) => {
    people.add(assignment.developerId);
    people.add(assignment.requestedById);
  });
  const expected =
    people.size > 0 ? calculateWorkdays(context.filters.dateFrom, context.filters.dateTo) * DEFAULT_DAILY_HOURS * people.size : 0;
  const ratio = expected > 0 ? Math.round((hoursLogged / expected) * 100) : 0;
  return {
    id: "hours-vs-expected",
    label: "Hours Logged vs Expected",
    primaryValue: `${hoursLogged.toFixed(1)}h`,
    secondaryText: expected ? `Expected ${expected.toFixed(1)}h (${ratio}%)` : "No expectation set"
  };
}

function buildBudgetCard(context: DashboardComputationContext): DashboardKpiCard {
  let budgetTotal = 0;
  let budgetSpent = 0;
  const timeByProject = aggregateTimeByProject(context.timeEntries);
  for (const project of context.projects) {
    const hours = timeByProject.get(project.id) ?? 0;
    const rate =
      project.approvedBudgetAmount && project.budgetHours
        ? project.approvedBudgetAmount / project.budgetHours
        : DEFAULT_BUDGET_RATE;
    budgetSpent += hours * rate;
    budgetTotal += project.approvedBudgetAmount ?? project.budgetHours * DEFAULT_BUDGET_RATE;
  }
  const burn = budgetTotal > 0 ? Math.round((budgetSpent / budgetTotal) * 100) : 0;
  return {
    id: "budget-burn",
    label: "Budget Burn",
    primaryValue: formatCurrency(budgetSpent),
    secondaryText: budgetTotal ? `of ${formatCurrency(budgetTotal)} (${burn}%)` : "No approved budget"
  };
}

function buildAlertsCard(context: DashboardComputationContext): DashboardKpiCard {
  const openAlerts = context.alerts.filter((alert) => alert.status === "OPEN");
  const top = openAlerts
    .reduce<Record<string, number>>((acc, alert) => {
      acc[alert.type] = (acc[alert.type] ?? 0) + 1;
      return acc;
    }, {});
  const topTypes = Object.entries(top)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([type]) => type)
    .join(", ");
  return {
    id: "automation-alerts",
    label: "Automation Alerts",
    primaryValue: String(openAlerts.length),
    secondaryText: topTypes ? `Top: ${topTypes}` : undefined,
    clickAction: { type: "navigate", payload: { href: "/alerts" } }
  };
}

function buildCycleTimeCard(context: DashboardComputationContext): DashboardKpiCard {
  const durations: number[] = [];
  for (const task of context.tasks) {
    if (task.status !== "DONE") {
      continue;
    }
    const created = DateTime.fromISO(task.createdAt);
    const completed = DateTime.fromISO(task.updatedAt);
    if (!created.isValid || !completed.isValid) {
      continue;
    }
    durations.push(Math.max(0, completed.diff(created, "days").days));
  }
  const avg = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
  return {
    id: "cycle-time",
    label: "Average Cycle Time",
    primaryValue: `${avg.toFixed(1)} days`,
    secondaryText: durations.length ? `${durations.length} tasks completed` : undefined
  };
}

function computeTrend(current: number, previous: number): { trendValue: string; direction: "up" | "down" | "flat" } {
  if (!previous) {
    return { trendValue: previous === current ? "0%" : "n/a", direction: "flat" };
  }
  const delta = Math.round(((current - previous) / previous) * 100);
  let direction: "up" | "down" | "flat" = "flat";
  if (delta > 0) {
    direction = "up";
  } else if (delta < 0) {
    direction = "down";
  }
  return { trendValue: `${delta}%`, direction };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function buildStatusDistributionChart(context: DashboardComputationContext): DashboardChartPayload {
  const counts: Record<ProjectStatus, number> = {
    PROPOSED: 0,
    IN_PLANNING: 0,
    ACTIVE: 0,
    ON_HOLD: 0,
    COMPLETED: 0,
    CANCELLED: 0
  };
  context.projects.forEach((project) => {
    counts[project.status] = (counts[project.status] ?? 0) + 1;
  });
  return {
    id: "portfolio_status_distribution",
    title: "Portfolio Status",
    type: "pie",
    series: Object.entries(counts).map(([status, value]) => ({ label: status, values: [value] }))
  };
}

function buildHealthByDimensionChart(context: DashboardComputationContext): DashboardChartPayload {
  const dimension = context.filters.productModuleIds.length ? "productModule" : "businessUnit";
  const categories = Array.from(
    new Set(context.projects.map((project) => (dimension === "productModule" ? project.productModule : project.businessUnit)))
  ).slice(0, 8);
  const healthValues: ProjectHealth[] = ["GREEN", "AMBER", "RED"];
  const series = healthValues.map((health) => ({
    label: health,
    values: categories.map((category) =>
      context.projects.filter(
        (project) =>
          project.health === health &&
          (dimension === "productModule" ? project.productModule === category : project.businessUnit === category)
      ).length
    )
  }));
  return {
    id: "project_health_by_bu_or_product",
    title: "Health by Segment",
    type: "stacked_bar",
    categories,
    series
  };
}

function buildProgressVsPlanChart(context: DashboardComputationContext): DashboardChartPayload {
  const rows = buildProjectRows(context).slice(0, 8);
  return {
    id: "progress_vs_plan",
    title: "Progress vs Plan",
    type: "bar",
    categories: rows.map((row) => row.name),
    series: [
      { label: "Actual", values: rows.map((row) => row.progressPercent) },
      { label: "Planned", values: rows.map((row) => row.plannedPercent) }
    ]
  };
}

function buildThroughputTrendChart(context: DashboardComputationContext): DashboardChartPayload {
  const buckets = buildTimeBuckets(context.filters.dateFrom, context.filters.dateTo, context.filters.timeGranularity);
  const completedCounts = new Array(buckets.length).fill(0);
  const createdCounts = new Array(buckets.length).fill(0);
  for (const task of context.tasks) {
    const createdIndex = findBucketIndex(DateTime.fromISO(task.createdAt), buckets);
    if (createdIndex !== -1) {
      createdCounts[createdIndex] += 1;
    }
    if (task.status === "DONE") {
      const completedIndex = findBucketIndex(DateTime.fromISO(task.updatedAt), buckets);
      if (completedIndex !== -1) {
        completedCounts[completedIndex] += 1;
      }
    }
  }
  return {
    id: "throughput_trend",
    title: "Throughput Trend",
    type: "line",
    categories: buckets.map((bucket) => bucket.label),
    series: [
      { label: "Completed", values: completedCounts },
      { label: "Created", values: createdCounts }
    ]
  };
}

function buildWipChart(context: DashboardComputationContext): DashboardChartPayload {
  const tasksByAssignee = new Map<
    string,
    {
      label: string;
      statusCounts: Record<TaskStatus, number>;
    }
  >();
  const statuses: TaskStatus[] = ["SELECTED", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"];
  const userMap = buildUserMap(context.users);
  for (const task of context.tasks) {
    const key = task.assigneeUserId ?? "unassigned";
    if (!tasksByAssignee.has(key)) {
      tasksByAssignee.set(key, {
        label: key === "unassigned" ? "Unassigned" : userDisplayName(userMap.get(key)) ?? "Unassigned",
        statusCounts: statuses.reduce((acc, status) => ({ ...acc, [status]: 0 }), {} as Record<TaskStatus, number>)
      });
    }
    const bucket = tasksByAssignee.get(key)!;
    if (statuses.includes(task.status)) {
      bucket.statusCounts[task.status] += 1;
    }
  }
  const topAssignees = Array.from(tasksByAssignee.values())
    .sort((a, b) => {
      const totalA = statuses.reduce((sum, status) => sum + a.statusCounts[status], 0);
      const totalB = statuses.reduce((sum, status) => sum + b.statusCounts[status], 0);
      return totalB - totalA;
    })
    .slice(0, 5);
  return {
    id: "wip_bottlenecks",
    title: "WIP by Assignee",
    type: "stacked_bar",
    categories: topAssignees.map((item) => item.label),
    series: statuses.map((status) => ({
      label: status,
      values: topAssignees.map((item) => item.statusCounts[status])
    }))
  };
}

function buildCapacityChart(context: DashboardComputationContext): DashboardChartPayload {
  const buckets = buildTimeBuckets(context.filters.dateFrom, context.filters.dateTo, context.filters.timeGranularity);
  const logged = new Array(buckets.length).fill(0);
  for (const entry of context.timeEntries) {
    const bucketIndex = findBucketIndex(DateTime.fromISO(entry.date), buckets);
    if (bucketIndex !== -1) {
      logged[bucketIndex] += entry.minutes / 60;
    }
  }
  const people = new Set<string>();
  context.timeEntries.forEach((entry) => people.add(entry.userId));
  const expected = buckets.map((bucket) => bucket.workdays * DEFAULT_DAILY_HOURS * people.size);
  return {
    id: "capacity_vs_expected",
    title: "Capacity vs Expected",
    type: "line",
    categories: buckets.map((bucket) => bucket.label),
    series: [
      { label: "Logged Hours", values: logged },
      { label: "Expected Hours", values: expected }
    ]
  };
}

function buildCompletedPendingChart(context: DashboardComputationContext): DashboardChartPayload {
  const rows = buildProjectRows(context).slice(0, 8);
  return {
    id: "completed_vs_pending_per_project",
    title: "Completed vs Pending",
    type: "bar",
    categories: rows.map((row) => row.name),
    series: [
      { label: "Completed", values: rows.map((row) => row.tasksDone) },
      { label: "Pending", values: rows.map((row) => Math.max(row.tasksTotal - row.tasksDone, 0)) }
    ]
  };
}

function buildMonthlyOverviewChart(context: DashboardComputationContext): DashboardChartPayload {
  const buckets = buildTimeBuckets(context.filters.dateFrom, context.filters.dateTo, "month");
  const completionPercent = new Array(buckets.length).fill(0);
  const completedProjects = new Array(buckets.length).fill(0);
  const cycleTimes = new Array(buckets.length).fill(0);
  const cycleCounts = new Array(buckets.length).fill(0);
  for (const project of context.projects) {
    if (project.status === "COMPLETED") {
      const idx = findBucketIndex(DateTime.fromISO(project.updatedAt), buckets);
      if (idx !== -1) {
        completedProjects[idx] += 1;
      }
    }
  }
  const tasksByBucket = buckets.map(() => ({ done: 0, total: 0 }));
  for (const task of context.tasks) {
    const idx = findBucketIndex(DateTime.fromISO(task.updatedAt), buckets);
    if (idx !== -1) {
      tasksByBucket[idx].total += 1;
      if (task.status === "DONE") {
        tasksByBucket[idx].done += 1;
        const created = DateTime.fromISO(task.createdAt);
        const completed = DateTime.fromISO(task.updatedAt);
        if (created.isValid && completed.isValid) {
          cycleTimes[idx] += Math.max(0, completed.diff(created, "days").days);
          cycleCounts[idx] += 1;
        }
      }
    }
  }
  completionPercent.forEach((_, index) => {
    completionPercent[index] = tasksByBucket[index].total
      ? Math.round((tasksByBucket[index].done / tasksByBucket[index].total) * 100)
      : 0;
  });
  return {
    id: "monthly_progress_overview",
    title: "Monthly Progress",
    type: "line",
    categories: buckets.map((bucket) => bucket.label),
    series: [
      { label: "Completion %", values: completionPercent },
      { label: "Completed Projects", values: completedProjects },
      {
        label: "Avg Cycle Time",
        values: cycleCounts.map((count, index) => (count ? Number((cycleTimes[index] / count).toFixed(1)) : 0))
      }
    ]
  };
}

function buildVendorSlaChart(context: DashboardComputationContext): DashboardChartPayload {
  const vendorRows = buildVendorRows(context).slice(0, 6);
  return {
    id: "vendor_performance_sla",
    title: "Vendor SLA",
    type: "radar",
    categories: vendorRows.map((row) => row.vendorName),
    series: [
      { label: "SLA %", values: vendorRows.map((row) => row.slaAdherencePercent) },
      { label: "Utilisation %", values: vendorRows.map((row) => row.utilisationPercent) }
    ]
  };
}

function buildRiskHeatmapChart(context: DashboardComputationContext): DashboardChartPayload {
  const probability: ProjectRiskLevel[] = ["LOW", "MEDIUM", "HIGH"];
  const impact: ProjectHealth[] = ["GREEN", "AMBER", "RED"];
  const matrix = probability.map(() => impact.map(() => 0));
  context.projects.forEach((project) => {
    const probIndex = probability.indexOf(project.riskLevel);
    const impactIndex = impact.indexOf(project.health);
    if (probIndex !== -1 && impactIndex !== -1) {
      matrix[probIndex][impactIndex] += 1;
    }
  });
  return {
    id: "risk_issue_heatmap",
    title: "Risk vs Impact",
    type: "heatmap",
    categories: probability,
    series: impact.map((label, columnIndex) => ({
      label,
      values: matrix.map((row) => row[columnIndex])
    }))
  };
}

type TimeBucket = {
  start: DateTime;
  end: DateTime;
  label: string;
  workdays: number;
};

function buildTimeBuckets(from: DateTime, to: DateTime, granularity: DashboardTimeGranularity): TimeBucket[] {
  const buckets: TimeBucket[] = [];
  let cursor = from.startOf("day");
  while (cursor <= to) {
    let end: DateTime;
    if (granularity === "day") {
      end = cursor.endOf("day");
    } else if (granularity === "week") {
      end = cursor.plus({ weeks: 1 }).minus({ days: 1 }).endOf("day");
    } else if (granularity === "month") {
      end = cursor.endOf("month");
    } else {
      end = cursor.plus({ months: 3 }).minus({ days: 1 }).endOf("day");
    }
    if (end > to) {
      end = to;
    }
    buckets.push({
      start: cursor,
      end,
      label: formatBucketLabel(cursor, granularity),
      workdays: calculateWorkdays(cursor, end)
    });
    cursor = end.plus({ days: 1 }).startOf("day");
  }
  return buckets;
}

function formatBucketLabel(date: DateTime, granularity: DashboardTimeGranularity): string {
  if (granularity === "day") {
    return date.toFormat("MMM dd");
  }
  if (granularity === "week") {
    const weekNumber = date.weekNumber.toString().padStart(2, "0");
    return `${date.year}-W${weekNumber}`;
  }
  if (granularity === "month") {
    return date.toFormat("MMM yyyy");
  }
  const quarter = Math.ceil(date.month / 3);
  return `Q${quarter} ${date.year}`;
}

function findBucketIndex(target: DateTime, buckets: TimeBucket[]): number {
  if (!target.isValid) {
    return -1;
  }
  return buckets.findIndex((bucket) => target >= bucket.start && target <= bucket.end);
}
