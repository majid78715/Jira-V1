import { Request, Response, NextFunction } from "express";
import { createRole, deleteRole, listRoles } from "../data/repositories";

export async function listRolesController(_req: Request, res: Response, next: NextFunction) {
  try {
    const roles = await listRoles();
    return res.json({ roles });
  } catch (error) {
    return next(error);
  }
}

export async function createRoleController(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, description } = req.body;
    const role = await createRole(name, description);
    return res.json({ role });
  } catch (error) {
    return next(error);
  }
}

export async function deleteRoleController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await deleteRole(id);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}
