import { DateTime } from "luxon";
import { readDatabase } from "../data/db";
import {
  Alert,
  Company,
  Project,
  PublicUser,
  Task,
  Timesheet,
  User,
  WorkSchedule
} from "../models/_types";

export const DEFAULT_CHAT_CONTEXT_CHIPS = ["project", "this-week", "my-tasks"];

export interface ChatContextProjectSummary {
  id: string;
  name: string;
  code: string;
  status: Project["status"];
  vendorCompanyIds: string[];
  vendorNames: string[];
  openTasks: number;
  blockedTasks: number;
  activeTasks: number;
  budgetHours: number;
  updatedAt: string;
}

export interface ChatContextTaskSummary {
  id: string;
  title: string;
  status: Task["status"];
  projectId: string;
  projectName?: string;
  dueDate?: string;
  blockedDays?: number;
  updatedAt: string;
  expectedCompletionDate?: string;
}

export interface ChatContextAlertSummary {
  openCount: number;
  items: Array<{
    id: string;
    type: Alert["type"];
    message: string;
    projectId?: string;
    userId?: string;
    ageDays: number;
  }>;
}

export interface ChatContextTimesheetSummary {
  recent: Array<{
    id: string;
    weekStart: string;
    weekEnd: string;
    status: Timesheet["status"];
    totalMinutes: number;
    submittedAt?: string;
    approvedAt?: string;
  }>;
}

export interface ChatContextVendorSummary {
  companyId: string;
  companyName: string;
  activeProjects: number;
  blockedTasks: number;
  contributors: string[];
  timesheetStatuses: Record<string, number>;
}

export interface ChatContext {
  generatedAt: string;
  selectedChips: string[];
  user: {
    id: string;
    name: string;
    role: PublicUser["role"];
    email: string;
    location: string;
    timeZone: string;
    title?: string;
    companyId?: string;
    companyName?: string;
  };
  company?: {
    id: string;
    name: string;
    type: Company["type"];
  };
  projects: ChatContextProjectSummary[];
  tasks: ChatContextTaskSummary[];
  blockedTasks: ChatContextTaskSummary[];
  alerts: ChatContextAlertSummary;
  timesheets: ChatContextTimesheetSummary;
  vendors: ChatContextVendorSummary[];
  schedule?: {
    id: string;
    name: string;
    timeZone: string;
    slots: WorkSchedule["slots"];
  };
  currentWeek: {
    start: string;
    end: string;
  };
}

export async function buildChatContext(user: PublicUser, chips: string[] = []): Promise<ChatContext> {
  const selectedChips = chips.length ? normalizeChips(chips) : DEFAULT_CHAT_CONTEXT_CHIPS;
  const db = await readDatabase();
  const company = user.companyId ? db.companies.find((candidate) => candidate.id === user.companyId) : undefined;

  // Security: Filter projects based on user access
  // Stricter filtering: Only show projects where user is a direct participant or vendor.
  // This excludes general "company access" to prevent information overload/leaks in AI context.
  const projects = db.projects.filter((project) => {
    if (user.role === "SUPER_ADMIN" || user.role === "VP") return true;
    
    const isParticipant = 
      project.ownerId === user.id ||
      project.sponsorUserId === user.id ||
      project.deliveryManagerUserId === user.id ||
      project.coreTeamUserIds.includes(user.id) ||
      project.stakeholderUserIds.includes(user.id);
      
    if (isParticipant) return true;
    
    if (user.companyId && project.vendorCompanyIds.includes(user.companyId)) return true;
    
    return false;
  });
  
  const projectMap = new Map<string, Project>(projects.map((project) => [project.id, project]));
  const visibleProjectIds = new Set(projects.map((p) => p.id));

  const vendorMap = new Map<string, Company>(db.companies.filter((c) => c.type === "VENDOR").map((vendor) => [vendor.id, vendor]));
  const schedule = company
    ? db.workSchedules.find((record) => record.companyId === company.id) ?? null
    : null;

  // Security: Filter tasks to only those in visible projects
  const visibleTasks = db.tasks.filter((task) => visibleProjectIds.has(task.projectId));
  const taskSummaries = buildTaskSummaries(visibleTasks, projectMap);
  
  const blockedTasks = taskSummaries.filter((task) => task.status === "BLOCKED");
  
  // Security: Filter alerts
  const alerts = buildAlertSummary(db.alerts, visibleProjectIds, user.id);
  
  const timesheets = buildTimesheetSummary(db.timesheets, user.id);
  const vendorSummaries = buildVendorSummaries({
    vendorMap,
    projects,
    tasks: taskSummaries,
    users: db.users,
    timesheets: db.timesheets
  }).filter(v => v.activeProjects > 0);
  const now = DateTime.now();
  const userZone = user.profile.timeZone || "UTC";
  const nowInZone = now.setZone(userZone);
  const currentWeek = {
    start: nowInZone.startOf("week").toISO() ?? "",
    end: nowInZone.endOf("week").toISO() ?? ""
  };

  return {
    generatedAt: now.toISO(),
    selectedChips,
    user: {
      id: user.id,
      name: `${user.profile.firstName} ${user.profile.lastName}`.trim(),
      role: user.role,
      email: user.email,
      location: [user.profile.city, user.profile.country].filter(Boolean).join(", "),
      timeZone: userZone,
      title: user.profile.title,
      companyId: user.companyId,
      companyName: company?.name
    },
    company: company
      ? {
          id: company.id,
          name: company.name,
          type: company.type
        }
      : undefined,
    schedule: schedule
      ? {
          id: schedule.id,
          name: schedule.name,
          timeZone: schedule.timeZone,
          slots: schedule.slots
        }
      : undefined,
    projects: buildProjectSummaries(projects, taskSummaries, vendorMap),
    tasks: taskSummaries,
    blockedTasks,
    alerts,
    timesheets,
    vendors: vendorSummaries,
    currentWeek
  };
}

function normalizeChips(chips: string[]) {
  return Array.from(new Set(chips.map((chip) => chip.trim()).filter(Boolean)));
}

function buildTaskSummaries(tasks: Task[], projectMap: Map<string, Project>): ChatContextTaskSummary[] {
  const now = DateTime.now();
  return tasks
    .map((task) => {
      const project = projectMap.get(task.projectId);
      const updatedAt = task.updatedAt ?? task.createdAt;
      const updatedDiff = Math.max(0, Math.floor(now.diff(DateTime.fromISO(updatedAt), "days").days));
      const blockedDays = task.status === "BLOCKED" ? updatedDiff : undefined;
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        projectId: task.projectId,
        projectName: project?.name,
        dueDate: task.dueDate,
        expectedCompletionDate: task.expectedCompletionDate,
        blockedDays,
        updatedAt
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function buildProjectSummaries(
  projects: Project[],
  tasks: ChatContextTaskSummary[],
  vendorMap: Map<string, Company>
): ChatContextProjectSummary[] {
  const taskByProject = tasks.reduce<Record<string, ChatContextTaskSummary[]>>((acc, task) => {
    acc[task.projectId] = acc[task.projectId] || [];
    acc[task.projectId].push(task);
    return acc;
  }, {});

  return projects
    .map((project) => {
      const projectTasks = taskByProject[project.id] ?? [];
      const blockedTasks = projectTasks.filter((task) => task.status === "BLOCKED");
      const activeTasks = projectTasks.filter((task) => task.status === "IN_PROGRESS" || task.status === "SELECTED");
      const vendorNames = project.vendorCompanyIds
        .map((vendorId) => vendorMap.get(vendorId)?.name)
        .filter((name): name is string => Boolean(name));

      return {
        id: project.id,
        name: project.name,
        code: project.code,
        status: project.status,
        vendorCompanyIds: project.vendorCompanyIds,
        vendorNames,
        openTasks: projectTasks.length,
        blockedTasks: blockedTasks.length,
        activeTasks: activeTasks.length,
        budgetHours: project.budgetHours,
        updatedAt: project.updatedAt
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function buildAlertSummary(alerts: Alert[], visibleProjectIds: Set<string>, userId: string): ChatContextAlertSummary {
  const now = DateTime.now();
  const openAlerts = alerts.filter((alert) => {
    if (alert.status !== "OPEN") return false;
    if (alert.projectId && visibleProjectIds.has(alert.projectId)) return true;
    if (alert.userId === userId) return true;
    return false;
  });
  
  return {
    openCount: openAlerts.length,
    items: openAlerts
      .map((alert) => ({
        id: alert.id,
        type: alert.type,
        message: alert.message,
        projectId: alert.projectId,
        userId: alert.userId,
        ageDays: Math.floor(now.diff(DateTime.fromISO(alert.createdAt), "days").days)
      }))
      .sort((a, b) => b.ageDays - a.ageDays)
      .slice(0, 5)
  };
}

function buildTimesheetSummary(timesheets: Timesheet[], userId: string): ChatContextTimesheetSummary {
  return {
    recent: timesheets
      .filter((sheet) => sheet.userId === userId)
      .map((sheet) => ({
        id: sheet.id,
        weekStart: sheet.weekStart,
        weekEnd: sheet.weekEnd,
        status: sheet.status,
        totalMinutes: sheet.totalMinutes,
        submittedAt: sheet.submittedAt,
        approvedAt: sheet.approvedAt
      }))
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      .slice(0, 5)
  };
}

function buildVendorSummaries({
  vendorMap,
  projects,
  tasks,
  users,
  timesheets
}: {
  vendorMap: Map<string, Company>;
  projects: Project[];
  tasks: ChatContextTaskSummary[];
  users: User[];
  timesheets: Timesheet[];
}): ChatContextVendorSummary[] {
  if (!vendorMap.size) {
    return [];
  }
  const usersByCompany = users.reduce<Record<string, User[]>>((acc, user) => {
    if (!user.companyId) {
      return acc;
    }
    acc[user.companyId] = acc[user.companyId] || [];
    acc[user.companyId].push(user);
    return acc;
  }, {});
  const timesheetsByUser = timesheets.reduce<Record<string, Timesheet[]>>((acc, sheet) => {
    acc[sheet.userId] = acc[sheet.userId] || [];
    acc[sheet.userId].push(sheet);
    return acc;
  }, {});

  return Array.from(vendorMap.values()).map((vendor) => {
    const vendorProjects = projects.filter((project) => project.vendorCompanyIds.includes(vendor.id));
    const projectIds = new Set(vendorProjects.map((project) => project.id));
    const vendorTasks = tasks.filter((task) => projectIds.has(task.projectId));
    const vendorUsers = usersByCompany[vendor.id] ?? [];
    const contributors = vendorUsers.map(
      (person) => `${person.profile.firstName} ${person.profile.lastName}`.trim()
    );
    const timesheetStatuses = vendorUsers.reduce<Record<string, number>>((acc, person) => {
      const sheets = timesheetsByUser[person.id] ?? [];
      sheets.forEach((sheet) => {
        acc[sheet.status] = (acc[sheet.status] ?? 0) + 1;
      });
      return acc;
    }, {});

    return {
      companyId: vendor.id,
      companyName: vendor.name,
      activeProjects: vendorProjects.length,
      blockedTasks: vendorTasks.filter((task) => task.status === "BLOCKED").length,
      contributors,
      timesheetStatuses
    };
  });
}
