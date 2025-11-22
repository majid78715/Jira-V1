import { DateTime } from "luxon";
import { CompanyHoliday, Project, PublicUser, Task, TimeEntry, WorkScheduleSlot } from "../models/_types";
import {
  createTimeEntry,
  findWorkScheduleForUser,
  getProjectById,
  getTaskById,
  getTimeEntryById,
  getUserById,
  listAssignments,
  listCompanyHolidays,
  listDayOffs,
  listProjects,
  listTasksByIds,
  listTimeEntries,
  recordActivity,
  toPublicUser,
  updateTimeEntry,
  updateTask
} from "../data/repositories";
import { isRangeWithinSchedule, resolveScheduleSlots } from "../utils/scheduleCompliance";
import { resolveTimeScope } from "./timeScope.service";
import { HttpError } from "../middleware/httpError";

const TIME_ROLES: PublicUser["role"][] = ["DEVELOPER", "PM"];
const MAX_MINUTES_PER_ENTRY = 12 * 60;

type TimeEntryPayload = {
  projectId: string;
  taskId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  minutes?: number;
  hours?: number;
  note?: string;
  workTypeCode?: string;
  billable?: boolean;
  location?: string;
  costRate?: number;
  costAmount?: number;
};

type TimeEntryUpdatePayload = Partial<TimeEntryPayload>;

type TimeEntriesFilters = {
  userId?: string;
  startDate?: string;
  endDate?: string;
  taskId?: string;
};

type TimeEntriesResponse = {
  entries: TimeEntry[];
  tasks: Task[];
  projects: { id: string; name: string; code: string }[];
  availableTaskIds: string[];
  aggregates: {
    todayMinutes: number;
    weekMinutes: number;
  };
};

export async function listTimeEntriesForUser(actor: PublicUser, filters: TimeEntriesFilters = {}): Promise<TimeEntriesResponse> {
  const target = await resolveTargetUser(actor, filters.userId);
  ensureTimeRole(target);
  const entries = await listTimeEntries({
    userId: target.id,
    startDate: filters.startDate,
    endDate: filters.endDate,
    taskId: filters.taskId
  });
  const assignments = await listAssignments({ developerId: target.id });
  const availableTaskIds = Array.from(
    new Set(
      assignments
        .filter((assignment) => ["APPROVED", "COMPLETED"].includes(assignment.status))
        .map((assignment) => assignment.taskId)
    )
  );
  const taskIds = new Set<string>([...availableTaskIds, ...entries.map((entry) => entry.taskId)]);
  const tasks = await listTasksByIds(Array.from(taskIds));
  const projectIds = new Set<string>([...entries.map((entry) => entry.projectId), ...tasks.map((task) => task.projectId)]);
  const projects = (await listProjects())
    .filter((project) => projectIds.has(project.id))
    .map((project) => ({ id: project.id, name: project.name, code: project.code }));

  const schedule = await resolveSchedule(target);
  const now = DateTime.now().setZone(schedule.timeZone);
  const todayKey = now.toISODate();
  const weekStart = now.startOf("week");
  const aggregates = entries.reduce(
    (acc, entry) => {
      const recordDate = DateTime.fromISO(entry.date, { zone: schedule.timeZone });
      const isToday = entry.date === todayKey;
      const isThisWeek = recordDate.isValid ? recordDate >= weekStart : false;
      if (isToday) {
        acc.todayMinutes += entry.minutes;
      }
      if (isThisWeek) {
        acc.weekMinutes += entry.minutes;
      }
      return acc;
    },
    { todayMinutes: 0, weekMinutes: 0 }
  );

  return {
    entries,
    tasks,
    projects,
    availableTaskIds,
    aggregates
  };
}

export async function createManualTimeEntry(actor: PublicUser, payload: TimeEntryPayload): Promise<TimeEntry> {
  ensureTimeRole(actor);
  await ensureAssignable(actor.id, payload.taskId, payload.projectId);
  await ensureProjectBillable(payload.projectId, payload.billable);
  const schedule = await resolveSchedule(actor);
  if (!payload.date) {
    throw new HttpError(400, "date is required.");
  }
  const window = await resolveWindowFromPayload(actor.id, payload, schedule);
  await assertWorkingDay(actor, schedule, window.dateKey);
  await assertNoOverlap(actor.id, window.startUtc, window.endUtc);
  const entry = await createTimeEntry({
    userId: actor.id,
    projectId: payload.projectId,
    taskId: payload.taskId,
    date: window.dateKey,
    minutes: window.minutes,
    startedAt: window.startUtc,
    endedAt: window.endUtc,
    note: payload.note,
    source: "MANUAL",
    outOfSchedule: !isRangeWithinSchedule(window.startUtc, window.endUtc, schedule.slots, schedule.timeZone),
    workTypeCode: payload.workTypeCode?.trim(),
    billable: payload.billable ?? false,
    location: payload.location?.trim(),
    costRate: payload.costRate,
    costAmount: payload.costAmount
  });
  await recordActivity(actor.id, "TIME_ENTRY_CREATED", "Logged manual time", {
    timeEntryId: entry.id,
    minutes: entry.minutes,
    taskId: entry.taskId
  });
  await ensureTaskInProgress(entry.taskId);
  return entry;
}

export async function updateManualTimeEntry(
  actor: PublicUser,
  id: string,
  payload: TimeEntryUpdatePayload
): Promise<TimeEntry> {
  if (actor.role !== "SUPER_ADMIN") {
    ensureTimeRole(actor);
  }
  const entry = await getTimeEntryOrThrow(id);
  if (entry.userId !== actor.id && actor.role !== "SUPER_ADMIN") {
    throw new Error("You can only edit your own time entries.");
  }
  if (entry.isLocked && actor.role !== "SUPER_ADMIN") {
    throw new HttpError(400, "This time entry is locked.");
  }
  const targetUser = entry.userId === actor.id ? actor : await getPublicUserForEntry(entry.userId);
  const schedule = await resolveSchedule(targetUser);
  const updatedProjectId = payload.projectId ?? entry.projectId;
  const updatedTaskId = payload.taskId ?? entry.taskId;
  await ensureAssignable(entry.userId, updatedTaskId, updatedProjectId);
  await ensureProjectBillable(updatedProjectId, payload.billable ?? entry.billable);

  let nextWindow = {
    startUtc: entry.startedAt,
    endUtc: entry.endedAt,
    minutes: entry.minutes,
    dateKey: entry.date
  };

  const wantsDurationUpdate = payload.minutes !== undefined || payload.hours !== undefined;
  const wantsWindowUpdate = payload.date !== undefined || payload.startTime !== undefined || payload.endTime !== undefined;

  if (wantsDurationUpdate || wantsWindowUpdate) {
    const targetDate = payload.date ?? entry.date;
    await assertWorkingDay(targetUser, schedule, targetDate);
    if (payload.startTime !== undefined || payload.endTime !== undefined) {
      nextWindow = normalizeWindow(
        {
          date: targetDate,
          startTime: payload.startTime ?? toTimeString(entry.startedAt, schedule.timeZone),
          endTime: payload.endTime ?? toTimeString(entry.endedAt, schedule.timeZone)
        },
        schedule.timeZone
      );
    } else if (wantsDurationUpdate) {
      const minutes = resolveDurationMinutes(payload.minutes, payload.hours) ?? entry.minutes;
      nextWindow = await buildDurationWindow(entry.userId, targetDate, minutes, schedule, id);
    } else if (payload.date) {
      nextWindow = normalizeWindow(
        {
          date: targetDate,
          startTime: toTimeString(entry.startedAt, schedule.timeZone),
          endTime: toTimeString(entry.endedAt, schedule.timeZone)
        },
        schedule.timeZone
      );
    }
  }
  await assertNoOverlap(entry.userId, nextWindow.startUtc, nextWindow.endUtc, id);

  const outOfSchedule = !isRangeWithinSchedule(
    nextWindow.startUtc,
    nextWindow.endUtc,
    schedule.slots,
    schedule.timeZone
  );

  const updated = await updateTimeEntry(id, {
    projectId: updatedProjectId,
    taskId: updatedTaskId,
    date: nextWindow.dateKey,
    minutes: nextWindow.minutes,
    startedAt: nextWindow.startUtc,
    endedAt: nextWindow.endUtc,
    note: payload.note,
    outOfSchedule,
    workTypeCode: payload.workTypeCode ?? entry.workTypeCode,
    billable: payload.billable ?? entry.billable,
    location: payload.location ?? entry.location,
    costRate: payload.costRate ?? entry.costRate,
    costAmount: payload.costAmount ?? entry.costAmount
  });

  await recordActivity(actor.id, "TIME_ENTRY_UPDATED", "Updated manual time entry", {
    timeEntryId: id,
    minutes: updated.minutes
  });

  return updated;
}

async function ensureTaskInProgress(taskId: string): Promise<void> {
  const task = await getTaskById(taskId);
  if (task && task.status === "PLANNED") {
    await updateTask(taskId, { status: "IN_PROGRESS" });
  }
}

async function ensureAssignable(userId: string, taskId: string, projectId: string) {
  const task = await getTaskById(taskId);
  if (!task) {
    throw new Error("Task not found.");
  }
  if (task.projectId !== projectId) {
    throw new Error("Task does not belong to the selected project.");
  }
  const assignments = await listAssignments({ taskId: task.id, developerId: userId });
  const hasAccess = assignments.some((assignment) => ["APPROVED", "COMPLETED"].includes(assignment.status));
  if (!hasAccess) {
    throw new Error("You must be assigned to this task before logging time.");
  }
}

type NormalizedWindow = {
  startUtc: string;
  endUtc: string;
  minutes: number;
  dateKey: string;
};

function normalizeWindow(
  payload: Pick<TimeEntryPayload, "date" | "startTime" | "endTime">,
  timeZone: string
): NormalizedWindow {
  if (!payload.date || !payload.startTime || !payload.endTime) {
    throw new Error("date, startTime, and endTime are required.");
  }
  const start = DateTime.fromISO(`${payload.date}T${payload.startTime}`, { zone: timeZone });
  const end = DateTime.fromISO(`${payload.date}T${payload.endTime}`, { zone: timeZone });
  if (!start.isValid || !end.isValid) {
    throw new Error("Invalid start or end time.");
  }
  if (end <= start) {
    throw new Error("End time must be after start time.");
  }
  const minutes = Math.round(end.diff(start, "minutes").minutes);
  if (minutes <= 0 || minutes > MAX_MINUTES_PER_ENTRY) {
    throw new Error("Time entry duration must be between 1 minute and 12 hours.");
  }
  const dateKey = start.toISODate();
  if (!dateKey) {
    throw new Error("Invalid date.");
  }
  return {
    startUtc: start.toUTC().toISO() ?? "",
    endUtc: end.toUTC().toISO() ?? "",
    minutes,
    dateKey
  };
}

async function resolveWindowFromPayload(
  userId: string,
  payload: TimeEntryPayload,
  schedule: { timeZone: string; slots: WorkScheduleSlot[] },
  excludeId?: string
): Promise<NormalizedWindow> {
  if (payload.startTime || payload.endTime) {
    if (!payload.startTime || !payload.endTime) {
      throw new HttpError(400, "startTime and endTime must be provided together.");
    }
    return normalizeWindow(
      {
        date: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime
      },
      schedule.timeZone
    );
  }
  const minutes = resolveDurationMinutes(payload.minutes, payload.hours);
  if (!minutes) {
    throw new HttpError(400, "Provide minutes or hours when start/end are not supplied.");
  }
  return buildDurationWindow(userId, payload.date, minutes, schedule, excludeId);
}

function resolveDurationMinutes(minutes?: number, hours?: number): number | null {
  if (typeof minutes === "number") {
    if (minutes <= 0 || minutes > MAX_MINUTES_PER_ENTRY) {
      throw new HttpError(400, "Time entry duration must be between 1 minute and 12 hours.");
    }
    return minutes;
  }
  if (typeof hours === "number") {
    const converted = Math.round(hours * 60);
    if (converted <= 0 || converted > MAX_MINUTES_PER_ENTRY) {
      throw new HttpError(400, "Time entry duration must be between 1 minute and 12 hours.");
    }
    return converted;
  }
  return null;
}

async function buildDurationWindow(
  userId: string,
  dateKey: string | undefined,
  minutes: number,
  schedule: { timeZone: string; slots: WorkScheduleSlot[] },
  excludeId?: string
): Promise<NormalizedWindow> {
  if (!dateKey) {
    throw new HttpError(400, "date is required.");
  }
  const slot = findScheduleSlotForDate(schedule, dateKey);
  if (!slot) {
    throw new HttpError(400, "Selected date is outside your working schedule.");
  }
  const entries = await listTimeEntries({ userId, date: dateKey });
  const timeZone = schedule.timeZone;
  const sorted = entries
    .filter((entry) => entry.id !== excludeId)
    .map((entry) => ({
      start: DateTime.fromISO(entry.startedAt).setZone(timeZone),
      end: DateTime.fromISO(entry.endedAt).setZone(timeZone)
    }))
    .filter((range) => range.start.isValid && range.end.isValid)
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());

  let cursor = slot.start;
  for (const range of sorted) {
    if (range.end <= cursor) {
      continue;
    }
    const gap = range.start.diff(cursor, "minutes").minutes;
    if (gap >= minutes) {
      break;
    }
    if (range.end > cursor) {
      cursor = range.end;
    }
  }
  const remaining = slot.end.diff(cursor, "minutes").minutes;
  if (remaining < minutes) {
    throw new HttpError(400, "Not enough capacity remaining in your schedule for this entry.");
  }
  const start = cursor;
  const end = cursor.plus({ minutes });
  const normalizedDate = start.toISODate();
  if (!normalizedDate) {
    throw new HttpError(400, "Invalid date.");
  }
  return {
    startUtc: start.toUTC().toISO() ?? "",
    endUtc: end.toUTC().toISO() ?? "",
    minutes,
    dateKey: normalizedDate
  };
}

function findScheduleSlotForDate(
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

async function assertWorkingDay(
  user: PublicUser,
  schedule: { timeZone: string; slots: WorkScheduleSlot[] },
  dateKey: string
) {
  if (!findScheduleSlotForDate(schedule, dateKey)) {
    throw new HttpError(400, "Selected date is outside your working schedule.");
  }
  const [dayOffs, companyHolidays, vendorHolidays] = await Promise.all([
    listDayOffs({ userId: user.id, statuses: ["APPROVED"], startDate: dateKey, endDate: dateKey }),
    user.companyId ? listCompanyHolidays({ companyId: user.companyId }) : Promise.resolve([] as CompanyHoliday[]),
    user.companyId ? listCompanyHolidays({ vendorId: user.companyId }) : Promise.resolve([] as CompanyHoliday[])
  ]);
  if (dayOffs.length) {
    throw new HttpError(400, "You have approved time off on this date.");
  }
  const isHoliday = [...companyHolidays, ...vendorHolidays].some((holiday) => holiday.date === dateKey);
  if (isHoliday) {
    throw new HttpError(400, "Cannot log time on a company holiday.");
  }
}

function toTimeString(timestamp: string, timeZone: string): string {
  const date = DateTime.fromISO(timestamp).setZone(timeZone);
  return date.toFormat("HH:mm");
}

async function resolveTargetUser(actor: PublicUser, requestedUserId?: string): Promise<PublicUser> {
  if (!requestedUserId || requestedUserId === actor.id) {
    return actor;
  }
  const scope = await resolveTimeScope(actor);
  if (scope.allowedUserIds && !scope.allowedUserIds.has(requestedUserId)) {
    throw new HttpError(403, "You do not have permission to view this user's time entries.");
  }
  return getPublicUserForEntry(requestedUserId);
}

async function assertNoOverlap(userId: string, startUtc: string, endUtc: string, excludeId?: string) {
  const dateKey = DateTime.fromISO(startUtc).toISODate();
  if (!dateKey) {
    return;
  }
  const entries = await listTimeEntries({ userId, date: dateKey });
  for (const existing of entries) {
    if (excludeId && existing.id === excludeId) {
      continue;
    }
    if (rangesOverlap(existing.startedAt, existing.endedAt, startUtc, endUtc)) {
      throw new HttpError(400, "Time entry overlaps with an existing entry.");
    }
  }
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const rangeAStart = DateTime.fromISO(aStart);
  const rangeAEnd = DateTime.fromISO(aEnd);
  const rangeBStart = DateTime.fromISO(bStart);
  const rangeBEnd = DateTime.fromISO(bEnd);
  if (!rangeAStart.isValid || !rangeAEnd.isValid || !rangeBStart.isValid || !rangeBEnd.isValid) {
    return false;
  }
  return rangeAStart < rangeBEnd && rangeBStart < rangeAEnd;
}

async function ensureProjectBillable(projectId: string, billable?: boolean) {
  if (!billable) {
    return;
  }
  const project = await getProjectById(projectId);
  if (!project) {
    throw new HttpError(404, "Project not found.");
  }
  if (project.rateModel !== "TIME_AND_MATERIAL") {
    throw new HttpError(400, "Billable time can only be logged on time-and-material projects.");
  }
}

async function getTimeEntryOrThrow(id: string): Promise<TimeEntry> {
  const entry = await getTimeEntryById(id);
  if (!entry) {
    throw new Error("Time entry not found.");
  }
  return entry;
}

async function getPublicUserForEntry(userId: string): Promise<PublicUser> {
  const user = await getUserById(userId);
  if (!user) {
    throw new HttpError(404, "User not found.");
  }
  return toPublicUser(user);
}

async function resolveSchedule(target: PublicUser): Promise<{ timeZone: string; slots: WorkScheduleSlot[] }> {
  const schedule = await findWorkScheduleForUser(target.id, target.companyId);
  const timeZone = schedule?.timeZone ?? target.profile.timeZone;
  const slots = resolveScheduleSlots(schedule?.slots);
  return { timeZone, slots };
}

function ensureTimeRole(actor: PublicUser) {
  if (!TIME_ROLES.includes(actor.role)) {
    throw new Error("Manual time tracking is only available to developers and PMs.");
  }
}
