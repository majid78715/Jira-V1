import bcrypt from "bcryptjs";
import {
  createUser,
  createUserInvitation,
  deleteUserCascade,
  listUsers,
  recordActivity,
  updateUser,
  NewUserInput,
  UpdateUserInput
} from "../data/repositories";
import { Profile, PublicUser, Role } from "../models/_types";
import { validateProfile } from "../utils/validation";

export const MIN_PASSWORD_LENGTH = 8;
export const DEFAULT_INTERNAL_TEMP_PASSWORD = "12124545";

interface CreateInternalUserInput {
  email: string;
  role: Role;
  profile: Profile;
  companyId?: string;
  createdById: string;
}

interface UpdateInternalUserInput {
  role?: Role;
  isActive?: boolean;
  profile?: Profile;
  companyId?: string;
  email?: string;
}

export async function listInternalUsers(): Promise<PublicUser[]> {
  return listUsers();
}

export async function createInternalUser(input: CreateInternalUserInput): Promise<PublicUser> {
  validateProfile(input.profile);

  const normalizedEmail = input.email.toLowerCase().trim();

  const invitation = await createUserInvitation({
    email: normalizedEmail,
    firstName: input.profile.firstName,
    lastName: input.profile.lastName,
    role: input.role,
    companyId: input.companyId,
    invitedById: input.createdById
  });

  const payload: NewUserInput = {
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(DEFAULT_INTERNAL_TEMP_PASSWORD, 10),
    role: input.role,
    profile: input.profile,
    companyId: input.companyId,
    isActive: true,
    profileStatus: "ACTIVE",
    firstLoginRequired: true
  };

  const user = await createUser(payload);

  await recordActivity(input.createdById, "INTERNAL_USER_CREATED", `Created internal ${user.role}`, {
    userId: user.id,
    invitationId: invitation.id
  });

  return user;
}

export async function updateInternalUser(id: string, input: UpdateInternalUserInput): Promise<PublicUser> {
  const payload: UpdateUserInput = {
    role: input.role,
    isActive: input.isActive,
    profile: input.profile,
    companyId: input.companyId,
    email: input.email
  };
  return updateUser(id, payload);
}

export async function deleteInternalUser(id: string, deletedById: string): Promise<void> {
  await deleteUserCascade(id, deletedById);
  await recordActivity(deletedById, "INTERNAL_USER_DELETED", `Deleted internal user ${id}`, {
    userId: id
  });
}
