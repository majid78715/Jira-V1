import { DateTime } from "luxon";
import { readDatabase } from "../data/db";
import {
  Alert,
  AlertType,
  AttendanceRecord,
  CompanyHoliday,
  DayOff,
  Project,
  Task,
  TimeEntry,
  User
} from "../models/_types";
import {
  createAlert,
  listAlerts as listAlertsRepo,
  resolveAlert,
  updateAlert,
  recordActivity,
  sendNotifications
} from "../data/repositories";

const TRACKED_ROLES: User["role"][] = ["DEVELOPER", "ENGINEER"];
const SYSTEM_ACTOR_ID = "system-automation";
const INACTIVITY_LOOKBACK_WORK_DAYS = 10;
const INACTIVITY_REQUIRED_STREAK = 3;
const SCHEDULE_EXCEPTION_LOOKBACK_DAYS = 7;

export type AutomationRunOptions = {
  actorId?: string;
  now?: string;
};

export type AutomationRunResult = {
  createdAlerts: number;
  resolvedAlerts: number;
  openAlerts: number;
  countsByType: Record<AlertType, number>;
};

type AlertDraft = {
  fingerprint: string;
  type: AlertType;
  message: string;
  metadata?: Record<string, unknown>;
  entityId?: string;
  entityType?: string;
  userId?: string;
  projectId?: string;
  companyId?: string;
  notifyUserIds?: string[];
};

type UserDateIndex<T extends { userId: string }> = Map<string, Map<string, T[]>>;

type AutomationContext = {
  now: DateTime;
  users: User[];
  projects: Project[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  attendanceRecords: AttendanceRecord[];
  dayOffDates: Map<string, Set<string>>;
  holidaysByCompany: Map<string, Set<string>>;
  globalHolidays: Set<string>;
  timeEntriesByUserDate: UserDateIndex<TimeEntry>;
  attendanceByUserDate: UserDateIndex<AttendanceRecord>;
  projectMinutes: Map<string, number>;
  userById: Map<string, User>;
  projectById: Map<string, Project>;
};

export async function runAutomation(options: AutomationRunOptions = {}): Promise<AutomationRunResult> {
  const actorId = options.actorId ?? SYSTEM_ACTOR_ID;
  const now = options.now ? DateTime.fromISO(options.now) : DateTime.now();
  if (!now.isValid) {
    throw new Error("Invalid timestamp provided to automation run.");
  }

  const snapshot = await readDatabase();
  const context = buildContext(snapshot, now);

  const desiredAlerts = new Map<string, AlertDraft>();

  applyMissingDailyLogRule(context, desiredAlerts);
  applyInactivityRule(context, desiredAlerts);
  applyOverBudgetRule(context, desiredAlerts);
  applyHolidayWorkRule(context, desiredAlerts);
  applyScheduleExceptionRule(context, desiredAlerts);
  applyOverdueTaskRule(context, desiredAlerts);

  const countsByType = tallyByType(desiredAlerts);

  const existingAlerts = await listAlertsRepo();
  const existingByFingerprint = new Map(existingAlerts.map((alert) => [alert.fingerprint, alert]));

  let createdAlerts = 0;
  let resolvedAlerts = 0;

  for (const draft of desiredAlerts.values()) {
    const existing = existingByFingerprint.get(draft.fingerprint);
    if (!existing) {
      const { notifyUserIds, ...alertPayload } = draft;
      await createAlert({ ...alertPayload, status: "OPEN" });
      if (notifyUserIds?.length) {
        await sendNotifications(notifyUserIds, draft.message, draft.type, {
          projectId: draft.projectId,
          entityId: draft.entityId
        });
      }
      createdAlerts += 1;
      continue;
    }
    if (alertNeedsUpdate(existing, draft)) {
      const { notifyUserIds: _ignore, ...updatePayload } = draft;
      await updateAlert(existing.id, {
        status: "OPEN",
        message: updatePayload.message,
        metadata: updatePayload.metadata,
        entityId: updatePayload.entityId,
        entityType: updatePayload.entityType,
        userId: updatePayload.userId,
        projectId: updatePayload.projectId,
        companyId: updatePayload.companyId,
        resolvedAt: undefined,
        resolvedById: undefined
      });
    }
  }

  for (const alert of existingAlerts) {
    if (alert.status === "OPEN" && !desiredAlerts.has(alert.fingerprint)) {
      await resolveAlert(alert.id, actorId);
      resolvedAlerts += 1;
    }
  }

  const openAlerts = (await listAlertsRepo({ statuses: ["OPEN"] })).length;

  await recordActivity(actorId, "AUTOMATION_RUN", "Automation run completed", {
    createdAlerts,
    resolvedAlerts,
    openAlerts,
    countsByType
  });

  return { createdAlerts, resolvedAlerts, openAlerts, countsByType };
}

function buildContext(
  snapshot: {
    users: User[];
    projects: Project[];
    tasks: Task[];
    timeEntries: TimeEntry[];
    attendanceRecords: AttendanceRecord[];
    dayOffs: DayOff[];
    companyHolidays: CompanyHoliday[];
  },
  now: DateTime
): AutomationContext {
  const dayOffDates = buildDayOffMap(snapshot.dayOffs);
  const { holidaysByCompany, globalHolidays } = buildHolidayMap(snapshot.companyHolidays);
  const timeEntriesByUserDate = buildUserDateIndex(snapshot.timeEntries, (entry) => entry.date);
  const attendanceByUserDate = buildUserDateIndex(snapshot.attendanceRecords, (record) => record.date);
  const projectMinutes = aggregateProjectMinutes(snapshot.timeEntries);
  const userById = new Map(snapshot.users.map((user) => [user.id, user]));

  const projectById = new Map(snapshot.projects.map((project) => [project.id, project]));

  return {
    now,
    users: snapshot.users,
    projects: snapshot.projects,
    tasks: snapshot.tasks,
    timeEntries: snapshot.timeEntries,
    attendanceRecords: snapshot.attendanceRecords,
    dayOffDates,
    holidaysByCompany,
    globalHolidays,
    timeEntriesByUserDate,
    attendanceByUserDate,
    projectMinutes,
    userById,
    projectById
  };
}

function buildDayOffMap(dayOffs: DayOff[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const dayOff of dayOffs) {
    if (dayOff.status !== "APPROVED") {
      continue;
    }
    const set = map.get(dayOff.userId) ?? new Set<string>();
    set.add(dayOff.date);
    map.set(dayOff.userId, set);
  }
  return map;
}

function buildHolidayMap(holidays: CompanyHoliday[]): {
  holidaysByCompany: Map<string, Set<string>>;
  globalHolidays: Set<string>;
} {
  const perCompany = new Map<string, Set<string>>();
  const global = new Set<string>();
  for (const holiday of holidays) {
    if (holiday.companyId) {
      const set = perCompany.get(holiday.companyId) ?? new Set<string>();
      set.add(holiday.date);
      perCompany.set(holiday.companyId, set);
    } else {
      global.add(holiday.date);
    }
  }
  return { holidaysByCompany: perCompany, globalHolidays: global };
}

function buildUserDateIndex<T extends { userId: string }>(
  records: T[],
  getDate: (record: T) => string
): UserDateIndex<T> {
  const index = new Map<string, Map<string, T[]>>();
  for (const record of records) {
    const dateKey = getDate(record);
    if (!dateKey) {
      continue;
    }
    const userMap = index.get(record.userId) ?? new Map<string, T[]>();
    const existing = userMap.get(dateKey) ?? [];
    existing.push(record);
    userMap.set(dateKey, existing);
    index.set(record.userId, userMap);
  }
  return index;
}

function aggregateProjectMinutes(entries: TimeEntry[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.projectId, (totals.get(entry.projectId) ?? 0) + entry.minutes);
  }
  return totals;
}

function applyMissingDailyLogRule(context: AutomationContext, drafts: Map<string, AlertDraft>) {
  for (const user of context.users) {
    if (!shouldTrackUser(user)) {
      continue;
    }
    const previousWorkingDay = getPreviousWorkingDay(context, user);
    if (!previousWorkingDay) {
      continue;
    }
    const dateKey = previousWorkingDay.toISODate();
    if (!dateKey || hasActivityOnDate(context, user.id, dateKey)) {
      continue;
    }
    const fingerprint = `MISSING_DAILY_LOG:${user.id}:${dateKey}`;
    drafts.set(fingerprint, {
      fingerprint,
      type: "MISSING_DAILY_LOG",
      message: `${formatUserName(user)} missing daily log for ${formatDateForUser(dateKey, user)}`,
      metadata: { date: dateKey },
      userId: user.id,
      companyId: user.companyId
    });
  }
}

function applyInactivityRule(context: AutomationContext, drafts: Map<string, AlertDraft>) {
  for (const user of context.users) {
    if (!shouldTrackUser(user)) {
      continue;
    }
    const tzNow = context.now.setZone(getUserTimeZone(user));
    let cursor = tzNow.minus({ days: 1 });
    let consecutive = 0;
    let workingDaysInspected = 0;
    const maxIterations = INACTIVITY_LOOKBACK_WORK_DAYS * 2;
    let iterations = 0;

    while (workingDaysInspected < INACTIVITY_LOOKBACK_WORK_DAYS && iterations < maxIterations) {
      iterations += 1;
      const dateKey = cursor.toISODate();
      if (!dateKey) {
        break;
      }
      if (!isWorkingDay(context, user, cursor, dateKey)) {
        cursor = cursor.minus({ days: 1 });
        continue;
      }
      workingDaysInspected += 1;
      const hasActivity = hasActivityOnDate(context, user.id, dateKey);
      if (hasActivity) {
        consecutive = 0;
      } else {
        consecutive += 1;
        if (consecutive >= INACTIVITY_REQUIRED_STREAK) {
          const fingerprint = `INACTIVITY:${user.id}`;
          drafts.set(fingerprint, {
            fingerprint,
            type: "INACTIVITY",
            message: `${formatUserName(user)} inactive for ${consecutive} working days`,
            metadata: { consecutiveDays: consecutive, lastCheckedDate: dateKey },
            userId: user.id,
            companyId: user.companyId
          });
          break;
        }
      }
      cursor = cursor.minus({ days: 1 });
    }
  }
}

function applyOverBudgetRule(context: AutomationContext, drafts: Map<string, AlertDraft>) {
  for (const project of context.projects) {
    if (!project.budgetHours || project.budgetHours <= 0) {
      continue;
    }
    const consumedMinutes = context.projectMinutes.get(project.id) ?? 0;
    const budgetMinutes = Math.round(project.budgetHours * 60);
    if (consumedMinutes <= budgetMinutes) {
      continue;
    }
    const fingerprint = `OVER_BUDGET:${project.id}`;
    drafts.set(fingerprint, {
      fingerprint,
      type: "OVER_BUDGET",
      message: `${project.name} exceeded budget by ${formatDuration(consumedMinutes - budgetMinutes)} (budget ${formatDuration(
        budgetMinutes
      )})`,
      metadata: { consumedMinutes, budgetMinutes },
      entityId: project.id,
      entityType: "PROJECT",
      projectId: project.id
    });
  }
}

function applyHolidayWorkRule(context: AutomationContext, drafts: Map<string, AlertDraft>) {
  const aggregates = new Map<
    string,
    { user: User; date: string; minutes: number; entryIds: string[] }
  >();

  for (const entry of context.timeEntries) {
    const user = context.userById.get(entry.userId);
    if (!user || !shouldTrackUser(user)) {
      continue;
    }
    const dateKey = entry.date;
    if (!dateKey) {
      continue;
    }
    if (!isHolidayOrDayOff(context, user, dateKey)) {
      continue;
    }
    const fingerprint = `HOLIDAY_WORK:${user.id}:${dateKey}`;
    const aggregate = aggregates.get(fingerprint) ?? {
      user,
      date: dateKey,
      minutes: 0,
      entryIds: []
    };
    aggregate.minutes += entry.minutes;
    aggregate.entryIds.push(entry.id);
    aggregates.set(fingerprint, aggregate);
  }

  for (const [fingerprint, aggregate] of aggregates.entries()) {
    drafts.set(fingerprint, {
      fingerprint,
      type: "HOLIDAY_WORK",
      message: `${formatUserName(aggregate.user)} logged ${formatDuration(aggregate.minutes)} on a holiday (${formatDateForUser(
        aggregate.date,
        aggregate.user
      )})`,
      metadata: { date: aggregate.date, entryIds: aggregate.entryIds, minutes: aggregate.minutes },
      userId: aggregate.user.id,
      companyId: aggregate.user.companyId
    });
  }
}

function applyScheduleExceptionRule(context: AutomationContext, drafts: Map<string, AlertDraft>) {
  const cutoffDate = context.now.minus({ days: SCHEDULE_EXCEPTION_LOOKBACK_DAYS }).toISODate() ?? "";

  for (const entry of context.timeEntries) {
    if (!entry.outOfSchedule || entry.date < cutoffDate) {
      continue;
    }
    const user = context.userById.get(entry.userId);
    if (!user) {
      continue;
    }
    const fingerprint = `SCHEDULE_EXCEPTION:timeEntry:${entry.id}`;
    drafts.set(fingerprint, {
      fingerprint,
      type: "SCHEDULE_EXCEPTION",
      message: `Time entry outside schedule for ${formatUserName(user)} on ${formatDateForUser(entry.date, user)}`,
      metadata: { entryId: entry.id, date: entry.date },
      entityId: entry.id,
      entityType: "TIME_ENTRY",
      userId: entry.userId,
      projectId: entry.projectId,
      companyId: user.companyId
    });
  }

  for (const record of context.attendanceRecords) {
    if (!record.outOfSchedule || record.date < cutoffDate) {
      continue;
    }
    const user = context.userById.get(record.userId);
    if (!user) {
      continue;
    }
    const fingerprint = `SCHEDULE_EXCEPTION:attendance:${record.id}`;
    drafts.set(fingerprint, {
      fingerprint,
      type: "SCHEDULE_EXCEPTION",
      message: `Attendance exception for ${formatUserName(user)} on ${formatDateForUser(record.date, user)}`,
      metadata: { attendanceId: record.id, date: record.date },
      entityId: record.id,
      entityType: "ATTENDANCE",
      userId: record.userId,
      companyId: user.companyId
    });
  }
}

function applyOverdueTaskRule(context: AutomationContext, drafts: Map<string, AlertDraft>) {
  for (const task of context.tasks) {
    if (!task.dueDate || task.status === "DONE") {
      continue;
    }
    const dueDate = DateTime.fromISO(task.dueDate);
    if (!dueDate.isValid || dueDate >= context.now) {
      continue;
    }
    const fingerprint = `TASK_OVERDUE:${task.id}`;
    const recipients = new Set<string>();
    if (task.assigneeUserId) {
      recipients.add(task.assigneeUserId);
    }
    const project = context.projectById.get(task.projectId);
    if (project?.sponsorUserId) {
      recipients.add(project.sponsorUserId);
    }
    if (project?.ownerId) {
      recipients.add(project.ownerId);
    }
    drafts.set(fingerprint, {
      fingerprint,
      type: "TASK_OVERDUE",
      message: `Task ${task.title} is overdue`,
      metadata: { taskId: task.id, dueDate: task.dueDate },
      entityId: task.id,
      entityType: "TASK",
      projectId: task.projectId,
      userId: task.assigneeUserId,
      notifyUserIds: Array.from(recipients)
    });
  }
}

function alertNeedsUpdate(existing: Alert, draft: AlertDraft): boolean {
  if (existing.status !== "OPEN") {
    return true;
  }
  if (existing.message !== draft.message) {
    return true;
  }
  if ((existing.userId ?? null) !== (draft.userId ?? null)) {
    return true;
  }
  if ((existing.projectId ?? null) !== (draft.projectId ?? null)) {
    return true;
  }
  if ((existing.companyId ?? null) !== (draft.companyId ?? null)) {
    return true;
  }
  if (!areMetadataEqual(existing.metadata, draft.metadata)) {
    return true;
  }
  return false;
}

function areMetadataEqual(
  left?: Record<string, unknown>,
  right?: Record<string, unknown>
): boolean {
  if (!left && !right) {
    return true;
  }
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
}

function tallyByType(drafts: Map<string, AlertDraft>): Record<AlertType, number> {
  const totals: Record<AlertType, number> = {
    MISSING_DAILY_LOG: 0,
    INACTIVITY: 0,
    OVER_BUDGET: 0,
    HOLIDAY_WORK: 0,
    SCHEDULE_EXCEPTION: 0,
    TASK_OVERDUE: 0,
    OVERDUE_MILESTONE: 0,
    HIGH_RISK_PROJECT: 0,
    LOW_UTILISATION: 0
  };
  for (const draft of drafts.values()) {
    totals[draft.type] = (totals[draft.type] ?? 0) + 1;
  }
  return totals;
}

function getPreviousWorkingDay(context: AutomationContext, user: User): DateTime | null {
  const timeZone = getUserTimeZone(user);
  let cursor = context.now.setZone(timeZone).minus({ days: 1 });
  for (let i = 0; i < 7; i += 1) {
    const dateKey = cursor.toISODate();
    if (!dateKey) {
      return null;
    }
    if (isWorkingDay(context, user, cursor, dateKey)) {
      return cursor;
    }
    cursor = cursor.minus({ days: 1 });
  }
  return null;
}

function hasActivityOnDate(context: AutomationContext, userId: string, date: string): boolean {
  const entryDays = context.timeEntriesByUserDate.get(userId);
  if (entryDays?.get(date)?.length) {
    return true;
  }
  const attendanceDays = context.attendanceByUserDate.get(userId);
  return Boolean(attendanceDays?.get(date)?.length);
}

function isWorkingDay(
  context: AutomationContext,
  user: User,
  date: DateTime,
  dateKey: string
): boolean {
  if (date.weekday === 6 || date.weekday === 7) {
    return false;
  }
  if (context.dayOffDates.get(user.id)?.has(dateKey)) {
    return false;
  }
  if (isHoliday(context, user, dateKey)) {
    return false;
  }
  return true;
}

function isHoliday(context: AutomationContext, user: User, dateKey: string): boolean {
  if (context.globalHolidays.has(dateKey)) {
    return true;
  }
  if (user.companyId) {
    return context.holidaysByCompany.get(user.companyId)?.has(dateKey) ?? false;
  }
  return false;
}

function isHolidayOrDayOff(context: AutomationContext, user: User, dateKey: string): boolean {
  return (
    context.dayOffDates.get(user.id)?.has(dateKey) ?? false
  ) || isHoliday(context, user, dateKey);
}

function shouldTrackUser(user: User): boolean {
  return user.isActive && TRACKED_ROLES.includes(user.role);
}

function getUserTimeZone(user: User): string {
  return user.profile.timeZone || "UTC";
}

function formatUserName(user: User): string {
  return `${user.profile.firstName} ${user.profile.lastName}`.trim();
}

function formatDateForUser(dateKey: string, user: User): string {
  return formatDateForZone(dateKey, getUserTimeZone(user));
}

function formatDateForZone(dateKey: string, timeZone: string): string {
  return DateTime.fromISO(dateKey, { zone: timeZone }).toLocaleString(DateTime.DATE_MED);
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) {
    return "0h";
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours && remaining) {
    return `${hours}h ${remaining}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${remaining}m`;
}
