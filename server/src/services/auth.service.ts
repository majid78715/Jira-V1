import bcrypt from "bcryptjs";
import jwt, { SignOptions, Secret } from "jsonwebtoken";
import {
  getUserByEmail,
  getUserById,
  markInvitationsAcceptedByEmail,
  recordActivity,
  toPublicUser,
  updateUser
} from "../data/repositories";
import { PublicUser, Role } from "../models/_types";
import { DEFAULT_INTERNAL_TEMP_PASSWORD, MIN_PASSWORD_LENGTH } from "./user.service";
import { resolveRoleModules } from "./rolePermission.service";

const JWT_SECRET: Secret = process.env.JWT_SECRET || "local-dev-secret";
const JWT_EXPIRES_IN: SignOptions["expiresIn"] = (process.env.JWT_EXPIRES_IN || "12h") as SignOptions["expiresIn"];

export const AUTH_COOKIE_NAME = "sa_session";

export interface TokenPayload {
  sub: string;
  role: Role;
}

async function withPermittedModules(user: PublicUser): Promise<PublicUser> {
  const permittedModules = await resolveRoleModules(user.role);
  return { ...user, permittedModules };
}
export async function authenticateWithEmail(
  email: string,
  password: string
): Promise<{ user: PublicUser; token: string }> {
  const user = await getUserByEmail(email);
  if (!user || !user.isActive) {
    throw new Error("Invalid credentials.");
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new Error("Invalid credentials.");
  }

  const publicUser = await withPermittedModules(toPublicUser(user));
  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return { user: publicUser, token };
}

export async function authenticateAsUser(userId: string): Promise<{ user: PublicUser; token: string }> {
  const user = await getUserById(userId);
  if (!user || !user.isActive) {
    throw new Error("User not found or inactive.");
  }
  const publicUser = await withPermittedModules(toPublicUser(user));
  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return { user: publicUser, token };
}

export function verifyAuthToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export async function completeFirstLoginPasswordChange(
  userId: string,
  currentPassword: string,
  newPassword: string,
  confirmNewPassword: string
): Promise<PublicUser> {
  if (newPassword !== confirmNewPassword) {
    throw new Error("New passwords do not match.");
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`New password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }

  const user = await getUserById(userId);
  if (!user || !user.isActive) {
    throw new Error("User not found.");
  }
  if (!user.firstLoginRequired) {
    throw new Error("First login password update is already complete.");
  }

  const currentMatches = await bcrypt.compare(currentPassword, user.passwordHash);
  const matchesDefault = currentPassword === DEFAULT_INTERNAL_TEMP_PASSWORD;

  if (!currentMatches || !matchesDefault) {
    throw new Error("Current password is invalid.");
  }

  const updatedUser = await updateUser(user.id, {
    passwordHash: await bcrypt.hash(newPassword, 10),
    firstLoginRequired: false
  });

  await markInvitationsAcceptedByEmail(user.email, user.id);
  await recordActivity(user.id, "FIRST_LOGIN_PASSWORD_CHANGED", "Completed first login password change", {
    userId: user.id
  });

  return await withPermittedModules(updatedUser);
}

export async function changePasswordForUser(
  userId: string,
  currentPassword: string,
  newPassword: string,
  confirmNewPassword: string
): Promise<PublicUser> {
  if (newPassword !== confirmNewPassword) {
    throw new Error("New passwords do not match.");
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`New password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
  const user = await getUserById(userId);
  if (!user || !user.isActive) {
    throw new Error("User not found.");
  }
  const matchesCurrent = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matchesCurrent) {
    throw new Error("Current password is invalid.");
  }
  const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
  if (isSamePassword) {
    throw new Error("New password must be different from the current password.");
  }
  const updatedUser = await updateUser(user.id, {
    passwordHash: await bcrypt.hash(newPassword, 10),
    firstLoginRequired: false
  });
  await recordActivity(user.id, "PASSWORD_CHANGED", "Updated password via settings", { userId: user.id });
  return await withPermittedModules(updatedUser);
}










