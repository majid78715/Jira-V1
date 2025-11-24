import { DateTime } from "luxon";
import {
  Company,
  CompanyHoliday,
  DayOff,
  Project,
  PublicUser,
  TimeEntry,
  WorkScheduleSlot
} from "../models/_types";
import {
  findWorkScheduleForUser,
  listAlerts,
  listCompanies,
  listCompanyHolidays,
  listDayOffs,
  listProjects,
  listTimeEntries,
  listUsers
} from "../data/repositories";
import { resolveScheduleSlots } from "../utils/scheduleCompliance";

export type DigestRow = {
  label: string;
  value?: string;
  meta?: string;
  href?: string;
};

export type DigestSection = {
  title: string;
  rows: DigestRow[];
};

export type DigestPayload = {
  userId: string;
  message: string;
  type: "WEEKLY_DIGEST" | "MONTHLY_DIGEST";
  metadata: {
    digestType: "WEEKLY" | "MONTHLY";
    periodStart: string;
    periodEnd: string;
    headline: string;
    sections: DigestSection[];
  };
};

type ScheduleInfo = {
  timeZone: string;
  slots: Array<WorkScheduleSlot & { lengthMinutes: number }>;
};

type DigestContext = {
  digestType: "WEEKLY" | "MONTHLY";
  periodStart: string;
  periodEnd: string;
  headline: string;
  label: string;
};

type BaseDigestData = {
  users: PublicUser[];
  projects: Project[];
  projectLookup: Map<string, Project>;
  timeEntries: TimeEntry[];
  entriesByUser: Map<string, TimeEntry[]>;
  userProjectMinutes: Map<string, Map<string, number>>;
  projectMinutes: Map<string, number>;
  entriesByUserDay: Map<string, Map<string, number>>;
  dayOffSets: Map<string, Set<string>>;
  holidayLookup: Map<string, Set<string>>;
  schedules: Map<string, ScheduleInfo>;
  humainCompany?: Company;
  ceoUser?: PublicUser;
};

const TIME_ROLES: PublicUser["role"][] = ["DEVELOPER", "ENGINEER"];

export async function buildWeeklyDigestPayloads(periodStart: string, periodEnd: string): Promise<DigestPayload[]> {
  const context = buildDigestContext("WEEKLY", periodStart, periodEnd);
  const data = await loadBaseDigestData(periodStart, periodEnd);
  const payloads: DigestPayload[] = [];

  for (const user of data.users) {
    if (!user.isActive) {
      continue;
    }
    if (TIME_ROLES.includes(user.role)) {
      const contributorDigest = await buildContributorWeeklyDigest(user, context, data);
      if (contributorDigest) {
        payloads.push(contributorDigest);
      }
      continue;
    }
    if (user.role === "PROJECT_MANAGER") {
      const digest = buildProjectManagerWeeklyDigest(user, context, data);
      if (digest) {
        payloads.push(digest);
      }
      continue;
    }
    if (user.role === "PM") {
      const digest = buildProductManagerWeeklyDigest(user, context, data);
      if (digest) {
        payloads.push(digest);
      }
      continue;
    }
    if (user.role === "VP") {
      const digest = buildVpWeeklyDigest(user, context, data);
      if (digest) {
        payloads.push(digest);
      }
    }
  }

  const ceoWeeklyDigest = buildCeoWeeklyDigest(context, data);
  if (ceoWeeklyDigest) {
    payloads.push(ceoWeeklyDigest);
  }

  return payloads;
}

export async function buildMonthlyDigestPayloads(periodStart: string, periodEnd: string): Promise<DigestPayload[]> {
  const context = buildDigestContext("MONTHLY", periodStart, periodEnd);
  const data = await loadBaseDigestData(periodStart, periodEnd, { includeAlerts: true });
  const sections = await buildMonthlySections(context, data);
  const payloads: DigestPayload[] = [];

  const monthlyRoles: PublicUser["role"][] = ["PROJECT_MANAGER", "PM", "VP"];

  for (const user of data.users) {
    if (!user.isActive) {
      continue;
    }
    if (!monthlyRoles.includes(user.role)) {
      continue;
    }
    payloads.push({
      userId: user.id,
      message: `${context.label} · Monthly roll-up`,
      type: "MONTHLY_DIGEST",
      metadata: {
        ...context,
        sections
      }
    });
  }

  const ceoMonthly = data.ceoUser
    ? {
        userId: data.ceoUser.id,
        message: `${context.label} · Monthly roll-up`,
        type: "MONTHLY_DIGEST" as const,
        metadata: { ...context, sections }
      }
    : null;
  if (ceoMonthly) {
    payloads.push(ceoMonthly);
  }
  return payloads;
}

async function buildContributorWeeklyDigest(
  user: PublicUser,
  context: DigestContext,
  data: BaseDigestData
): Promise<DigestPayload | null> {
  const schedule = await resolveSchedule(user, data);
  const userEntries = data.entriesByUser.get(user.id) ?? [];
  const totalMinutes = userEntries.reduce((sum, entry) => sum + entry.minutes, 0);
  const entriesByDay = data.entriesByUserDay.get(user.id) ?? new Map<string, number>();
  const missing = collectMissingDays(user, schedule, context, entriesByDay, data);
  const missingLabels = missing.missingDates.map((day) => formatDateLabel(day));

  const projectMinutes = data.userProjectMinutes.get(user.id) ?? new Map<string, number>();
  const projectRows: DigestRow[] = Array.from(projectMinutes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([projectId, minutes]) => {
      const project = data.projectLookup.get(projectId);
      return {
        label: project ? project.name : "Project",
        value: formatHours(minutes),
        href: project ? `/projects/${project.id}` : undefined,
        meta: project ? `${project.status} · ${project.health}` : undefined
      };
    });

  const sections: DigestSection[] = [
    {
      title: "Summary",
      rows: [
        { label: "Total logged", value: formatHours(totalMinutes) },
        { label: "Missing days", value: missingLabels.length ? missingLabels.join(", ") : "None" }
      ]
    }
  ];

  if (projectRows.length) {
    sections.push({
      title: "Top projects",
      rows: projectRows
    });
  }

  return {
    userId: user.id,
    message: `${context.label} · Weekly worklog`,
    type: "WEEKLY_DIGEST",
    metadata: {
      ...context,
      sections
    }
  };
}

function buildProjectManagerWeeklyDigest(user: PublicUser, context: DigestContext, data: BaseDigestData): DigestPayload | null {
  if (!user.companyId) {
    return null;
  }
  const vendorProjects = data.projects.filter(
    (project) =>
      project.primaryVendorId === user.companyId ||
      project.vendorCompanyIds.includes(user.companyId!) ||
      project.additionalVendorIds.includes(user.companyId!)
  );
  if (!vendorProjects.length) {
    return null;
  }
  const rows: DigestRow[] = vendorProjects
    .map((project) => {
      const minutes = data.projectMinutes.get(project.id) ?? 0;
      return {
        label: project.name,
        value: formatHours(minutes),
        meta: `${project.status} · ${project.health}`,
        href: `/projects/${project.id}`
      };
    })
    .sort((a, b) => {
      const minutesA = parseMinutesFromValue(a.value);
      const minutesB = parseMinutesFromValue(b.value);
      return minutesB - minutesA;
    })
    .slice(0, 6);

  return {
    userId: user.id,
    message: `${context.label} · Project summary`,
    type: "WEEKLY_DIGEST",
    metadata: {
      ...context,
      sections: [
        {
          title: `${vendorProjects.length} project${vendorProjects.length === 1 ? "" : "s"}`,
          rows
        }
      ]
    }
  };
}

function buildProductManagerWeeklyDigest(user: PublicUser, context: DigestContext, data: BaseDigestData): DigestPayload | null {
  const ownedProjects = data.projects.filter((project) => project.ownerId === user.id);
  if (!ownedProjects.length) {
    return null;
  }
  const rows: DigestRow[] = ownedProjects
    .map((project) => {
      const minutes = data.projectMinutes.get(project.id) ?? 0;
      return {
        label: project.name,
        value: formatHours(minutes),
        meta: `${project.status} · Health ${project.health}`,
        href: `/projects/${project.id}`
      };
    })
    .sort((a, b) => {
      const minutesA = parseMinutesFromValue(a.value);
      const minutesB = parseMinutesFromValue(b.value);
      return minutesB - minutesA;
    })
    .slice(0, 8);

  const riskProjects = ownedProjects.filter((project) => project.health === "RED" || project.riskLevel === "HIGH");
  const riskRows: DigestRow[] = riskProjects.map((project) => ({
    label: project.name,
    value: project.health,
    meta: project.riskSummary,
    href: `/projects/${project.id}`
  }));

  const sections: DigestSection[] = [
    {
      title: "Portfolio summary",
      rows: rows.length
        ? rows
        : [
            {
              label: "No activity last week",
              value: "0h"
            }
          ]
    }
  ];

  if (riskRows.length) {
    sections.push({
      title: "Attention needed",
      rows: riskRows
    });
  }

  return {
    userId: user.id,
    message: `${context.label} · Portfolio digest`,
    type: "WEEKLY_DIGEST",
    metadata: {
      ...context,
      sections
    }
  };
}

function buildVpWeeklyDigest(user: PublicUser, context: DigestContext, data: BaseDigestData): DigestPayload | null {
  const pmList = data.users.filter((candidate) => candidate.role === "PM" && candidate.vpUserId === user.id);
  if (!pmList.length) {
    return null;
  }

  const rows: DigestRow[] = pmList.map((pm) => {
    const pmProjects = data.projects.filter((project) => project.ownerId === pm.id);
    const minutes = pmProjects.reduce((sum, project) => sum + (data.projectMinutes.get(project.id) ?? 0), 0);
    const redProjects = pmProjects.filter((project) => project.health === "RED").length;
    return {
      label: `${pm.profile.firstName} ${pm.profile.lastName}`,
      value: `${pmProjects.length} project${pmProjects.length === 1 ? "" : "s"}`,
      meta: `${formatHours(minutes)} · ${redProjects} critical`,
      href: "/projects"
    };
  });

  return {
    userId: user.id,
    message: `${context.label} · PM oversight`,
    type: "WEEKLY_DIGEST",
    metadata: {
      ...context,
      sections: [
        {
          title: "PM summary",
          rows
        }
      ]
    }
  };
}

function buildCeoWeeklyDigest(context: DigestContext, data: BaseDigestData): DigestPayload | null {
  if (!data.ceoUser || !data.humainCompany) {
    return null;
  }
  const activeProjects = data.projects.filter((project) => project.status !== "COMPLETED" && project.status !== "CANCELLED");
  const totalMinutes = data.timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
  const atRisk = activeProjects.filter((project) => project.health === "RED" || project.riskLevel === "HIGH");

  const sections: DigestSection[] = [
    {
      title: "Portfolio overview",
      rows: [
        { label: "Active projects", value: `${activeProjects.length}` },
        { label: "Vendors engaged", value: countVendors(activeProjects) },
        { label: "Hours logged", value: formatHours(totalMinutes) }
      ]
    }
  ];

  if (atRisk.length) {
    sections.push({
      title: "At-risk projects",
      rows: atRisk.slice(0, 6).map((project) => ({
        label: project.name,
        value: project.health,
        meta: project.riskSummary,
        href: `/projects/${project.id}`
      }))
    });
  }

  return {
    userId: data.ceoUser.id,
    message: `${context.label} · Executive digest`,
    type: "WEEKLY_DIGEST",
    metadata: {
      ...context,
      sections
    }
  };
}

async function buildMonthlySections(context: DigestContext, data: BaseDigestData): Promise<DigestSection[]> {
  const contributorIds = data.users.filter((user) => TIME_ROLES.includes(user.role) && user.isActive).map((user) => user.id);
  const totalMinutes = data.timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
  const totalCapacityMinutes = await computeCapacityMinutes(contributorIds, context, data);
  const utilization = totalCapacityMinutes > 0 ? (totalMinutes / totalCapacityMinutes) * 100 : 0;

  const totalBudgetHours = data.projects.reduce((sum, project) => sum + (project.budgetHours ?? 0), 0);
  const burnPercent = totalBudgetHours > 0 ? ((totalMinutes / 60) / totalBudgetHours) * 100 : 0;

  const openAlerts = (await listAlerts({ statuses: ["OPEN"] })).filter((alert) => {
    return alert.createdAt >= context.periodStart && alert.createdAt <= `${context.periodEnd}T23:59:59.999Z`;
  });

  const topProjects = Array.from(data.projectMinutes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([projectId, minutes]) => {
      const project = data.projectLookup.get(projectId);
      return {
        label: project ? project.name : "Project",
        value: formatHours(minutes),
        meta: project ? `${project.status} · ${project.health}` : undefined,
        href: project ? `/projects/${project.id}` : undefined
      };
    });

  return [
    {
      title: "Utilization",
      rows: [
        { label: "Logged hours", value: formatHours(totalMinutes) },
        { label: "Capacity", value: formatHours(totalCapacityMinutes) },
        { label: "Utilization", value: `${utilization.toFixed(1)}%` }
      ]
    },
    {
      title: "Budget burn",
      rows: [
        { label: "Budget hours", value: `${totalBudgetHours.toFixed(0)}h` },
        { label: "Consumed", value: `${burnPercent.toFixed(1)}%` }
      ]
    },
    {
      title: "Exceptions",
      rows: [
        { label: "Open alerts", value: `${openAlerts.length}` },
        {
          label: "Critical alerts",
          value: `${openAlerts.filter((alert) => alert.severity === "HIGH").length}`
        }
      ]
    },
    {
      title: "Top projects",
      rows: topProjects.length
        ? topProjects
        : [
            {
              label: "No tracked activity",
              value: "0h"
            }
          ]
    }
  ];
}

async function loadBaseDigestData(
  periodStart: string,
  periodEnd: string,
  options: { includeAlerts?: boolean } = {}
): Promise<BaseDigestData> {
  const [users, projects, timeEntries, dayOffs, holidays, companies] = await Promise.all([
    listUsers(),
    listProjects(),
    listTimeEntries({ startDate: periodStart, endDate: periodEnd }),
    listDayOffs({ statuses: ["APPROVED"], startDate: periodStart, endDate: periodEnd }),
    listCompanyHolidays(),
    listCompanies()
  ]);

  const projectLookup = new Map(projects.map((project) => [project.id, project]));
  const entriesByUser = new Map<string, TimeEntry[]>();
  const userProjectMinutes = new Map<string, Map<string, number>>();
  const projectMinutes = new Map<string, number>();
  const entriesByUserDay = new Map<string, Map<string, number>>();

  for (const entry of timeEntries) {
    if (!entriesByUser.has(entry.userId)) {
      entriesByUser.set(entry.userId, []);
    }
    entriesByUser.get(entry.userId)!.push(entry);

    const projectBucket = userProjectMinutes.get(entry.userId) ?? new Map<string, number>();
    projectBucket.set(entry.projectId, (projectBucket.get(entry.projectId) ?? 0) + entry.minutes);
    userProjectMinutes.set(entry.userId, projectBucket);

    projectMinutes.set(entry.projectId, (projectMinutes.get(entry.projectId) ?? 0) + entry.minutes);

    const dayBucket = entriesByUserDay.get(entry.userId) ?? new Map<string, number>();
    dayBucket.set(entry.date, (dayBucket.get(entry.date) ?? 0) + entry.minutes);
    entriesByUserDay.set(entry.userId, dayBucket);
  }

  const dayOffSets = new Map<string, Set<string>>();
  for (const dayOff of dayOffs) {
    if (!dayOffSets.has(dayOff.userId)) {
      dayOffSets.set(dayOff.userId, new Set());
    }
    dayOffSets.get(dayOff.userId)!.add(dayOff.date);
  }

  const holidayLookup = new Map<string, Set<string>>();
  for (const holiday of holidays) {
    const key = holiday.companyId ?? holiday.vendorId ?? "__global__";
    if (!holidayLookup.has(key)) {
      holidayLookup.set(key, new Set());
    }
    holidayLookup.get(key)!.add(holiday.date);
  }

  const humainCompany = companies.find((company) => company.type === "HUMAIN");
  const ceoUser = humainCompany ? users.find((user) => user.id === humainCompany.ceoUserId) ?? null : null;

  return {
    users,
    projects,
    projectLookup,
    timeEntries,
    entriesByUser,
    userProjectMinutes,
    projectMinutes,
    entriesByUserDay,
    dayOffSets,
    holidayLookup,
    schedules: new Map(),
    humainCompany,
    ceoUser: ceoUser ?? undefined
  };
}

function buildDigestContext(digestType: "WEEKLY" | "MONTHLY", periodStart: string, periodEnd: string): DigestContext {
  const start = DateTime.fromISO(periodStart);
  const end = DateTime.fromISO(periodEnd);
  const label =
    start.isValid && end.isValid
      ? `${start.toFormat("MMM d")} – ${end.toFormat("MMM d")}`
      : `${periodStart} – ${periodEnd}`;
  const headline = digestType === "WEEKLY" ? "Weekly Digest" : "Monthly Digest";
  return {
    digestType,
    periodStart,
    periodEnd,
    headline,
    label
  };
}

async function resolveSchedule(user: PublicUser, data: BaseDigestData): Promise<ScheduleInfo> {
  if (data.schedules.has(user.id)) {
    return data.schedules.get(user.id)!;
  }
  const schedule = await findWorkScheduleForUser(user.id, user.companyId);
  const info: ScheduleInfo = {
    timeZone: schedule?.timeZone ?? user.profile.timeZone ?? "UTC",
    slots: normalizeSlots(schedule?.slots ?? [])
  };
  data.schedules.set(user.id, info);
  return info;
}

function normalizeSlots(slots: WorkScheduleSlot[]): Array<WorkScheduleSlot & { lengthMinutes: number }> {
  return resolveScheduleSlots(slots).map((slot) => ({
    ...slot,
    lengthMinutes: computeSlotMinutes(slot)
  }));
}

function computeSlotMinutes(slot: WorkScheduleSlot): number {
  const [startH, startM] = slot.start.split(":").map((value) => Number.parseInt(value, 10));
  const [endH, endM] = slot.end.split(":").map((value) => Number.parseInt(value, 10));
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  return Math.max(endMinutes - startMinutes, 0);
}

function collectMissingDays(
  user: PublicUser,
  schedule: ScheduleInfo,
  context: DigestContext,
  entriesByDay: Map<string, number>,
  data: BaseDigestData
): { missingDates: string[]; capacityMinutes: number } {
  const missingDates: string[] = [];
  let cursor = DateTime.fromISO(context.periodStart, { zone: schedule.timeZone });
  const end = DateTime.fromISO(context.periodEnd, { zone: schedule.timeZone });
  let capacityMinutes = 0;

  const dayOffSet = data.dayOffSets.get(user.id) ?? new Set<string>();
  const holidaySet = resolveHolidaySet(user, data);

  while (cursor.isValid && end.isValid && cursor <= end) {
    const dateKey = cursor.toISODate();
    if (!dateKey) {
      break;
    }
    const slot = schedule.slots.find((candidate) => candidate.day === cursor.weekday % 7);
    if (slot) {
      capacityMinutes += slot.lengthMinutes;
      if (!dayOffSet.has(dateKey) && !holidaySet.has(dateKey)) {
        const hasEntries = (entriesByDay.get(dateKey) ?? 0) > 0;
        if (!hasEntries) {
          missingDates.push(dateKey);
        }
      }
    }
    cursor = cursor.plus({ days: 1 });
  }

  return { missingDates, capacityMinutes };
}

function resolveHolidaySet(user: PublicUser, data: BaseDigestData): Set<string> {
  if (!user.companyId) {
    return data.holidayLookup.get("__global__") ?? new Set();
  }
  return data.holidayLookup.get(user.companyId) ?? data.holidayLookup.get("__global__") ?? new Set();
}

async function computeCapacityMinutes(
  userIds: string[],
  context: DigestContext,
  data: BaseDigestData
): Promise<number> {
  let total = 0;
  for (const userId of userIds) {
    const user = data.users.find((candidate) => candidate.id === userId);
    if (!user) {
      continue;
    }
    const schedule = await resolveSchedule(user, data);
    const entriesByDay = data.entriesByUserDay.get(user.id) ?? new Map<string, number>();
    const result = collectMissingDays(user, schedule, context, entriesByDay, data);
    total += result.capacityMinutes;
  }
  return total;
}

function countVendors(projects: Project[]): string {
  const vendorSet = new Set<string>();
  projects.forEach((project) => {
    project.vendorCompanyIds.forEach((vendorId) => vendorSet.add(vendorId));
    if (project.primaryVendorId) {
      vendorSet.add(project.primaryVendorId);
    }
  });
  return vendorSet.size ? `${vendorSet.size}` : "0";
}

function formatHours(minutes: number): string {
  if (!minutes) {
    return "0h";
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) {
    return `${hours}h ${mins}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${mins}m`;
}

function formatDateLabel(input: string): string {
  const date = DateTime.fromISO(input);
  if (!date.isValid) {
    return input;
  }
  return date.toFormat("ccc MMM d");
}

function parseMinutesFromValue(value?: string): number {
  if (!value) {
    return 0;
  }
  const parts = value
    .split(" ")
    .map((segment) => segment.trim())
    .filter(Boolean);
  let minutes = 0;
  for (const part of parts) {
    if (part.endsWith("h")) {
      minutes += Number.parseInt(part.replace("h", ""), 10) * 60;
    } else if (part.endsWith("m")) {
      minutes += Number.parseInt(part.replace("m", ""), 10);
    }
  }
  return minutes;
}
