import { Request, Response, NextFunction } from "express";
import { PermissionModule, Role } from "../models/_types";
import { listRolePermissionsWithDefaults, updateRolePermissions } from "../services/rolePermission.service";

export async function listRolePermissionsController(_req: Request, res: Response, next: NextFunction) {
  try {
    const rolePermissions = await listRolePermissionsWithDefaults();
    return res.json({ rolePermissions });
  } catch (error) {
    return next(error);
  }
}

export async function updateRolePermissionController(req: Request, res: Response, next: NextFunction) {
  try {
    const { role, modules } = req.body as { role: Role; modules: PermissionModule[] };
    const rolePermission = await updateRolePermissions(role, modules);
    return res.json({ rolePermission });
  } catch (error) {
    return next(error);
  }
}

