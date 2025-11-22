import { NextFunction, Request, Response } from "express";
import {
  createManualTimeEntry,
  listTimeEntriesForUser,
  updateManualTimeEntry
} from "../services/timeEntry.service";

export async function listTimeEntriesController(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    const taskId = typeof req.query.taskId === "string" ? req.query.taskId : undefined;
    const summary = await listTimeEntriesForUser(req.currentUser!, { userId, startDate, endDate, taskId });
    res.json(summary);
  } catch (error) {
    next(error);
  }
}

export async function createTimeEntryController(req: Request, res: Response, next: NextFunction) {
  try {
    const entry = await createManualTimeEntry(req.currentUser!, req.body ?? {});
    res.status(201).json({ entry });
  } catch (error) {
    next(error);
  }
}

export async function updateTimeEntryController(req: Request, res: Response, next: NextFunction) {
  try {
    const entry = await updateManualTimeEntry(req.currentUser!, req.params.id, req.body ?? {});
    res.json({ entry });
  } catch (error) {
    next(error);
  }
}
