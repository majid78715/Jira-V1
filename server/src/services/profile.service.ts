import {
  createProfileChangeRequest,
  getProfileChangeRequestById,
  getUserById,
  listUsersByRole,
  recordActivity,
  sendNotifications,
  updateProfileChangeRequest,
  updateUser
} from "../data/repositories";
import { Profile, PublicProfileChangeRequest, PublicUser } from "../models/_types";
import { validateProfile } from "../utils/validation";
import { nowISO } from "../utils/date";
import { HttpError } from "../middleware/httpError";

export async function approveUserProfile(userId: string, approverId: string, comment?: string): Promise<PublicUser> {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error("User not found.");
  }
  const updated = await updateUser(userId, {
    isActive: true,
    profileStatus: "ACTIVE",
    profileComment: comment
  });
  await recordActivity(approverId, "PROFILE_APPROVED", `Approved profile for ${updated.email}`, { userId });
  await sendNotifications([userId], "Your profile has been approved.", "PROFILE_APPROVED", { comment });
  return updated;
}

export async function rejectUserProfile(userId: string, approverId: string, comment?: string): Promise<PublicUser> {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error("User not found.");
  }
  const updated = await updateUser(userId, {
    isActive: false,
    profileStatus: "REJECTED",
    profileComment: comment
  });
  await recordActivity(approverId, "PROFILE_REJECTED", `Rejected profile for ${updated.email}`, { userId });
  await sendNotifications([userId], "Your profile update was rejected.", "PROFILE_REJECTED", { comment });
  return updated;
}

export async function submitProfileChangeRequest(userId: string, profile: Profile): Promise<PublicProfileChangeRequest> {
  validateProfile(profile);
  const request = await createProfileChangeRequest({
    userId,
    requestedById: userId,
    profile
  });
  const pms = await listUsersByRole("PM");
  await sendNotifications(
    pms.map((pm) => pm.id),
    "Profile change request submitted.",
    "PROFILE_CHANGE_REQUEST",
    { requestId: request.id }
  );
  return request;
}

export async function approveProfileChangeRequest(
  requestId: string,
  approverId: string,
  comment?: string
): Promise<PublicProfileChangeRequest> {
  const request = await getProfileChangeRequestById(requestId);
  if (!request || request.status !== "PENDING") {
    throw new Error("Profile change request not found or already processed.");
  }

  await updateUser(request.userId, {
    profile: request.profile,
    profileStatus: "ACTIVE",
    profileComment: comment,
    isActive: true
  });

  const updated = await updateProfileChangeRequest(request.id, {
    status: "APPROVED",
    reviewedById: approverId,
    reviewedAt: nowISO(),
    decisionComment: comment
  });

  await recordActivity(approverId, "PROFILE_CHANGE_APPROVED", "Approved profile change request", {
    requestId
  });
  await sendNotifications([request.userId], "Profile change request approved.", "PROFILE_CHANGE_APPROVED", {
    comment,
    requestId
  });
  return updated;
}

export async function rejectProfileChangeRequest(
  requestId: string,
  approverId: string,
  comment?: string
): Promise<PublicProfileChangeRequest> {
  const request = await getProfileChangeRequestById(requestId);
  if (!request || request.status !== "PENDING") {
    throw new Error("Profile change request not found or already processed.");
  }

  const updated = await updateProfileChangeRequest(request.id, {
    status: "REJECTED",
    reviewedById: approverId,
    reviewedAt: nowISO(),
    decisionComment: comment
  });

  await recordActivity(approverId, "PROFILE_CHANGE_REJECTED", "Rejected profile change request", {
    requestId
  });
  await sendNotifications([request.userId], "Profile change request rejected.", "PROFILE_CHANGE_REJECTED", {
    comment,
    requestId
  });
  return updated;
}

const DIRECT_UPDATE_ROLES = new Set<PublicUser["role"]>(["SUPER_ADMIN", "PM", "VP"]);

export async function updateProfileDirectly(actor: PublicUser, profile: Profile): Promise<PublicUser> {
  if (!DIRECT_UPDATE_ROLES.has(actor.role)) {
    throw new HttpError(403, "Insufficient permissions to update profile directly.");
  }
  validateProfile(profile);
  const updated = await updateUser(actor.id, { profile });
  await recordActivity(actor.id, "PROFILE_SELF_UPDATED", "Updated own profile", { userId: actor.id });
  return updated;
}
