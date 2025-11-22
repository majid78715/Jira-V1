import {
  getUserById,
  getUserPreferencesByUserId,
  recordActivity,
  upsertUserPreferences
} from "../data/repositories";
import { HttpError } from "../middleware/httpError";
import {
  PublicUser,
  User,
  UserPreferences
} from "../models/_types";

const timePattern = /^([0-1]\d|2[0-3]):[0-5]\d$/;

const DEFAULT_PREFERENCES = {
  notificationPreferences: {
    dailyDigestEmail: true,
    taskAssignmentEmail: true,
    commentMentionEmail: true,
    timesheetReminderEmail: true,
    alertEscalationsEmail: true
  },
  workflowPreferences: {
    autoSubscribeOnAssignment: true,
    autoShareStatusWithTeam: true,
    autoCaptureFocusBlocks: false
  },
  availabilityPreferences: {
    meetingHoursStart: "09:00",
    meetingHoursEnd: "17:00",
    shareCalendarWithTeam: true,
    protectFocusTime: false
  }
} as const;

export type UserPreferencesPayload = {
  notificationPreferences?: Partial<UserPreferences["notificationPreferences"]>;
  workflowPreferences?: Partial<UserPreferences["workflowPreferences"]>;
  availabilityPreferences?: Partial<UserPreferences["availabilityPreferences"]>;
};

export async function getUserPreferencesForUser(actor: PublicUser, targetUserId: string): Promise<UserPreferences> {
  const target = await getUserByIdOrThrow(targetUserId);
  ensurePreferencesAccess(actor, target);
  return ensurePreferencesRecord(target);
}

export async function updateUserPreferencesForUser(
  actor: PublicUser,
  targetUserId: string,
  payload: UserPreferencesPayload
): Promise<UserPreferences> {
  const target = await getUserByIdOrThrow(targetUserId);
  ensurePreferencesAccess(actor, target);
  const current = await ensurePreferencesRecord(target);
  const notificationPreferences = normalizeBooleanSection(
    current.notificationPreferences as unknown as Record<string, boolean>,
    payload.notificationPreferences as unknown as Partial<Record<string, boolean>>
  ) as unknown as UserPreferences["notificationPreferences"];
  const workflowPreferences = normalizeBooleanSection(
    current.workflowPreferences as unknown as Record<string, boolean>,
    payload.workflowPreferences as unknown as Partial<Record<string, boolean>>
  ) as unknown as UserPreferences["workflowPreferences"];
  const availabilityPreferences = normalizeAvailabilitySection(current.availabilityPreferences, payload.availabilityPreferences);
  const updated = await upsertUserPreferences({
    userId: target.id,
    notificationPreferences,
    workflowPreferences,
    availabilityPreferences
  });
  await recordActivity(
    actor.id,
    "USER_PREFERENCES_UPDATED",
    actor.id === target.id
      ? "Updated personal settings"
      : `Updated settings for ${target.profile.firstName} ${target.profile.lastName}`,
    {
      targetUserId: target.id,
      sections: determineChangedSections(current, updated)
    },
    target.id,
    "PROFILE"
  );
  return updated;
}

function determineChangedSections(previous: UserPreferences, next: UserPreferences): string[] {
  const changes: string[] = [];
  if (JSON.stringify(previous.notificationPreferences) !== JSON.stringify(next.notificationPreferences)) {
    changes.push("notificationPreferences");
  }
  if (JSON.stringify(previous.workflowPreferences) !== JSON.stringify(next.workflowPreferences)) {
    changes.push("workflowPreferences");
  }
  if (JSON.stringify(previous.availabilityPreferences) !== JSON.stringify(next.availabilityPreferences)) {
    changes.push("availabilityPreferences");
  }
  return changes;
}

function ensurePreferencesAccess(actor: PublicUser, target: User) {
  if (actor.id === target.id) {
    return;
  }
  if (
    ["SUPER_ADMIN", "PM"].includes(actor.role) &&
    actor.companyId &&
    target.companyId &&
    actor.companyId === target.companyId
  ) {
    return;
  }
  throw new HttpError(403, "Insufficient permissions to manage preferences for this user.");
}

function normalizeBooleanSection<TSection extends Record<string, boolean>>(
  current: TSection,
  updates?: Partial<TSection>
): TSection {
  if (!updates) {
    return { ...current };
  }
  return Object.keys(current).reduce((acc, key) => {
    const typedKey = key as keyof TSection;
    const value = updates[typedKey];
    // @ts-ignore
    acc[typedKey] = typeof value === "boolean" ? value : current[typedKey];
    return acc;
  }, {} as TSection);
}

function normalizeAvailabilitySection(
  current: UserPreferences["availabilityPreferences"],
  updates?: Partial<UserPreferences["availabilityPreferences"]>
): UserPreferences["availabilityPreferences"] {
  const start = updates?.meetingHoursStart ?? current.meetingHoursStart;
  const end = updates?.meetingHoursEnd ?? current.meetingHoursEnd;
  if (!timePattern.test(start) || !timePattern.test(end)) {
    throw new HttpError(400, "Meeting hours must be in HH:mm (24h) format.");
  }
  if (end <= start) {
    throw new HttpError(400, "Meeting hours end must be after the start time.");
  }
  return {
    meetingHoursStart: start,
    meetingHoursEnd: end,
    shareCalendarWithTeam:
      typeof updates?.shareCalendarWithTeam === "boolean"
        ? updates.shareCalendarWithTeam
        : current.shareCalendarWithTeam,
    protectFocusTime:
      typeof updates?.protectFocusTime === "boolean" ? updates.protectFocusTime : current.protectFocusTime
  };
}

async function ensurePreferencesRecord(user: User): Promise<UserPreferences> {
  const existing = await getUserPreferencesByUserId(user.id);
  if (existing) {
    return existing;
  }
  return upsertUserPreferences({
    userId: user.id,
    notificationPreferences: { ...DEFAULT_PREFERENCES.notificationPreferences },
    workflowPreferences: { ...DEFAULT_PREFERENCES.workflowPreferences },
    availabilityPreferences: { ...DEFAULT_PREFERENCES.availabilityPreferences }
  });
}

async function getUserByIdOrThrow(id: string): Promise<User> {
  const user = await getUserById(id);
  if (!user) {
    throw new HttpError(404, "User not found.");
  }
  return user;
}
