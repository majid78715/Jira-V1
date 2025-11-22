import { DateTime } from "luxon";
import {
  listAssignments,
  listTasksByIds,
  listProjects,
  listUsers,
  listCompanies,
  listTimeEntries,
  listDayOffs,
  listCompanyHolidays,
  findWorkScheduleForUser,
  listNotifications,
  sendNotifications,
  createAlert,
  updateAlert,
  findAlertByFingerprint,
  resolveAlert
} from "../data/repositories";
import {
  Company,
  CompanyHoliday,
  Notification,
  Project,
  PublicUser,
  Task,
  TimeEntry,
  WorkScheduleSlot
} from "../models/_types";
import { resolveScheduleSlots } from "../utils/scheduleCompliance";

const REMINDER_INTERVAL_MS = Number(process.env.WORKLOG_REMINDER_INTERVAL_MS ?? 5 * 60 * 1000);
const HISTORY_DAYS = 14;
const MAX_ESCALATION_DAYS = 4;

const REMINDER_TYPES = {
  USER: "MISSING_WORK_LOG_USER",
  PM: "MISSING_WORK_LOG_PM",
  VP: "MISSING_WORK_LOG_VP",
  EXEC: "MISSING_WORK_LOG_EXEC"
} as const;

type ReminderLevel = keyof typeof REMINDER_TYPES;

let intervalHandle: NodeJS.Timeout | null = null;
let running = false;

export function startWorklogScheduler() {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  if (intervalHandle) {
    return;
  }
  intervalHandle = setInterval(() => {
    void runWorklogCheck();
  }, REMINDER_INTERVAL_MS);
  void runWorklogCheck();
}

async function runWorklogCheck() {
  if (running) {
    return;
  }
  running = true;
  try {
    await processWorklogGaps();
  } catch (error) {
    console.error("[WorklogScheduler] run failed", error);
  } finally {
    running = false;
  }
}

async function processWorklogGaps() {
  const assignments = await listAssignments({ status: "APPROVED" });
  if (!assignments.length) {
    return;
  }
  const tasks = await listTasksByIds(assignments.map((assignment) => assignment.taskId));
  const taskMap = new Map(tasks.map((task) => [task.id, task]));

  const [projects, users, companies] = await Promise.all([listProjects(), listUsers(), listCompanies()]);
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const userMap = new Map(users.map((user) => [user.id, user]));
  const companyMap = new Map(companies.map((company) => [company.id, company]));
  const humainCompany = companies.find((company) => company.type === "HUMAIN");

  const userProjects = new Map<string, Set<string>>();

  for (const assignment of assignments) {
    const task = taskMap.get(assignment.taskId);
    if (!task || task.status !== "IN_PROGRESS") {
      continue;
    }
    const project = projectMap.get(task.projectId);
    if (!project || !project.timeTrackingRequired) {
      continue;
    }
    const user = userMap.get(assignment.developerId);
    if (!user || !user.isActive || !["DEVELOPER", "ENGINEER"].includes(user.role)) {
      continue;
    }
    if (!userProjects.has(user.id)) {
      userProjects.set(user.id, new Set());
    }
    userProjects.get(user.id)!.add(project.id);
  }

  if (!userProjects.size) {
    return;
  }

  const notificationHistory = new Map<string, Notification[]>();
  const runtimeLedger = new Set<string>();

  for (const [userId, projectIds] of userProjects) {
    const user = userMap.get(userId);
    if (!user) {
      continue;
    }
    await processUserProjects(
      user,
      projectIds,
      projectMap,
      companyMap,
      humainCompany,
      notificationHistory,
      runtimeLedger,
      userMap
    );
  }
}

async function processUserProjects(
  user: PublicUser,
  projectIds: Set<string>,
  projectMap: Map<string, Project>,
  companyMap: Map<string, Company>,
  humainCompany: Company | undefined,
  notificationHistory: Map<string, Notification[]>,
  runtimeLedger: Set<string>,
  userMap: Map<string, PublicUser>
) {
  const schedule = await resolveUserSchedule(user);
  const localNow = DateTime.now().setZone(schedule.timeZone);
  if (!localNow.isValid || localNow.hour < 12) {
    return;
  }
  const todayKey = localNow.toISODate();
  if (!todayKey) {
    return;
  }
  const historyStart = localNow.minus({ days: HISTORY_DAYS }).toISODate() ?? todayKey;
  const [dayOffs, companyHolidays, vendorHolidays, entries] = await Promise.all([
    listDayOffs({ userId: user.id, statuses: ["APPROVED"], startDate: historyStart, endDate: todayKey }),
    user.companyId ? listCompanyHolidays({ companyId: user.companyId }) : Promise.resolve([] as CompanyHoliday[]),
    user.companyId ? listCompanyHolidays({ vendorId: user.companyId }) : Promise.resolve([] as CompanyHoliday[]),
    listTimeEntries({ userId: user.id, startDate: historyStart, endDate: todayKey })
  ]);
  const dayOffSet = new Set(dayOffs.map((entry) => entry.date));
  const holidaySet = new Set([...companyHolidays, ...vendorHolidays].map((entry) => entry.date));
  if (!isWorkingDate(todayKey, schedule, dayOffSet, holidaySet)) {
    return;
  }
  const entriesByDay = buildEntryLookup(entries);
  const projectCache = new Map<string, Project>();

  for (const projectId of projectIds) {
    const project = projectCache.get(projectId) ?? projectMap.get(projectId);
    if (!project) {
      continue;
    }
    projectCache.set(projectId, project);
    if (hasEntryForProject(entriesByDay, todayKey, project.id)) {
      await resolveMissingAlert(user.id, project.id);
      continue;
    }
    const daysMissing = computeMissingDays(localNow, schedule, dayOffSet, holidaySet, entriesByDay, project.id);
    if (daysMissing === 0) {
      continue;
    }
    await upsertMissingAlert(user, project, daysMissing);
    const vendorCompany = resolveVendorForProject(user, project, companyMap);
    await sendEscalations(
      user,
      project,
      vendorCompany,
      humainCompany,
      daysMissing,
      todayKey,
      notificationHistory,
      runtimeLedger,
      userMap
    );
  }
}

async function resolveUserSchedule(user: PublicUser): Promise<{ timeZone: string; slots: WorkScheduleSlot[] }> {
  const schedule = await findWorkScheduleForUser(user.id, user.companyId);
  const timeZone = schedule?.timeZone ?? user.profile.timeZone;
  const slots = resolveScheduleSlots(schedule?.slots);
  return { timeZone, slots };
}

function buildEntryLookup(entries: TimeEntry[]): Map<string, TimeEntry[]> {
  const map = new Map<string, TimeEntry[]>();
  entries.forEach((entry) => {
    const bucket = map.get(entry.date);
    if (bucket) {
      bucket.push(entry);
    } else {
      map.set(entry.date, [entry]);
    }
  });
  return map;
}

function hasEntryForProject(entriesByDay: Map<string, TimeEntry[]>, dateKey: string, projectId: string): boolean {
  const entries = entriesByDay.get(dateKey);
  if (!entries?.length) {
    return false;
  }
  return entries.some((entry) => entry.projectId === projectId);
}

function computeMissingDays(
  reference: DateTime,
  schedule: { timeZone: string; slots: WorkScheduleSlot[] },
  dayOffSet: Set<string>,
  holidaySet: Set<string>,
  entriesByDay: Map<string, TimeEntry[]>,
  projectId: string
): number {
  let count = 0;
  let cursor = reference.startOf("day");
  while (cursor.isValid && count < MAX_ESCALATION_DAYS) {
    const dateKey = cursor.toISODate();
    if (!dateKey) {
      break;
    }
    if (isWorkingDate(dateKey, schedule, dayOffSet, holidaySet)) {
      const hasEntry = hasEntryForProject(entriesByDay, dateKey, projectId);
      if (hasEntry) {
        break;
      }
      count += 1;
    }
    cursor = cursor.minus({ days: 1 });
  }
  return count;
}

function isWorkingDate(
  dateKey: string,
  schedule: { timeZone: string; slots: WorkScheduleSlot[] },
  dayOffSet: Set<string>,
  holidaySet: Set<string>
): boolean {
  const slot = findScheduleSlot(schedule, dateKey);
  if (!slot) {
    return false;
  }
  if (dayOffSet.has(dateKey)) {
    return false;
  }
  if (holidaySet.has(dateKey)) {
    return false;
  }
  return true;
}

function findScheduleSlot(
  schedule: { timeZone: string; slots: WorkScheduleSlot[] },
  dateKey: string
): { start: DateTime; end: DateTime } | null {
  const date = DateTime.fromISO(dateKey, { zone: schedule.timeZone });
  if (!date.isValid) {
    return null;
  }
  const day = date.weekday % 7;
  const slot = schedule.slots.find((candidate) => candidate.day === day);
  if (!slot) {
    return null;
  }
  const start = DateTime.fromISO(`${dateKey}T${slot.start}`, { zone: schedule.timeZone });
  const end = DateTime.fromISO(`${dateKey}T${slot.end}`, { zone: schedule.timeZone });
  if (!start.isValid || !end.isValid || end <= start) {
    return null;
  }
  return { start, end };
}

async function upsertMissingAlert(user: PublicUser, project: Project, daysMissing: number) {
  const fingerprint = buildAlertFingerprint(user.id, project.id);
  const message = `${formatUserName(user)} has ${daysMissing} day(s) without a work log for ${project.name}.`;
  const metadata = { userId: user.id, projectId: project.id, daysMissing };
  const existing = await findAlertByFingerprint(fingerprint);
  if (!existing) {
    await createAlert({
      type: "MISSING_DAILY_LOG",
      message,
      fingerprint,
      userId: user.id,
      projectId: project.id,
      companyId: project.primaryVendorId ?? user.companyId,
      metadata,
      severity: daysMissing >= 3 ? "HIGH" : "MEDIUM"
    });
    return;
  }
  await updateAlert(existing.id, {
    message,
    metadata,
    status: "OPEN",
    severity: daysMissing >= 3 ? "HIGH" : existing.severity
  });
}

async function resolveMissingAlert(userId: string, projectId: string) {
  const alert = await findAlertByFingerprint(buildAlertFingerprint(userId, projectId));
  if (alert && alert.status === "OPEN") {
    await resolveAlert(alert.id, userId);
  }
}

function buildAlertFingerprint(userId: string, projectId: string) {
  return `missing-worklog:${userId}:${projectId}`;
}

async function sendEscalations(
  user: PublicUser,
  project: Project,
  vendorCompany: Company | undefined,
  humainCompany: Company | undefined,
  daysMissing: number,
  dateKey: string,
  notificationHistory: Map<string, Notification[]>,
  runtimeLedger: Set<string>,
  userMap: Map<string, PublicUser>
) {
  const recipients = new Map<ReminderLevel, Set<string>>();
  const projectLabel = formatProjectLabel(project);
  const vendorForEscalation =
    (project.primaryVendorId && vendorCompany && vendorCompany.id === project.primaryVendorId) || vendorCompany
      ? vendorCompany
      : undefined;

  const ensure = (level: ReminderLevel) => {
    if (!recipients.has(level)) {
      recipients.set(level, new Set());
    }
    return recipients.get(level)!;
  };

  if (daysMissing >= 1) {
    ensure("USER").add(user.id);
  }
  if (daysMissing >= 2) {
    if (project.deliveryManagerUserId) {
      ensure("PM").add(project.deliveryManagerUserId);
    }
    if (project.ownerId) {
      ensure("PM").add(project.ownerId);
    }
  }
  if (daysMissing >= 3) {
    const productManager = project.ownerId ? userMap.get(project.ownerId) : undefined;
    if (productManager?.vpUserId) {
      ensure("VP").add(productManager.vpUserId);
    }
    if (vendorForEscalation?.vendorOwnerUserId) {
      ensure("VP").add(vendorForEscalation.vendorOwnerUserId);
    }
  }
  if (daysMissing >= 4) {
    if (humainCompany?.ceoUserId) {
      ensure("EXEC").add(humainCompany.ceoUserId);
    }
    if (vendorForEscalation?.vendorCeoUserId) {
      ensure("EXEC").add(vendorForEscalation.vendorCeoUserId);
    }
  }

  const seenRecipients = new Set<string>();

  for (const [level, ids] of recipients) {
    for (const recipientId of ids) {
      if (!recipientId || seenRecipients.has(recipientId)) {
        continue;
      }
      seenRecipients.add(recipientId);
      const message = buildMessageForLevel(level, user, projectLabel, daysMissing);
      await sendReminderIfNeeded(
        recipientId,
        level,
        message,
        {
          projectId: project.id,
          projectName: project.name,
          userId: user.id,
          date: dateKey,
          daysMissing,
          level
        },
        notificationHistory,
        runtimeLedger
      );
    }
  }
}

function formatProjectLabel(project: Project): string {
  return project.code ? `${project.code} · ${project.name}` : project.name;
}

function formatUserName(user: PublicUser): string {
  return `${user.profile.firstName} ${user.profile.lastName}`;
}

function buildMessageForLevel(level: ReminderLevel, user: PublicUser, projectLabel: string, daysMissing: number): string {
  const userName = formatUserName(user);
  if (level === "USER") {
    return `Reminder: please log today’s work for ${projectLabel}.`;
  }
  if (level === "PM") {
    return `${userName} has ${daysMissing} working day(s) without a work log on ${projectLabel}.`;
  }
  if (level === "VP") {
    return `Escalation: ${userName} has ${daysMissing} missing work log day(s) for ${projectLabel}.`;
  }
  return `Critical: ${userName} has ${daysMissing} days without work logs for ${projectLabel}.`;
}

async function sendReminderIfNeeded(
  userId: string,
  level: ReminderLevel,
  message: string,
  metadata: Record<string, unknown>,
  notificationHistory: Map<string, Notification[]>,
  runtimeLedger: Set<string>
) {
  const type = REMINDER_TYPES[level];
  const ledgerKey = `${userId}:${type}:${metadata.date}:${metadata.projectId}`;
  if (runtimeLedger.has(ledgerKey)) {
    return;
  }
  runtimeLedger.add(ledgerKey);
  const cacheKey = `${userId}:${type}`;
  let history = notificationHistory.get(cacheKey);
  if (!history) {
    history = await listNotifications({ userId, type, limit: 25 });
    notificationHistory.set(cacheKey, history);
  }
  const alreadySent = history.some(
    (notification) =>
      notification.metadata?.projectId === metadata.projectId && notification.metadata?.date === metadata.date
  );
  if (alreadySent) {
    return;
  }
  await sendNotifications([userId], message, type, metadata);
}

function resolveVendorForProject(
  user: PublicUser,
  project: Project,
  companyMap: Map<string, Company>
): Company | undefined {
  const vendorId =
    project.primaryVendorId ||
    (user.companyId && companyMap.get(user.companyId)?.type === "VENDOR" ? user.companyId : undefined);
  if (!vendorId) {
    return undefined;
  }
  return companyMap.get(vendorId);
}
