import {
  PublicUser,
  WorkSchedule,
  WorkScheduleSlot
} from "../models/_types";
import {
  findWorkScheduleForUser,
  getUserById,
  toPublicUser,
  upsertWorkSchedule
} from "../data/repositories";

const timePattern = /^([0-1]\d|2[0-3]):[0-5]\d$/;

type SchedulePayload = {
  slots: WorkScheduleSlot[];
};

export async function getScheduleForUser(actor: PublicUser, userId: string): Promise<{
  schedule: Pick<WorkSchedule, "timeZone" | "slots">;
  targetUser: PublicUser;
}> {
  const target = await getUserByIdOrThrow(userId);
  ensureScheduleAccess(actor, target.id);
  const schedule = await findWorkScheduleForUser(target.id, target.companyId);
  return {
    schedule: {
      timeZone: schedule?.timeZone ?? target.profile.timeZone,
      slots: schedule?.slots ?? []
    },
    targetUser: toPublicUser(target)
  };
}

export async function saveScheduleForUser(actor: PublicUser, userId: string, payload: SchedulePayload): Promise<WorkSchedule> {
  const target = await getUserByIdOrThrow(userId);
  ensureScheduleAccess(actor, target.id);
  const slots = validateSlots(payload.slots ?? []);
  return upsertWorkSchedule({
    userId: target.id,
    timeZone: target.profile.timeZone,
    slots,
    name: `${target.profile.firstName} ${target.profile.lastName}`
  });
}

function ensureScheduleAccess(actor: PublicUser, targetUserId: string) {
  if (actor.id === targetUserId) {
    return;
  }
  if (!["PM", "SUPER_ADMIN"].includes(actor.role)) {
    throw new Error("Insufficient permissions to manage schedules for other users.");
  }
}

function validateSlots(slots: WorkScheduleSlot[]): WorkScheduleSlot[] {
  const seen = new Set<number>();
  return slots
    .map((slot) => {
      if (slot.day < 0 || slot.day > 6) {
        throw new Error("day must be between 0 and 6.");
      }
      if (!timePattern.test(slot.start) || !timePattern.test(slot.end)) {
        throw new Error("start and end must be HH:mm in 24-hour format.");
      }
      if (slot.end <= slot.start) {
        throw new Error("end time must be after start time.");
      }
      if (seen.has(slot.day)) {
        throw new Error("Only one slot per day is currently supported.");
      }
      seen.add(slot.day);
      return {
        day: slot.day,
        start: slot.start,
        end: slot.end
      };
    })
    .sort((a, b) => (a.day === b.day ? a.start.localeCompare(b.start) : a.day - b.day));
}

async function getUserByIdOrThrow(userId: string) {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error("User not found.");
  }
  return user;
}
