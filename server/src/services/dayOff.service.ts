import { DateTime } from "luxon";
import {
  createDayOffRequest,
  findWorkScheduleForUser,
  getDayOffById,
  getUserById,
  listDayOffs,
  listUsers,
  recordActivity,
  sendNotifications,
  toPublicUser,
  updateDayOff
} from "../data/repositories";
import { DayOff, DayOffStatus, LeaveType, PublicUser } from "../models/_types";
import { HttpError } from "../middleware/httpError";
import { resolveTimeScope } from "./timeScope.service";
import { nowISO } from "../utils/date";
import { resolveScheduleSlots } from "../utils/scheduleCompliance";

const SICK_LEAVE_ATTACHMENT_THRESHOLD_HOURS = 8;

export type LeaveScope = "mine" | "team" | "vendor" | "org";

type LeaveFilters = {
  scope?: LeaveScope;
  statuses?: DayOffStatus[];
  leaveTypes?: LeaveType[];
  userId?: string;
  startDate?: string;
  endDate?: string;
};

type LeaveRequestPayload = {
  date: string;
  leaveType: LeaveType;
  isPartialDay?: boolean;
  partialStartTimeUtc?: string;
  partialEndTimeUtc?: string;
  reason?: string;
  projectImpactNote?: string;
  contactDetails?: string;
  backupContactUserId?: string;
  attachmentIds?: string[];
  saveAsDraft?: boolean;
};

type LeaveUpdatePayload = LeaveRequestPayload & {
  action?: "UPDATE" | "CANCEL";
};

export async function listLeaveRequests(actor: PublicUser, filters: LeaveFilters = {}) {
  const scope = filters.scope ?? "mine";
  const resolvedScope = await resolveTimeScope(actor);
  const targetUserIds = resolveUserFilters(scope, actor, resolvedScope.allowedUserIds, filters.userId);

  const repoFilters: Parameters<typeof listDayOffs>[0] = {
    statuses: filters.statuses,
    leaveTypes: filters.leaveTypes,
    startDate: filters.startDate,
    endDate: filters.endDate
  };
  if (targetUserIds) {
    if (targetUserIds.length === 1) {
      repoFilters.userId = targetUserIds[0];
    } else {
      repoFilters.userIds = targetUserIds;
    }
  }

  const requests = await listDayOffs(repoFilters);
  const uniqueUserIds = Array.from(new Set(requests.map((request) => request.userId)));
  const users = await listUsers();
  const lookup = new Map(users.map((user) => [user.id, user]));
  const scopedUsers = uniqueUserIds
    .map((userId) => lookup.get(userId))
    .filter((user): user is PublicUser => Boolean(user));

  const sorted = requests.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return {
    dayOffs: sorted,
    users: scopedUsers
  };
}

export async function createLeaveRequest(actor: PublicUser, payload: LeaveRequestPayload): Promise<DayOff> {
  ensureContributor(actor);
  const normalizedDate = normalizeDate(payload.date);
  const normalized = await normalizeLeavePayload(actor, normalizedDate, payload);
  const status: DayOffStatus = payload.saveAsDraft ? "DRAFT" : "SUBMITTED";
  enforceSickLeaveAttachments(normalized.leaveType, normalized.totalRequestedHours, status, normalized.attachmentIds);

  const request = await createDayOffRequest({
    userId: actor.id,
    requestedById: actor.id,
    date: normalizedDate,
    leaveType: normalized.leaveType,
    isPartialDay: normalized.isPartialDay,
    partialStartTimeUtc: normalized.partialStartTimeUtc,
    partialEndTimeUtc: normalized.partialEndTimeUtc,
    totalRequestedHours: normalized.totalRequestedHours,
    reason: normalized.reason,
    projectImpactNote: normalized.projectImpactNote,
    contactDetails: normalized.contactDetails,
    backupContactUserId: normalized.backupContactUserId,
    attachmentIds: normalized.attachmentIds,
    status,
    submittedAt: status === "SUBMITTED" ? nowISO() : undefined,
    submittedById: status === "SUBMITTED" ? actor.id : undefined
  });

  await recordActivity(
    actor.id,
    status === "SUBMITTED" ? "LEAVE_REQUEST_SUBMITTED" : "LEAVE_REQUEST_DRAFTED",
    status === "SUBMITTED" ? "Submitted leave request" : "Saved leave request draft",
    {
      leaveType: request.leaveType,
      date: request.date,
      status: request.status
    },
    request.id,
    "DAY_OFF"
  );

  return request;
}

export async function updateLeaveRequest(actor: PublicUser, id: string, payload: LeaveUpdatePayload): Promise<DayOff> {
  const request = await getLeaveOrThrow(id);
  if (request.userId !== actor.id && actor.role !== "SUPER_ADMIN") {
    throw new HttpError(403, "You can only modify your own leave requests.");
  }
  if (payload.action === "CANCEL") {
    return cancelLeaveRequest(actor, request);
  }
  if (!["DRAFT", "REJECTED"].includes(request.status)) {
    throw new HttpError(400, "Only draft or rejected requests can be edited.");
  }
  const normalizedDate = normalizeDate(payload.date ?? request.date);
  const targetUser = request.userId === actor.id ? actor : await getPublicUserOrThrow(request.userId);
  const normalized = await normalizeLeavePayload(targetUser, normalizedDate, payload);
  const status = payload.saveAsDraft ? request.status : "SUBMITTED";
  enforceSickLeaveAttachments(normalized.leaveType, normalized.totalRequestedHours, status, normalized.attachmentIds);

  const updated = await updateDayOff(request.id, {
    date: normalizedDate,
    leaveType: normalized.leaveType,
    isPartialDay: normalized.isPartialDay,
    partialStartTimeUtc: normalized.partialStartTimeUtc,
    partialEndTimeUtc: normalized.partialEndTimeUtc,
    totalRequestedHours: normalized.totalRequestedHours,
    reason: normalized.reason,
    projectImpactNote: normalized.projectImpactNote,
    contactDetails: normalized.contactDetails,
    backupContactUserId: normalized.backupContactUserId,
    attachmentIds: normalized.attachmentIds,
    status,
    submittedAt: status === "SUBMITTED" ? nowISO() : request.submittedAt,
    submittedById: status === "SUBMITTED" ? actor.id : request.submittedById,
    decisionComment: undefined,
    approvedAt: undefined,
    approvedById: undefined,
    rejectedAt: undefined,
    rejectedById: undefined
  });

  await recordActivity(
    actor.id,
    "LEAVE_REQUEST_UPDATED",
    "Updated leave request",
    { requestId: id, status: updated.status },
    updated.id,
    "DAY_OFF"
  );

  return updated;
}

export async function approveLeaveRequest(actor: PublicUser, id: string, comment?: string): Promise<DayOff> {
  await ensureCanReviewLeave(actor);
  const request = await getLeaveOrThrow(id);
  await enforceLeaveScope(actor, request.userId);
  if (request.status !== "SUBMITTED") {
    throw new HttpError(400, "Only submitted requests can be approved.");
  }
  const updated = await updateDayOff(request.id, {
    status: "APPROVED",
    approvedAt: nowISO(),
    approvedById: actor.id,
    decisionComment: comment,
    rejectedAt: undefined,
    rejectedById: undefined
  });
  await recordActivity(
    actor.id,
    "LEAVE_REQUEST_APPROVED",
    "Approved leave request",
    { requestId: id, comment },
    request.id,
    "DAY_OFF"
  );
  await sendNotifications(
    [request.userId],
    "Leave request approved",
    "LEAVE_REQUEST_APPROVED",
    { requestId: request.id, date: request.date }
  );
  return updated;
}

export async function rejectLeaveRequest(actor: PublicUser, id: string, comment: string): Promise<DayOff> {
  await ensureCanReviewLeave(actor);
  if (!comment?.trim()) {
    throw new HttpError(400, "Rejection comment is required.");
  }
  const request = await getLeaveOrThrow(id);
  await enforceLeaveScope(actor, request.userId);
  if (request.status !== "SUBMITTED") {
    throw new HttpError(400, "Only submitted requests can be rejected.");
  }
  const updated = await updateDayOff(request.id, {
    status: "REJECTED",
    rejectedAt: nowISO(),
    rejectedById: actor.id,
    decisionComment: comment
  });
  await recordActivity(
    actor.id,
    "LEAVE_REQUEST_REJECTED",
    "Rejected leave request",
    { requestId: id, comment },
    request.id,
    "DAY_OFF"
  );
  await sendNotifications(
    [request.userId],
    "Leave request rejected",
    "LEAVE_REQUEST_REJECTED",
    { requestId: request.id, date: request.date, comment }
  );
  return updated;
}

async function cancelLeaveRequest(actor: PublicUser, request: DayOff): Promise<DayOff> {
  if (!["SUBMITTED", "APPROVED"].includes(request.status)) {
    throw new HttpError(400, "Only submitted or approved requests can be cancelled.");
  }
  const updated = await updateDayOff(request.id, {
    status: "CANCELLED",
    cancelledAt: nowISO(),
    cancelledById: actor.id
  });
  await recordActivity(
    actor.id,
    "LEAVE_REQUEST_CANCELLED",
    "Cancelled leave request",
    { requestId: request.id },
    request.id,
    "DAY_OFF"
  );
  return updated;
}

function resolveUserFilters(
  scope: LeaveScope,
  actor: PublicUser,
  allowedUserIds: Set<string> | null,
  explicitUserId?: string
): string[] | null {
  if (explicitUserId) {
    if (allowedUserIds && !allowedUserIds.has(explicitUserId) && actor.role !== "SUPER_ADMIN") {
      throw new HttpError(403, "You do not have access to this user.");
    }
    return [explicitUserId];
  }
  if (scope === "mine") {
    return [actor.id];
  }
  if (!allowedUserIds) {
    return null;
  }
  return Array.from(allowedUserIds);
}

function ensureContributor(actor: PublicUser) {
  if (!["DEVELOPER", "ENGINEER", "PROJECT_MANAGER"].includes(actor.role)) {
    throw new HttpError(403, "Only consultants can request leave.");
  }
}

async function ensureCanReviewLeave(actor: PublicUser) {
  if (!["PM", "PROJECT_MANAGER", "SUPER_ADMIN"].includes(actor.role)) {
    throw new HttpError(403, "You do not have permission to review leave.");
  }
}

async function getLeaveOrThrow(id: string): Promise<DayOff> {
  const request = await getDayOffById(id);
  if (!request) {
    throw new HttpError(404, "Leave request not found.");
  }
  return request;
}

async function enforceLeaveScope(actor: PublicUser, userId: string) {
  if (actor.role === "SUPER_ADMIN" || actor.id === userId) {
    return;
  }
  const scope = await resolveTimeScope(actor);
  if (scope.allowedUserIds && !scope.allowedUserIds.has(userId)) {
    throw new HttpError(403, "You do not have permission to act on this leave request.");
  }
}

async function getPublicUserOrThrow(userId: string): Promise<PublicUser> {
  const user = await getUserById(userId);
  if (!user) {
    throw new HttpError(404, "User not found.");
  }
  return toPublicUser(user);
}

async function normalizeLeavePayload(targetUser: PublicUser, date: string, payload: LeaveRequestPayload) {
  if (!payload.leaveType) {
    throw new HttpError(400, "leaveType is required.");
  }
  const isPartialDay = Boolean(payload.isPartialDay || payload.partialStartTimeUtc || payload.partialEndTimeUtc);
  const partialTimes = resolvePartialTimes(isPartialDay, payload.partialStartTimeUtc, payload.partialEndTimeUtc);
  const totalRequestedHours = isPartialDay
    ? partialTimes.durationHours
    : await resolveFullDayHours(targetUser.id, targetUser.companyId, date);

  return {
    leaveType: payload.leaveType,
    isPartialDay,
    partialStartTimeUtc: partialTimes.startUtc,
    partialEndTimeUtc: partialTimes.endUtc,
    totalRequestedHours,
    reason: payload.reason?.trim(),
    projectImpactNote: payload.projectImpactNote?.trim(),
    contactDetails: payload.contactDetails?.trim(),
    backupContactUserId: payload.backupContactUserId,
    attachmentIds: payload.attachmentIds ?? []
  };
}

function resolvePartialTimes(isPartialDay: boolean, start?: string, end?: string) {
  if (!isPartialDay) {
    return { startUtc: undefined, endUtc: undefined, durationHours: 0 };
  }
  if (!start || !end) {
    throw new HttpError(400, "Partial day leave requires start and end timestamps.");
  }
  const startDt = DateTime.fromISO(start);
  const endDt = DateTime.fromISO(end);
  if (!startDt.isValid || !endDt.isValid || endDt <= startDt) {
    throw new HttpError(400, "Partial day times must be valid and end after start.");
  }
  const minutes = endDt.diff(startDt, "minutes").minutes;
  return {
    startUtc: startDt.toUTC().toISO(),
    endUtc: endDt.toUTC().toISO(),
    durationHours: Math.round((minutes / 60) * 100) / 100
  };
}

async function resolveFullDayHours(userId: string, companyId: string | undefined, date: string) {
  const schedule = await findWorkScheduleForUser(userId, companyId);
  const slots = resolveScheduleSlots(schedule?.slots);
  if (!slots.length) {
    return 8;
  }
  const day = DateTime.fromISO(date).weekday % 7;
  const minutes = slots
    .filter((slot) => slot.day === day)
    .reduce((total, slot) => {
      const start = DateTime.fromISO(`${date}T${slot.start}`, { zone: schedule?.timeZone ?? "UTC" });
      const end = DateTime.fromISO(`${date}T${slot.end}`, { zone: schedule?.timeZone ?? "UTC" });
      if (!start.isValid || !end.isValid || end <= start) {
        return total;
      }
      return total + end.diff(start, "minutes").minutes;
    }, 0);
  return minutes > 0 ? Math.round((minutes / 60) * 100) / 100 : 8;
}

function normalizeDate(input: string): string {
  const normalized = DateTime.fromISO(input);
  if (!normalized.isValid) {
    throw new HttpError(400, "Invalid date provided.");
  }
  return normalized.toISODate()!;
}

function enforceSickLeaveAttachments(
  leaveType: LeaveType,
  totalHours: number,
  status: DayOffStatus,
  attachments: string[]
) {
  if (leaveType === "SICK" && status !== "DRAFT" && totalHours >= SICK_LEAVE_ATTACHMENT_THRESHOLD_HOURS) {
    if (!attachments?.length) {
      throw new HttpError(400, "Medical documentation is required for extended sick leave.");
    }
  }
}
