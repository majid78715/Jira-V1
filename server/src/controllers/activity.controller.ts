import { Request, Response, NextFunction } from "express";
import { fetchActivity } from "../services/activity.service";

export async function listActivityController(req: Request, res: Response, next: NextFunction) {
  try {
    const logs = await fetchActivity(req.query);
    res.json({ activity: logs });
  } catch (error) {
    next(error);
  }
}

