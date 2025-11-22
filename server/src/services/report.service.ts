import { DateTime } from "luxon";
import { readDatabase } from "../data/db";
import { HttpError } from "../middleware/httpError";
import {
  Company,
  Project,
  Role,
  Task,
  TimesheetStatus,
  TimeEntry,
  Timesheet,
  User,
  PublicUser
} from "../models/_types";

const STATUS_ORDER: TimesheetStatus[] = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"];

type DateRange = {
  from: DateTime;
  to: DateTime;
  fromISO: string;
  toISO: string;
};

export type VendorPerformanceReport = {
  vendor: Pick<Company, "id" | "name">;
  range: { from: string; to: string };
  totals: {
    totalMinutes: number;
    hoursLogged: number;
    tasksTouched: number;
    blockedTasks: number;
    onTrackTasks: number;
    averageHoursPerTask: number;
  };
  contributors: Array<{
    userId: string;
    name: string;
    role: Role;
    totalMinutes: number;
    entryCount: number;
  }>;
  tasks: Array<{
    taskId: string;
    title: string;
    status: Task["status"];
    projectId: string;
    projectName?: string;
    minutesLogged: number;
    lastEntryAt?: string | null;
    dueDate?: string;
  }>;
};

export type TimesheetSummaryGroup = "user" | "project";

export type TimesheetSummaryReport = {
  range: { from: string; to: string };
  groupBy: TimesheetSummaryGroup;
  totals: {
    totalMinutes: number;
    entryCount: number;
  };
  rows: Array<{
    key: string;
    label: string;
    totalMinutes: number;
    entryCount: number;
    timesheetStatusCounts?: Record<TimesheetStatus, number>;
  }>;
};

export type ExecutiveWorkstreamSummary = {
  id: string;
  workItem: string;
  owner: string;
  status: string;
};

export type ExecutiveSummary = {
  activeProjects: number;
  onboardingProjects: number;
  vendorsOnline: number;
  totalVendors: number;
  weeklyThroughputTasks: number;
  weeklyThroughputChangePercent: number | null;
  workstreams: ExecutiveWorkstreamSummary[];
};

export async function getVendorPerformanceReport(
  actor: PublicUser,
  input: {
    companyId?: string;
    from?: string;
    to?: string;
  }
): Promise<VendorPerformanceReport> {
  const range = normalizeRange(input.from, input.to);
  const db = await readDatabase();
  const vendor = determineCompanyScope(actor, input.companyId, db.companies, { requireVendor: true });

  const projectIds = new Set(
    db.projects.filter((project) => project.vendorCompanyIds.includes(vendor.id)).map((project) => project.id)
  );
  const tasks = db.tasks.filter((task) => projectIds.has(task.projectId));
  const taskIds = new Set(tasks.map((task) => task.id));
  const timeEntries = db.timeEntries.filter(
    (entry) => taskIds.has(entry.taskId) && isDateWithinRange(entry.date, range)
  );

  const projectLookup = new Map<string, Project>(db.projects.map((project) => [project.id, project]));
  const contributors = summarizeContributors(timeEntries, db.users);
  const taskSummaries = summarizeTasks(tasks, timeEntries, projectLookup);
  const totalMinutes = timeEntries.reduce((acc, entry) => acc + entry.minutes, 0);
  const tasksTouched = taskSummaries.filter((task) => task.minutesLogged > 0).length;
  const blockedTasks = taskSummaries.filter((task) => task.status === "BLOCKED").length;
  const onTrackTasks = taskSummaries.filter((task) => ["IN_PROGRESS", "SELECTED"].includes(task.status)).length;
  const hoursLogged = totalMinutes / 60;

  return {
    vendor: { id: vendor.id, name: vendor.name },
    range: { from: range.fromISO, to: range.toISO },
    totals: {
      totalMinutes,
      hoursLogged,
      tasksTouched,
      blockedTasks,
      onTrackTasks,
      averageHoursPerTask: tasksTouched ? hoursLogged / tasksTouched : 0
    },
    contributors,
    tasks: taskSummaries
  };
}

export async function getTimesheetSummaryReport(
  actor: PublicUser,
  input: {
    companyId?: string;
    from?: string;
    to?: string;
    groupBy?: TimesheetSummaryGroup;
  }
): Promise<TimesheetSummaryReport> {
  const range = normalizeRange(input.from, input.to);
  const groupBy: TimesheetSummaryGroup = input.groupBy === "project" ? "project" : "user";
  const db = await readDatabase();
  const company = determineCompanyScope(actor, input.companyId, db.companies);
  const isGlobalHumainScope = !input.companyId && company.type === "HUMAIN";
  const scopedUsers = isGlobalHumainScope
    ? db.users.filter((user) => Boolean(user.companyId))
    : db.users.filter((user) => user.companyId === company.id);
  const allowedUserIds = new Set(scopedUsers.map((user) => user.id));
  const projectLookup = new Map<string, Project>(db.projects.map((project) => [project.id, project]));
  const userLookup = new Map<string, User>(scopedUsers.map((user) => [user.id, user]));

  const relevantEntries = db.timeEntries.filter(
    (entry) => allowedUserIds.has(entry.userId) && isDateWithinRange(entry.date, range)
  );
  const rowsByKey = new Map<
    string,
    {
      key: string;
      label: string;
      totalMinutes: number;
      entryCount: number;
      timesheetStatusCounts?: Record<TimesheetStatus, number>;
    }
  >();

  for (const entry of relevantEntries) {
    const key = groupBy === "project" ? entry.projectId : entry.userId;
    if (!key) {
      continue;
    }
    const label =
      groupBy === "project"
        ? describeProject(projectLookup.get(entry.projectId))
        : describeUser(userLookup.get(entry.userId));
    if (!label) {
      continue;
    }
    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, {
        key,
        label,
        totalMinutes: 0,
        entryCount: 0,
        timesheetStatusCounts: groupBy === "user" ? initStatusCounts() : undefined
      });
    }
    const row = rowsByKey.get(key)!;
    row.totalMinutes += entry.minutes;
    row.entryCount += 1;
  }

  if (groupBy === "user") {
    const scopedTimesheets = db.timesheets.filter((timesheet) => allowedUserIds.has(timesheet.userId));
    attachTimesheetStatuses(rowsByKey, scopedTimesheets, range);
  }

  const rows = Array.from(rowsByKey.values()).sort((a, b) => {
    if (b.totalMinutes === a.totalMinutes) {
      return a.label.localeCompare(b.label);
    }
    return b.totalMinutes - a.totalMinutes;
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.totalMinutes += row.totalMinutes;
      acc.entryCount += row.entryCount;
      return acc;
    },
    { totalMinutes: 0, entryCount: 0 }
  );

  return {
    range: { from: range.fromISO, to: range.toISO },
    groupBy,
    totals,
    rows
  };
}

export async function getExecutiveSummary(actor: PublicUser): Promise<ExecutiveSummary> {
  const db = await readDatabase();

  const activeProjects = db.projects.filter((project) => project.status === "ACTIVE").length;
  const onboardingProjects = db.projects.filter((project) => project.status === "IN_PLANNING").length;

  const companyLookup = new Map(db.companies.map((company) => [company.id, company]));
  const vendorUsers = db.users.filter((user) => {
    if (!user.isActive || !user.companyId) {
      return false;
    }
    const company = companyLookup.get(user.companyId);
    if (!company || company.type !== "VENDOR") {
      return false;
    }
    return ["DEVELOPER", "ENGINEER"].includes(user.role);
  });
  const vendorUserIds = new Set(vendorUsers.map((user) => user.id));
  const vendorsOnline = db.attendanceRecords.filter(
    (record) => vendorUserIds.has(record.userId) && record.status === "OPEN"
  ).length;
  const totalVendors = vendorUsers.length;

  const currentRange = normalizeRange();
  const previousRange: DateRange = {
    from: currentRange.from.minus({ days: 7 }),
    to: currentRange.from.minus({ milliseconds: 1 }),
    fromISO: currentRange.from.minus({ days: 7 }).toISO() ?? "",
    toISO: currentRange.from.minus({ milliseconds: 1 }).toISO() ?? ""
  };

  const currentThroughputTasks = countTasksWithActivity(db.timeEntries, currentRange);
  const previousThroughputTasks = countTasksWithActivity(db.timeEntries, previousRange);

  let weeklyThroughputChangePercent: number | null = null;
  if (previousThroughputTasks > 0) {
    weeklyThroughputChangePercent =
      ((currentThroughputTasks - previousThroughputTasks) / previousThroughputTasks) * 100;
  }

  const workstreams = buildExecutiveWorkstreams(db.projects, db.tasks, db.users);

  return {
    activeProjects,
    onboardingProjects,
    vendorsOnline,
    totalVendors,
    weeklyThroughputTasks: currentThroughputTasks,
    weeklyThroughputChangePercent,
    workstreams
  };
}

export function vendorPerformanceReportToCsv(report: VendorPerformanceReport): string {
  const lines: string[] = [];
  lines.push(
    buildCsvRow(["Task Title", "Project", "Status", "Minutes Logged", "Hours Logged", "Last Entry Date", "Due Date"])
  );
  for (const task of report.tasks) {
    lines.push(
      buildCsvRow([
        task.title,
        task.projectName ?? "",
        task.status,
        task.minutesLogged,
        (task.minutesLogged / 60).toFixed(2),
        task.lastEntryAt ?? "",
        task.dueDate ?? ""
      ])
    );
  }
  lines.push("");
  lines.push(buildCsvRow(["Contributor", "Role", "Minutes Logged", "Hours Logged", "Entry Count"]));
  for (const contributor of report.contributors) {
    lines.push(
      buildCsvRow([
        contributor.name,
        contributor.role,
        contributor.totalMinutes,
        (contributor.totalMinutes / 60).toFixed(2),
        contributor.entryCount
      ])
    );
  }
  return lines.join("\n");
}

export function timesheetSummaryReportToCsv(report: TimesheetSummaryReport): string {
  const headers = ["Label", "Minutes Logged", "Hours Logged", "Entry Count"];
  const includeStatuses = report.groupBy === "user";
  const lines: string[] = [];
  const headerLine = includeStatuses
    ? buildCsvRow([...headers, ...STATUS_ORDER])
    : buildCsvRow(headers);
  lines.push(headerLine);
  for (const row of report.rows) {
    const baseRow = [
      row.label,
      row.totalMinutes,
      (row.totalMinutes / 60).toFixed(2),
      row.entryCount
    ];
    if (includeStatuses) {
      const statusCounts = STATUS_ORDER.map((status) => row.timesheetStatusCounts?.[status] ?? 0);
      lines.push(buildCsvRow([...baseRow, ...statusCounts]));
    } else {
      lines.push(buildCsvRow(baseRow));
    }
  }
  return lines.join("\n");
}

type CompanyScopeOptions = {
  requireVendor?: boolean;
};

function determineCompanyScope(
  actor: PublicUser,
  requestedCompanyId: string | undefined,
  companies: Company[],
  options: CompanyScopeOptions = {}
): Company {
  const companyMap = new Map(companies.map((company) => [company.id, company]));
  const targetId = requestedCompanyId ?? actor.companyId;
  if (!targetId) {
    throw new HttpError(400, "companyId is required.");
  }
  const targetCompany = companyMap.get(targetId);
  if (!targetCompany) {
    throw new HttpError(404, "Company not found.");
  }
  if (options.requireVendor && targetCompany.type !== "VENDOR") {
    throw new HttpError(400, "Vendor company required.");
  }
  if (["DEVELOPER", "ENGINEER", "VIEWER"].includes(actor.role)) {
    throw new HttpError(403, "Insufficient permissions for this report.");
  }
  if (actor.role === "PROJECT_MANAGER") {
    if (!actor.companyId || actor.companyId !== targetCompany.id) {
      throw new HttpError(403, "Cannot access reports outside your vendor.");
    }
    return targetCompany;
  }
  if (["PM", "SUPER_ADMIN", "VP"].includes(actor.role)) {
    if (!actor.companyId) {
      return targetCompany;
    }
    const actorCompany = companyMap.get(actor.companyId);
    if (actorCompany?.type === "HUMAIN") {
      return targetCompany;
    }
    if (actor.companyId !== targetCompany.id) {
      throw new HttpError(403, "Cannot access reports outside your tenant.");
    }
    return targetCompany;
  }
  throw new HttpError(403, "Insufficient permissions for this report.");
}

function normalizeRange(from?: string, to?: string): DateRange {
  const now = DateTime.now();
  let start = from ? DateTime.fromISO(from) : now.minus({ days: 7 });
  let end = to ? DateTime.fromISO(to) : now;
  if (!start.isValid) {
    throw new HttpError(400, "Invalid from date.");
  }
  if (!end.isValid) {
    throw new HttpError(400, "Invalid to date.");
  }
  if (start > end) {
    [start, end] = [end, start];
  }
  start = start.startOf("day");
  end = end.endOf("day");
  return {
    from: start,
    to: end,
    fromISO: start.toISO() ?? "",
    toISO: end.toISO() ?? ""
  };
}

function isDateWithinRange(date: string, range: DateRange) {
  const candidate = DateTime.fromISO(date);
  if (!candidate.isValid) {
    return false;
  }
  return candidate >= range.from && candidate <= range.to;
}

function countTasksWithActivity(entries: TimeEntry[], range: DateRange): number {
  const taskIds = new Set<string>();
  for (const entry of entries) {
    if (isDateWithinRange(entry.date, range)) {
      taskIds.add(entry.taskId);
    }
  }
  return taskIds.size;
}

function buildExecutiveWorkstreams(projects: Project[], tasks: Task[], users: User[]): ExecutiveWorkstreamSummary[] {
  const projectLookup = new Map(projects.map((project) => [project.id, project]));
  const userLookup = new Map(users.map((user) => [user.id, user]));

  const candidateTasks = tasks
    .filter((task) => ["IN_PROGRESS", "BLOCKED", "SELECTED"].includes(task.status))
    .sort((a, b) => {
      if (a.status === b.status) {
        return (a.dueDate ?? a.createdAt).localeCompare(b.dueDate ?? b.createdAt);
      }
      const order: Record<Task["status"], number> = {
        BLOCKED: 0,
        IN_PROGRESS: 1,
        SELECTED: 2,
        BACKLOG: 3,
        DONE: 4
      };
      return order[a.status] - order[b.status];
    })
    .slice(0, 5);

  return candidateTasks.map((task) => {
    const project = projectLookup.get(task.projectId);
    const owner = project ? userLookup.get(project.ownerId) : undefined;
    const ownerName = owner ? `${owner.profile.firstName} ${owner.profile.lastName}`.trim() : "Unassigned";
    const code = project ? `${project.code}-${task.id.slice(0, 4).toUpperCase()}` : task.id;
    return {
      id: code,
      workItem: task.title,
      owner: ownerName,
      status: formatTaskStatusForExecutive(task.status)
    };
  });
}

function formatTaskStatusForExecutive(status: Task["status"]): string {
  switch (status) {
    case "IN_PROGRESS":
      return "In progress";
    case "BLOCKED":
      return "Blocked";
    case "SELECTED":
      return "Selected";
    case "DONE":
      return "Done";
    case "BACKLOG":
    default:
      return "Backlog";
  }
}

function summarizeContributors(entries: TimeEntry[], users: User[]) {
  const userLookup = new Map<string, User>(users.map((user) => [user.id, user]));
  const summary = new Map<
    string,
    {
      userId: string;
      name: string;
      role: Role;
      totalMinutes: number;
      entryCount: number;
    }
  >();
  for (const entry of entries) {
    const user = userLookup.get(entry.userId);
    if (!user) {
      continue;
    }
    if (!summary.has(entry.userId)) {
      summary.set(entry.userId, {
        userId: entry.userId,
        name: `${user.profile.firstName} ${user.profile.lastName}`.trim(),
        role: user.role,
        totalMinutes: 0,
        entryCount: 0
      });
    }
    const bucket = summary.get(entry.userId)!;
    bucket.totalMinutes += entry.minutes;
    bucket.entryCount += 1;
  }
  return Array.from(summary.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
}

function summarizeTasks(
  tasks: Task[],
  entries: TimeEntry[],
  projectLookup: Map<string, Project>
): VendorPerformanceReport["tasks"] {
  const entriesByTask = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    if (!entriesByTask.has(entry.taskId)) {
      entriesByTask.set(entry.taskId, []);
    }
    entriesByTask.get(entry.taskId)!.push(entry);
  }
  return tasks
    .map((task) => {
      const project = projectLookup.get(task.projectId);
      const taskEntries = entriesByTask.get(task.id) ?? [];
      const minutesLogged = taskEntries.reduce((acc, entry) => acc + entry.minutes, 0);
      const lastEntry = taskEntries.reduce<string | null>((latest, entry) => {
        if (!latest || entry.date > latest) {
          return entry.date;
        }
        return latest;
      }, null);
      return {
        taskId: task.id,
        title: task.title,
        status: task.status,
        projectId: task.projectId,
        projectName: project?.name,
        minutesLogged,
        lastEntryAt: lastEntry,
        dueDate: task.dueDate
      };
    })
    .sort((a, b) => b.minutesLogged - a.minutesLogged);
}

function describeProject(project?: Project) {
  if (!project) {
    return null;
  }
  return `${project.name} (${project.code})`;
}

function describeUser(user?: User) {
  if (!user) {
    return null;
  }
  return `${user.profile.firstName} ${user.profile.lastName}`.trim();
}

function initStatusCounts(): Record<TimesheetStatus, number> {
  return {
    DRAFT: 0,
    SUBMITTED: 0,
    APPROVED: 0,
    REJECTED: 0
  };
}

function attachTimesheetStatuses(
  rows: Map<
    string,
    {
      timesheetStatusCounts?: Record<TimesheetStatus, number>;
    }
  >,
  timesheets: Timesheet[],
  range: DateRange
) {
  for (const timesheet of timesheets) {
    const weekStart = DateTime.fromISO(timesheet.weekStart);
    const weekEnd = DateTime.fromISO(timesheet.weekEnd);
    if (!weekStart.isValid || !weekEnd.isValid) {
      continue;
    }
    if (weekEnd < range.from || weekStart > range.to) {
      continue;
    }
    const row = rows.get(timesheet.userId);
    if (!row?.timesheetStatusCounts) {
      continue;
    }
    row.timesheetStatusCounts[timesheet.status] =
      (row.timesheetStatusCounts[timesheet.status] ?? 0) + 1;
  }
}

function buildCsvRow(values: Array<string | number>) {
  return values
    .map((value) => {
      const text = String(value ?? "");
      if (text.includes(",") || text.includes("\n") || text.includes('"')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    })
    .join(",");
}
