import bcrypt from "bcryptjs";
import {
  createUserInvitation,
  createUser,
  getInvitationByToken,
  getCompanyById,
  getInvitationById,
  getUserByEmail,
  getUserById,
  listUsersByRole,
  markInvitationAccepted,
  markInvitationCancelled,
  recordActivity,
  sendNotifications
} from "../data/repositories";
import { PublicInvitation, PublicUser, Role } from "../models/_types";
import { MIN_PASSWORD_LENGTH } from "./user.service";
import { validateProfile } from "../utils/validation";
import { NewUserInput } from "../data/repositories";

interface InviteProjectManagerPayload {
  email: string;
  firstName: string;
  lastName: string;
  companyId: string;
  invitedById: string;
}

interface InviteDeveloperPayload {
  email: string;
  firstName: string;
  lastName: string;
  invitedById: string;
  companyId: string;
}

interface InviteProductManagerPayload {
  email: string;
  firstName: string;
  lastName: string;
  companyId: string;
  invitedById: string;
  vpUserId?: string;
  preferredCompanyIds?: string[];
}

interface AcceptInvitationPayload {
  token: string;
  password: string;
  profile: {
    firstName: string;
    lastName: string;
    mobileNumber: string;
    country: string;
    city: string;
    timeZone: string;
    title: string;
  };
}

interface CancelInvitationPayload {
  invitationId: string;
  actorId: string;
  actorRole: Role;
}

export async function inviteProjectManager(payload: InviteProjectManagerPayload): Promise<PublicInvitation> {
  const company = await getCompanyById(payload.companyId);
  if (!company) {
    throw new Error("Company not found.");
  }

  const invitation = await createUserInvitation({
    email: payload.email,
    firstName: payload.firstName,
    lastName: payload.lastName,
    role: "PROJECT_MANAGER",
    companyId: payload.companyId,
    invitedById: payload.invitedById
  });

  await sendNotifications(
    [payload.invitedById],
    `Invitation sent to ${invitation.email}`,
    "INVITATION_SENT",
    {
      invitationId: invitation.id
    }
  );

  return invitation;
}

export async function inviteDeveloper(payload: InviteDeveloperPayload): Promise<{ invitation: PublicInvitation; user: PublicUser; tempPassword: string }> {
  if (!payload.companyId) {
    throw new Error("Project manager is not associated with a company.");
  }

  // Check if user already exists
  const existingUser = await getUserByEmail(payload.email);
  if (existingUser) {
    throw new Error("A user with this email already exists.");
  }

  // Generate temporary password
  const { DEFAULT_INTERNAL_TEMP_PASSWORD } = await import("./user.service");
  const tempPassword = DEFAULT_INTERNAL_TEMP_PASSWORD;

  // Create user directly with temp password
  const newUserInput: NewUserInput = {
    email: payload.email.toLowerCase(),
    passwordHash: await bcrypt.hash(tempPassword, 10),
    role: "DEVELOPER",
    profile: {
      firstName: payload.firstName,
      lastName: payload.lastName,
      mobileNumber: "+10000000000",
      country: "US",
      city: "TBD",
      timeZone: "UTC",
      title: "Developer"
    },
    companyId: payload.companyId,
    isActive: true,
    profileStatus: "ACTIVE",
    firstLoginRequired: true
  };

  const user = await createUser(newUserInput);

  // Cancel any existing pending invitations for this email first
  const { listUserInvitations } = await import("../data/repositories");
  const existingInvitations = await listUserInvitations({ email: payload.email });
  for (const inv of existingInvitations) {
    if (inv.status === "SENT") {
      await markInvitationAccepted(inv.id, user.id);
    }
  }

  const invitation = await createUserInvitation({
    email: payload.email,
    firstName: payload.firstName,
    lastName: payload.lastName,
    role: "DEVELOPER",
    companyId: payload.companyId,
    invitedById: payload.invitedById
  });

  await markInvitationAccepted(invitation.id, user.id);

  await recordActivity(payload.invitedById, "INTERNAL_USER_CREATED", `Created Developer ${user.email}`, {
    userId: user.id,
    invitationId: invitation.id
  });

  await sendNotifications(
    [payload.invitedById],
    `Developer ${user.email} created with temporary password`,
    "INVITATION_SENT",
    { invitationId: invitation.id, userId: user.id }
  );

  return { invitation, user, tempPassword };
}

export async function inviteProductManager(payload: InviteProductManagerPayload): Promise<{ invitation: PublicInvitation; user: PublicUser; tempPassword: string }> {
  const company = await getCompanyById(payload.companyId);
  if (!company) {
    throw new Error("Company not found.");
  }

  if (payload.vpUserId) {
    await assertVpUser(payload.vpUserId);
  }

  const preferredCompanyIds = await resolvePreferredCompanyIds(payload.preferredCompanyIds);

  // Check if user already exists
  const existingUser = await getUserByEmail(payload.email);
  if (existingUser) {
    throw new Error("A user with this email already exists.");
  }

  // Generate temporary password
  const { DEFAULT_INTERNAL_TEMP_PASSWORD } = await import("./user.service");
  const tempPassword = DEFAULT_INTERNAL_TEMP_PASSWORD;

  // Create user directly with temp password
  const newUserInput: NewUserInput = {
    email: payload.email.toLowerCase(),
    passwordHash: await bcrypt.hash(tempPassword, 10),
    role: "PM",
    profile: {
      firstName: payload.firstName,
      lastName: payload.lastName,
      mobileNumber: "+10000000000",
      country: "US",
      city: "TBD",
      timeZone: "UTC",
      title: "Product Manager"
    },
    companyId: payload.companyId,
    isActive: true,
    profileStatus: "ACTIVE",
    firstLoginRequired: true,
    vpUserId: payload.vpUserId,
    preferences: preferredCompanyIds
      ? {
          savedDashboardViews: [],
          preferredCompanyIds
        }
      : undefined
  };

  const user = await createUser(newUserInput);

  // Create invitation record for tracking (marked as accepted immediately)
  // Cancel any existing pending invitations for this email first
  const { listUserInvitations } = await import("../data/repositories");
  const existingInvitations = await listUserInvitations({ email: payload.email });
  for (const inv of existingInvitations) {
    if (inv.status === "SENT") {
      await markInvitationAccepted(inv.id, user.id);
    }
  }

  const invitation = await createUserInvitation({
    email: payload.email,
    firstName: payload.firstName,
    lastName: payload.lastName,
    role: "PM",
    companyId: payload.companyId,
    invitedById: payload.invitedById
  });

  await markInvitationAccepted(invitation.id, user.id);

  await recordActivity(payload.invitedById, "INTERNAL_USER_CREATED", `Created Product Manager ${user.email}`, {
    userId: user.id,
    invitationId: invitation.id
  });

  await sendNotifications(
    [payload.invitedById],
    `Product Manager ${user.email} created with temporary password`,
    "INVITATION_SENT",
    {
      invitationId: invitation.id,
      userId: user.id
    }
  );

  return { invitation, user, tempPassword };
}

export async function acceptInvitation(payload: AcceptInvitationPayload): Promise<PublicUser> {
  if (!payload.password || payload.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }

  const invitation = await getInvitationByToken(payload.token);
  if (!invitation || invitation.status !== "SENT") {
    throw new Error("Invalid or expired invitation token.");
  }

  validateProfile(payload.profile);

  const newUserInput: NewUserInput = {
    email: invitation.email,
    passwordHash: await bcrypt.hash(payload.password, 10),
    role: invitation.role,
    profile: payload.profile,
    companyId: invitation.companyId,
    isActive: false,
    profileStatus: "PENDING_APPROVAL",
    profileComment: "Awaiting PM approval"
  };

  const user = await createUser(newUserInput);
  await markInvitationAccepted(invitation.id, user.id);

  await recordActivity(user.id, "INVITATION_ACCEPTED", "Accepted invitation and awaiting approval", {
    invitationId: invitation.id
  });

  const pmUsers = await listUsersByRole("PM", invitation.companyId);
  const notifyUserIds = Array.from(new Set([...pmUsers.map((pm) => pm.id), invitation.invitedById].filter(Boolean)));
  await sendNotifications(
    notifyUserIds,
    `${user.profile.firstName} ${user.profile.lastName} accepted an invitation`,
    "INVITATION_ACCEPTED",
    { userId: user.id }
  );

  return user;
}

export async function cancelInvitation(payload: CancelInvitationPayload): Promise<PublicInvitation> {
  const invitation = await getInvitationById(payload.invitationId);
  if (!invitation) {
    throw new Error("Invitation not found.");
  }
  if (invitation.status !== "SENT") {
    throw new Error("Only pending invitations can be cancelled.");
  }

  const isOwner = invitation.invitedById === payload.actorId;
  const isSuperAdmin = payload.actorRole === "SUPER_ADMIN";
  if (!isOwner && !isSuperAdmin) {
    throw new Error("You do not have permission to cancel this invitation.");
  }

  const cancelled = await markInvitationCancelled(invitation.id);

  await recordActivity(payload.actorId, "INVITE_CANCELLED", `Cancelled invitation for ${invitation.email}`, {
    invitationId: invitation.id,
    role: invitation.role
  });

  await sendNotifications(
    [invitation.invitedById],
    `Invitation to ${invitation.email} was cancelled`,
    "INVITATION_CANCELLED",
    { invitationId: invitation.id }
  );

  return cancelled;
}

async function assertVpUser(userId: string) {
  const user = await getUserById(userId);
  if (!user || user.role !== "VP") {
    throw new Error("Assigned VP not found.");
  }
}

async function resolvePreferredCompanyIds(ids?: string[]): Promise<string[] | undefined> {
  if (!ids) {
    return undefined;
  }
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)));
  await Promise.all(
    unique.map(async (id) => {
      const company = await getCompanyById(id);
      if (!company) {
        throw new Error("Preferred company not found.");
      }
    })
  );
  return unique;
}
