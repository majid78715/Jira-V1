import { NextFunction, Request, Response } from "express";
import {
  approveTimesheet as approveTimesheetService,
  generateTimesheet as generateTimesheetService,
  getTimesheetOverview,
  listTimesheetsForApproval,
  rejectTimesheet as rejectTimesheetService,
  submitTimesheet as submitTimesheetService
} from "../services/timesheet.service";

export async function listTimesheetsController(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = (req.query.scope as string) ?? "mine";
    if (scope === "approvals") {
      const queue = await listTimesheetsForApproval(req.currentUser!);
      return res.json(queue);
    }
    const weekStart = typeof req.query.weekStart === "string" ? req.query.weekStart : undefined;
    const overview = await getTimesheetOverview(req.currentUser!, weekStart);
    return res.json(overview);
  } catch (error) {
    next(error);
  }
}

export async function generateTimesheetController(req: Request, res: Response, next: NextFunction) {
  try {
    const weekStart = typeof req.body?.weekStart === "string" ? req.body.weekStart : undefined;
    const result = await generateTimesheetService(req.currentUser!, { weekStart });
    const statusCode = result.created ? 201 : 200;
    res.status(statusCode).json({ timesheet: result.timesheet });
  } catch (error) {
    next(error);
  }
}

export async function submitTimesheetController(req: Request, res: Response, next: NextFunction) {
  try {
    const timesheet = await submitTimesheetService(req.currentUser!, req.params.id);
    res.json({ timesheet });
  } catch (error) {
    next(error);
  }
}

export async function approveTimesheetController(req: Request, res: Response, next: NextFunction) {
  try {
    const timesheet = await approveTimesheetService(req.currentUser!, req.params.id);
    res.json({ timesheet });
  } catch (error) {
    next(error);
  }
}

export async function rejectTimesheetController(req: Request, res: Response, next: NextFunction) {
  try {
    const comment = typeof req.body?.comment === "string" ? req.body.comment : "";
    const timesheet = await rejectTimesheetService(req.currentUser!, req.params.id, comment);
    res.json({ timesheet });
  } catch (error) {
    next(error);
  }
}

