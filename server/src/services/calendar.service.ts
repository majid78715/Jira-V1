import { DateTime } from "luxon";
import {
  getProjectById,
  getUserById,
  listAssignments,
  listCompanies,
  listCompanyHolidays,
  listDayOffs,
  listProjectTasks,
  listProjects,
  listTasksByIds,
  listUsers,
  toPublicUser,
  listMeetings
} from "../data/repositories";
import {
  Assignment,
  CompanyHoliday,
  DayOff,
  DayOffStatus,
  Project,
  PublicCompany,
  PublicUser,
  Task,
  Meeting
} from "../models/_types";
import { HttpError } from "../middleware/httpError";

export type CalendarScope = "user" | "team";

export type CalendarEventType = "ASSIGNMENT" | "MILESTONE" | "DAY_OFF" | "HOLIDAY" | "MEETING";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  subtitle?: string;
  startDate: string;
  endDate: string;
  projectId?: string;
  taskId?: string;
  userId?: string;
  status?: string;
  meetingId?: string;
  linkedChatRoomId?: string;
  location?: string;
  allDay?: boolean;
}

export interface UserCalendarPayload {
  scope: CalendarScope;
  owner: PublicUser;
  events: CalendarEvent[];
  users: PublicUser[];
}

export interface ProjectCalendarPayload {
  project: Project;
  events: CalendarEvent[];
  users: PublicUser[];
}

type UserCalendarOptions = {
  scope?: CalendarScope;
};

const DEFAULT_SCOPE: CalendarScope = "user";

export async function getUserCalendar(
  actor: PublicUser,
  userId: string,
  options: UserCalendarOptions = {}
): Promise<UserCalendarPayload> {
  const target = await getUserById(userId);
  if (!target) {
    throw new HttpError(404, "User not found.");
  }
  const targetPublic = toPublicUser(target);
  ensureUserCalendarAccess(actor, targetPublic);

  const scope: CalendarScope = options.scope === "team" ? "team" : DEFAULT_SCOPE;
  const [allUsers, projects, companies] = await Promise.all([listUsers(), listProjects(), listCompanies()]);

  const companyId = targetPublic.companyId ?? actor.companyId;
  const scopedUsers =
    scope === "team" && companyId
      ? allUsers.filter((candidate) => candidate.companyId === companyId)
      : [targetPublic];
  const uniqueUsers = dedupeUsers([targetPublic, ...scopedUsers]);
  const userLookup = new Map(uniqueUsers.map((user) => [user.id, user]));
  const projectLookup = new Map(projects.map((project) => [project.id, project]));
  const companyLookup = new Map(companies.map((company) => [company.id, company]));

  const targetUserIds = new Set(uniqueUsers.map((user) => user.id));
  const assignments = (await listAssignments()).filter(
    (assignment) => targetUserIds.has(assignment.developerId) && assignment.status !== "CANCELLED"
  );
  const taskIds = Array.from(new Set(assignments.map((assignment) => assignment.taskId)));
  const tasks = await listTasksByIds(taskIds);

  const dayOffFilters =
    scope === "team" && companyId
      ? { companyId, statuses: ["APPROVED"] as DayOffStatus[] }
      : { userId: targetPublic.id, statuses: ["APPROVED"] as DayOffStatus[] };
  const [dayOffs, holidays, meetings] = await Promise.all([
    listDayOffs(dayOffFilters),
    companyId ? listCompanyHolidays({ companyId }) : Promise.resolve([]),
    listMeetings({ userId: targetPublic.id })
  ]);

  const events: CalendarEvent[] = [];
  events.push(...buildAssignmentEvents(assignments, tasks, projectLookup, userLookup));
  events.push(...buildMilestoneEvents(tasks, projectLookup));
  events.push(...buildDayOffEvents(dayOffs, userLookup));
  events.push(...buildHolidayEvents(holidays, companyLookup));
  events.push(...buildMeetingEvents(meetings));

  return {
    scope,
    owner: targetPublic,
    users: uniqueUsers,
    events: sortEvents(events)
  };
}

export async function getProjectCalendar(actor: PublicUser, projectId: string): Promise<ProjectCalendarPayload> {
  if (!actor) {
    throw new HttpError(401, "Authentication required.");
  }
  const project = await getProjectById(projectId);
  if (!project) {
    throw new HttpError(404, "Project not found.");
  }
  enforceProjectCalendarAccess(actor, project);

  const [tasks, assignments, allUsers, companies] = await Promise.all([
    listProjectTasks(project.id),
    listAssignments(),
    listUsers(),
    listCompanies()
  ]);
  const taskLookup = new Map(tasks.map((task) => [task.id, task]));
  const projectLookup = new Map([[project.id, project]]);
  const companyLookup = new Map(companies.map((company) => [company.id, company]));
  const userLookup = new Map(allUsers.map((user) => [user.id, user]));

  const projectAssignments = assignments.filter(
    (assignment) => taskLookup.has(assignment.taskId) && assignment.status !== "CANCELLED"
  );
  const assignmentUserIds = new Set(projectAssignments.map((assignment) => assignment.developerId));
  const relevantUsers = dedupeUsers(
    allUsers.filter((user) => assignmentUserIds.has(user.id) || user.id === project.ownerId)
  );

  const owner = userLookup.get(project.ownerId);
  const holidaySets: CompanyHoliday[] = [];
  const seenHolidayIds = new Set<string>();
  const includeHolidays = async (companyId?: string) => {
    const scoped = await listCompanyHolidays(companyId ? { companyId } : undefined);
    for (const entry of scoped) {
      if (seenHolidayIds.has(entry.id)) continue;
      seenHolidayIds.add(entry.id);
      holidaySets.push(entry);
    }
  };

  await includeHolidays(owner?.companyId);
  await includeHolidays(undefined);
  for (const vendorId of project.vendorCompanyIds ?? []) {
    await includeHolidays(vendorId);
  }

  const dayOffs = (await listDayOffs({ statuses: ["APPROVED"] as DayOffStatus[] })).filter((dayOff) =>
    assignmentUserIds.has(dayOff.userId)
  );

  const meetings = await listMeetings({ projectId: project.id });

  const events: CalendarEvent[] = [];
  events.push(...buildAssignmentEvents(projectAssignments, tasks, projectLookup, userLookup));
  events.push(...buildMilestoneEvents(tasks, projectLookup));
  events.push(...buildDayOffEvents(dayOffs, userLookup));
  events.push(...buildHolidayEvents(holidaySets, companyLookup));
  events.push(...buildMeetingEvents(meetings));

  return {
    project,
    users: relevantUsers,
    events: sortEvents(events)
  };
}

export async function exportUserCalendarICS(
  actor: PublicUser,
  userId: string,
  options: UserCalendarOptions = {}
): Promise<{ filename: string; content: string }> {
  const calendar = await getUserCalendar(actor, userId, options);
  const ownerName = `${calendar.owner.profile.firstName} ${calendar.owner.profile.lastName}`.trim();
  const filename = ownerName ? `${ownerName.replace(/\s+/g, "-").toLowerCase()}-calendar.ics` : "calendar.ics";
  const eventsForExport = calendar.events.filter((event) =>
    ["MILESTONE", "DAY_OFF", "HOLIDAY"].includes(event.type)
  );
  const content = serializeICS(ownerName || "HUMAIN Calendar", eventsForExport);
  return { filename, content };
}

function ensureUserCalendarAccess(actor: PublicUser, target: PublicUser) {
  if (actor.id === target.id) {
    return;
  }
  if (isAdminActor(actor)) {
    return;
  }
  if (actor.role === "PROJECT_MANAGER") {
    if (actor.companyId && target.companyId && actor.companyId === target.companyId) {
      return;
    }
    throw new HttpError(403, "Cannot view calendars outside your vendor.");
  }
  throw new HttpError(403, "Insufficient permissions to view this calendar.");
}

function enforceProjectCalendarAccess(actor: PublicUser, project: Project) {
  if (isAdminActor(actor)) {
    return;
  }
  if (actor.role === "PROJECT_MANAGER") {
    if (actor.companyId && project.vendorCompanyIds.includes(actor.companyId)) {
      return;
    }
    throw new HttpError(403, "Cannot view calendars outside your vendor.");
  }
  throw new HttpError(403, "Insufficient permissions to view this project calendar.");
}

function isAdminActor(actor: PublicUser) {
  return actor.role === "PM" || actor.role === "SUPER_ADMIN";
}

function dedupeUsers(users: PublicUser[]): PublicUser[] {
  const seen = new Map<string, PublicUser>();
  users.forEach((user) => {
    if (!seen.has(user.id)) {
      seen.set(user.id, user);
    }
  });
  return Array.from(seen.values());
}

function buildAssignmentEvents(
  assignments: Assignment[],
  tasks: Task[],
  projectLookup: Map<string, Project>,
  userLookup: Map<string, PublicUser>
): CalendarEvent[] {
  const taskLookup = new Map(tasks.map((task) => [task.id, task]));
  const events: CalendarEvent[] = [];
  for (const assignment of assignments) {
    const task = taskLookup.get(assignment.taskId);
    if (!task) continue;
    const project = projectLookup.get(task.projectId);
    const developer = userLookup.get(assignment.developerId);
    const startDate =
      toDateOnly(task.plannedStartDate) ?? toDateOnly(task.expectedCompletionDate) ?? toDateOnly(task.dueDate) ?? toDateOnly(assignment.createdAt);
    const endDate =
      toDateOnly(task.expectedCompletionDate) ??
      toDateOnly(task.dueDate) ??
      startDate ??
      toDateOnly(assignment.updatedAt) ??
      startDate;

    if (!startDate || !endDate) {
      continue;
    }

    const subtitleParts = [
      project?.name,
      developer ? `${developer.profile.firstName} ${developer.profile.lastName}` : undefined
    ].filter(Boolean);

    events.push({
      id: `assignment-${assignment.id}`,
      type: "ASSIGNMENT",
      title: task.title,
      subtitle: subtitleParts.length ? subtitleParts.join(" • ") : undefined,
      startDate,
      endDate: ensureEndDate(startDate, endDate),
      projectId: task.projectId,
      taskId: task.id,
      userId: assignment.developerId,
      status: assignment.status
    });
  }
  return events;
}

function buildMilestoneEvents(tasks: Task[], projectLookup: Map<string, Project>): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const task of tasks) {
    const milestoneDate = toDateOnly(task.expectedCompletionDate ?? task.dueDate);
    if (!milestoneDate) {
      continue;
    }
    const project = projectLookup.get(task.projectId);
    events.push({
      id: `milestone-${task.id}`,
      type: "MILESTONE",
      title: `Milestone: ${task.title}`,
      subtitle: project?.name,
      startDate: milestoneDate,
      endDate: milestoneDate,
      projectId: task.projectId,
      taskId: task.id,
      status: task.status
    });
  }
  return events;
}

function buildDayOffEvents(dayOffs: DayOff[], userLookup: Map<string, PublicUser>): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const entry of dayOffs) {
    const startDate = entry.isPartialDay && entry.partialStartTimeUtc ? entry.partialStartTimeUtc : toDateOnly(entry.date);
    const endDate = entry.isPartialDay && entry.partialEndTimeUtc ? entry.partialEndTimeUtc : toDateOnly(entry.date);
    if (!startDate || !endDate) continue;
    const user = userLookup.get(entry.userId);
    const title = user ? `${user.profile.firstName} ${user.profile.lastName} leave` : "Leave";
    events.push({
      id: `dayoff-${entry.id}`,
      type: "DAY_OFF",
      title,
      subtitle: entry.reason ?? entry.leaveType,
      startDate,
      endDate,
      userId: entry.userId,
      status: entry.status
    });
  }
  return events;
}

function buildHolidayEvents(holidays: CompanyHoliday[], companyLookup: Map<string, PublicCompany>): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const holiday of holidays) {
    const startDate = holiday.isFullDay ? toDateOnly(holiday.date) : holiday.partialStartTimeUtc ?? toDateOnly(holiday.date);
    const endDate = holiday.isFullDay ? toDateOnly(holiday.date) : holiday.partialEndTimeUtc ?? toDateOnly(holiday.date);
    if (!startDate || !endDate) continue;
    const company = holiday.companyId ? companyLookup.get(holiday.companyId) : undefined;
    const subtitle = holiday.vendorId
      ? "Vendor observance"
      : company
        ? `${company.name} observance`
        : "Global observance";
    events.push({
      id: `holiday-${holiday.id}`,
      type: "HOLIDAY",
      title: holiday.calendarName || holiday.name,
      subtitle,
      startDate,
      endDate
    });
  }
  return events;
}

function buildMeetingEvents(meetings: Meeting[]): CalendarEvent[] {
  return meetings.map((meeting) => ({
    id: `meeting-${meeting.id}`,
    type: "MEETING",
    title: meeting.title,
    subtitle: meeting.type === 'VIRTUAL' ? 'Online Meeting' : 'In Person',
    description: meeting.description,
    startDate: meeting.startTime,
    endDate: meeting.endTime,
    meetingId: meeting.id,
    linkedChatRoomId: meeting.linkedChatRoomId,
    location: meeting.location,
    status: meeting.status,
    allDay: meeting.allDay
  }));
}

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.startDate === b.startDate) {
      return a.title.localeCompare(b.title);
    }
    return a.startDate.localeCompare(b.startDate);
  });
}

function toDateOnly(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = DateTime.fromISO(value, { zone: "utc" });
  return parsed.isValid ? parsed.toISODate() ?? undefined : undefined;
}

function ensureEndDate(start: string, end: string): string {
  return end >= start ? end : start;
}

function serializeICS(name: string, events: CalendarEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HUMAIN//Ops Console//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeICS(name)}`
  ];

  const stamp = DateTime.now().toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
  for (const event of events) {
    const start = formatICSDate(event.startDate);
    const endDate = formatICSDate(addDays(event.endDate || event.startDate, 1));
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeICS(event.id)}@ops-console`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`SUMMARY:${escapeICS(event.title)}`);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${endDate}`);
    if (event.subtitle) {
      lines.push(`DESCRIPTION:${escapeICS(event.subtitle)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function escapeICS(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\r?\n/g, "\\n");
}

function formatICSDate(date: string): string {
  const parsed = DateTime.fromISO(date, { zone: "utc" });
  return parsed.isValid ? parsed.toFormat("yyyyMMdd") : DateTime.now().toUTC().toFormat("yyyyMMdd");
}

function addDays(date: string, days: number): string {
  const parsed = DateTime.fromISO(date, { zone: "utc" });
  const adjusted = parsed.isValid ? parsed.plus({ days }) : DateTime.now().plus({ days });
  return adjusted.toISODate() ?? date;
}
