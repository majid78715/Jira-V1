import { Request, Response, NextFunction } from "express";
import { createInternalUser, deleteInternalUser, listInternalUsers, updateInternalUser } from "../services/user.service";
import { Role } from "../models/_types";

export async function listAdminUsersController(_req: Request, res: Response, next: NextFunction) {
  try {
    const users = await listInternalUsers();
    res.json({ users });
  } catch (error) {
    next(error);
  }
}

export async function createAdminUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, role, profile, companyId } = req.body;
    if (!email || !role || !profile) {
      return res.status(400).json({ message: "email, role, and profile are required." });
    }
    if (!isAllowedRole(role)) {
      return res.status(400).json({ message: "Invalid role." });
    }
    if (!req.currentUser) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const user = await createInternalUser({
      email,
      role,
      profile,
      companyId,
      createdById: req.currentUser.id
    });
    res.status(201).json({ user });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function patchAdminUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { role, isActive, profile, companyId, email } = req.body;
    if (role && !isAllowedRole(role)) {
      return res.status(400).json({ message: "Invalid role." });
    }
    const user = await updateInternalUser(id, { role, isActive, profile, companyId, email });
    res.json({ user });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function deleteAdminUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    if (!req.currentUser) {
      return res.status(401).json({ message: "Authentication required." });
    }
    if (req.currentUser.id === id) {
      return res.status(400).json({ message: "You cannot delete your own account." });
    }
    await deleteInternalUser(id, req.currentUser.id);
    res.status(204).send();
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

const allowedRoles: Role[] = ["SUPER_ADMIN", "VP", "PM", "ENGINEER", "PROJECT_MANAGER", "DEVELOPER", "VIEWER"];

function isAllowedRole(role: string): role is Role {
  return allowedRoles.includes(role as Role);
}

function handleKnownError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof Error) {
    const message = error.message;
    const status = message.toLowerCase().includes("not found") ? 404 : 400;
    return res.status(status).json({ message });
  }
  return next(error);
}
