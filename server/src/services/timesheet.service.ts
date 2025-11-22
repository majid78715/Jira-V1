import { DateTime } from "luxon";
import {
  createTimesheet,
  findTimesheetByUserAndWeek,
  getTimesheetById,
  getUserById,
  listCompanyHolidays,
  listDayOffs,
  listProjects,
  listTasksByIds,
  listTimeEntries,
  listTimeEntriesByIds,
  listTimesheets,
  listUsers,
  lockTimeEntries,
  recordActivity,
  sendNotifications,
  unlockTimeEntries,
  updateTimesheet
} from "../data/repositories";
import { PublicUser, Task, TimeEntry, Timesheet } from "../models/_types";
import { nowISO } from "../utils/date";
import { HttpError } from "../middleware/httpError";

const CONTRIBUTOR_ROLES: PublicUser["role"][] = ["DEVELOPER", "ENGINEER"];
const APPROVER_ROLES: PublicUser["role"][] = ["PM", "PROJECT_MANAGER", "SUPER_ADMIN"];

type WeekSummary = {
  weekStart: string;
  weekEnd: string;
};

type TimesheetOverview = WeekSummary & {
  timesheet: Timesheet | null;
  entries: TimeEntry[];
  tasks: Task[];
  projects: { id: string; name: string; code: string }[];
};

type ApprovalQueueResponse = {
  timesheets: Timesheet[];
  users: PublicUser[];
  entries: Record<string, TimeEntry[]>;
  tasks: Task[];
  projects: { id: string; name: string; code: string }[];
};

export async function getTimesheetOverview(actor: PublicUser, weekStart?: string): Promise<TimesheetOverview> {
  ensureContributor(actor);
  const range = resolveWeekRange(weekStart, actor.profile.timeZone);
  const [timesheet, entries] = await Promise.all([
    findTimesheetByUserAndWeek(actor.id, range.weekStart),
    listTimeEntries({ userId: actor.id, startDate: range.weekStart, endDate: range.weekEnd })
  ]);
  const taskIds = Array.from(new Set(entries.map((entry) => entry.taskId)));
  const projectIds = new Set(entries.map((entry) => entry.projectId));
  const [tasks, projectList] = await Promise.all([
    listTasksByIds(taskIds),
    listProjects()
  ]);
  const projects = projectList
    .filter((project) => projectIds.has(project.id))
    .map((project) => ({ id: project.id, name: project.name, code: project.code }));
  return {
    ...range,
    timesheet: timesheet ?? null,
    entries,
    tasks,
    projects
  };
}

export async function generateTimesheet(
  actor: PublicUser,
  payload: { weekStart?: string }
): Promise<{ timesheet: Timesheet; created: boolean }> {
  ensureContributor(actor);
  const range = resolveWeekRange(payload.weekStart, actor.profile.timeZone);
  const entries = await listTimeEntries({ userId: actor.id, startDate: range.weekStart, endDate: range.weekEnd });
  if (!entries.length) {
    throw new HttpError(400, "No time entries found for the selected week.");
  }
  const timeEntryIds = entries.map((entry) => entry.id);
  const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);
  const existing = await findTimesheetByUserAndWeek(actor.id, range.weekStart);

  if (!existing) {
    const timesheet = await createTimesheet({
      userId: actor.id,
      weekStart: range.weekStart,
      weekEnd: range.weekEnd,
      totalMinutes,
      timeEntryIds
    });
    await recordActivity(
      actor.id,
      "TIMESHEET_GENERATED",
      `Prepared timesheet for week of ${range.weekStart}`,
      { timesheetId: timesheet.id, weekStart: range.weekStart },
      timesheet.id,
      "TIMESHEET"
    );
    return { timesheet, created: true };
  }

  if (existing.status === "APPROVED") {
    throw new HttpError(400, "Timesheet already approved for this week.");
  }
  if (existing.status === "SUBMITTED") {
    throw new HttpError(400, "Timesheet already submitted and awaiting review.");
  }

  const updatePayload: Parameters<typeof updateTimesheet>[1] = {
    totalMinutes,
    timeEntryIds,
    weekEnd: range.weekEnd
  };

  if (existing.status === "REJECTED") {
    updatePayload.status = "DRAFT";
    updatePayload.submittedAt = undefined;
    updatePayload.submittedById = undefined;
    updatePayload.rejectedAt = undefined;
    updatePayload.rejectedById = undefined;
    updatePayload.rejectionComment = undefined;
  }

  const timesheet = await updateTimesheet(existing.id, updatePayload);
  await recordActivity(
    actor.id,
    "TIMESHEET_GENERATED",
    `Updated timesheet for week of ${range.weekStart}`,
    { timesheetId: timesheet.id, weekStart: range.weekStart },
    timesheet.id,
    "TIMESHEET"
  );

  return { timesheet, created: false };
}

export async function submitTimesheet(actor: PublicUser, id: string): Promise<Timesheet> {
  ensureContributor(actor);
  const timesheet = await getTimesheetOrThrow(id);
  if (timesheet.userId !== actor.id) {
    throw new HttpError(403, "You can only submit your own timesheets.");
  }
  if (!["DRAFT", "REJECTED"].includes(timesheet.status)) {
    throw new HttpError(400, "Timesheet cannot be submitted in its current status.");
  }
  if (!timesheet.timeEntryIds.length) {
    throw new HttpError(400, "Timesheet has no time entries.");
  }
  await ensureWeekCoverage(actor, timesheet);
  const updatePayload: Parameters<typeof updateTimesheet>[1] = {
    status: "SUBMITTED",
    submittedAt: nowISO(),
    submittedById: actor.id
  };
  if (timesheet.status === "REJECTED") {
    updatePayload.rejectedAt = undefined;
    updatePayload.rejectedById = undefined;
    updatePayload.rejectionComment = undefined;
  }
  const updated = await updateTimesheet(timesheet.id, updatePayload);
  await lockTimeEntries(updated.timeEntryIds, updated.id);
  await recordActivity(
    actor.id,
    "TIMESHEET_SUBMITTED",
    `Submitted timesheet for week of ${timesheet.weekStart}`,
    { timesheetId: timesheet.id },
    timesheet.id,
    "TIMESHEET"
  );
  return updated;
}

export async function approveTimesheet(actor: PublicUser, id: string): Promise<Timesheet> {
  ensureApprover(actor);
  const timesheet = await getTimesheetOrThrow(id);
  if (timesheet.status !== "SUBMITTED") {
    throw new HttpError(400, "Only submitted timesheets can be approved.");
  }
  const owner = await getUserById(timesheet.userId);
  if (!owner) {
    throw new HttpError(404, "Timesheet owner not found.");
  }
  if (actor.role === "PROJECT_MANAGER" && actor.companyId && owner.companyId !== actor.companyId) {
    throw new HttpError(403, "Cannot review timesheets outside your company.");
  }
  const updated = await updateTimesheet(timesheet.id, {
    status: "APPROVED",
    approvedAt: nowISO(),
    approvedById: actor.id,
    rejectionComment: undefined,
    rejectedAt: undefined,
    rejectedById: undefined
  });
  await lockTimeEntries(updated.timeEntryIds, updated.id);
  await recordActivity(
    actor.id,
    "TIMESHEET_APPROVED",
    `Approved timesheet for week of ${updated.weekStart}`,
    { timesheetId: updated.id, userId: updated.userId },
    updated.id,
    "TIMESHEET"
  );
  await sendNotifications(
    [updated.userId],
    "Your timesheet was approved.",
    "TIMESHEET_APPROVED",
    { timesheetId: updated.id, weekStart: updated.weekStart }
  );
  return updated;
}

export async function rejectTimesheet(actor: PublicUser, id: string, comment: string): Promise<Timesheet> {
  ensureApprover(actor);
  if (!comment?.trim()) {
    throw new HttpError(400, "Rejection comment is required.");
  }
  const timesheet = await getTimesheetOrThrow(id);
  if (timesheet.status !== "SUBMITTED") {
    throw new HttpError(400, "Only submitted timesheets can be rejected.");
  }
  const owner = await getUserById(timesheet.userId);
  if (!owner) {
    throw new HttpError(404, "Timesheet owner not found.");
  }
  if (actor.role === "PROJECT_MANAGER" && actor.companyId && owner.companyId !== actor.companyId) {
    throw new HttpError(403, "Cannot review timesheets outside your company.");
  }
  const updated = await updateTimesheet(timesheet.id, {
    status: "REJECTED",
    rejectedAt: nowISO(),
    rejectedById: actor.id,
    rejectionComment: comment.trim()
  });
  await unlockTimeEntries(updated.timeEntryIds);
  await recordActivity(
    actor.id,
    "TIMESHEET_REJECTED",
    `Rejected timesheet for week of ${updated.weekStart}`,
    { timesheetId: updated.id, comment: comment.trim() },
    updated.id,
    "TIMESHEET"
  );
  await sendNotifications(
    [updated.userId],
    "Your timesheet was rejected.",
    "TIMESHEET_REJECTED",
    { timesheetId: updated.id, weekStart: updated.weekStart, comment: comment.trim() }
  );
  return updated;
}

export async function listTimesheetsForApproval(actor: PublicUser): Promise<ApprovalQueueResponse> {
  ensureApprover(actor);
  const pending = await listTimesheets({ statuses: ["SUBMITTED"] });
  if (!pending.length) {
    return {
      timesheets: [],
      users: [],
      entries: {},
      tasks: [],
      projects: []
    };
  }
  const allUsers = await listUsers();
  const userLookup = new Map(allUsers.map((user) => [user.id, user]));
  const filtered = pending.filter((sheet) => {
    const entry = userLookup.get(sheet.userId);
    if (!entry) {
      return false;
    }
    if (actor.role === "PROJECT_MANAGER" && actor.companyId && entry.companyId !== actor.companyId) {
      return false;
    }
    return true;
  });
  const entryIds = filtered.flatMap((sheet) => sheet.timeEntryIds);
  const entries = await listTimeEntriesByIds(entryIds);
  const entryLookup = new Map(entries.map((entry) => [entry.id, entry]));
  const entriesByTimesheet: Record<string, TimeEntry[]> = {};
  filtered.forEach((sheet) => {
    entriesByTimesheet[sheet.id] = sheet.timeEntryIds
      .map((entryId) => entryLookup.get(entryId))
      .filter((entry): entry is TimeEntry => Boolean(entry));
  });
  const tasks = await listTasksByIds(Array.from(new Set(entries.map((entry) => entry.taskId))));
  const projectIds = new Set(entries.map((entry) => entry.projectId));
  const projectList = await listProjects();
  const projects = projectList
    .filter((project) => projectIds.has(project.id))
    .map((project) => ({ id: project.id, name: project.name, code: project.code }));
  const uniqueUsers = Array.from(
    new Map(
      filtered
        .map((sheet) => userLookup.get(sheet.userId))
        .filter((user): user is PublicUser => Boolean(user))
        .map((user) => [user.id, user] as const)
    ).values()
  );

  return {
    timesheets: filtered,
    users: uniqueUsers,
    entries: entriesByTimesheet,
    tasks,
    projects
  };
}

function ensureContributor(actor: PublicUser) {
  if (!CONTRIBUTOR_ROLES.includes(actor.role)) {
    throw new HttpError(403, "Timesheets are only available to developers and engineers.");
  }
}

function ensureApprover(actor: PublicUser) {
  if (!APPROVER_ROLES.includes(actor.role)) {
    throw new HttpError(403, "You do not have permission to review timesheets.");
  }
}

async function ensureWeekCoverage(actor: PublicUser, timesheet: Timesheet) {
  const entries = await listTimeEntriesByIds(timesheet.timeEntryIds);
  const entryDates = new Set(entries.map((entry) => entry.date));
  const dayOffs = await listDayOffs({
    userId: actor.id,
    statuses: ["APPROVED"],
    startDate: timesheet.weekStart,
    endDate: timesheet.weekEnd
  });
  const leaveDates = new Set(dayOffs.map((leave) => leave.date));
  const holidays = await listCompanyHolidays({ companyId: actor.companyId });
  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  let cursor = DateTime.fromISO(timesheet.weekStart);
  const end = DateTime.fromISO(timesheet.weekEnd);
  while (cursor.isValid && end.isValid && cursor <= end) {
    if (![6, 7].includes(cursor.weekday)) {
      const dateKey = cursor.toISODate();
      if (dateKey && !entryDates.has(dateKey) && !leaveDates.has(dateKey) && !holidayDates.has(dateKey)) {
        throw new HttpError(400, `Missing time or approved leave for ${dateKey}.`);
      }
    }
    cursor = cursor.plus({ days: 1 });
  }
}

function resolveWeekRange(input: string | undefined, timeZone: string): WeekSummary {
  const base = input
    ? DateTime.fromISO(input, { zone: timeZone || "UTC" })
    : DateTime.now().setZone(timeZone || "UTC");
  if (!base.isValid) {
    throw new HttpError(400, "Invalid date provided.");
  }
  const start = base.startOf("day").minus({ days: base.weekday - 1 });
  const end = start.plus({ days: 6 });
  const weekStart = start.toISODate();
  const weekEnd = end.toISODate();
  if (!weekStart || !weekEnd) {
    throw new HttpError(400, "Unable to resolve week boundary.");
  }
  return { weekStart, weekEnd };
}

async function getTimesheetOrThrow(id: string): Promise<Timesheet> {
  const timesheet = await getTimesheetById(id);
  if (!timesheet) {
    throw new HttpError(404, "Timesheet not found.");
  }
  return timesheet;
}
