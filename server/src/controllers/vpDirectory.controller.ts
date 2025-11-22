import { NextFunction, Request, Response } from "express";
import { listUsersByRole } from "../data/repositories";

export async function listVpDirectoryController(_req: Request, res: Response, next: NextFunction) {
  try {
    const users = await listUsersByRole("VP");
    res.json({ users });
  } catch (error) {
    next(error);
  }
}
