import { Request, Response, NextFunction } from "express";
import { runAutomation } from "../services/automation.service";

export async function runAutomationController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await runAutomation({ actorId: req.currentUser?.id });
    res.json({ result });
  } catch (error) {
    next(error);
  }
}

