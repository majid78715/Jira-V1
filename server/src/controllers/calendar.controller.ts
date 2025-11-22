import { Request, Response, NextFunction } from "express";
import {
  CalendarScope,
  exportUserCalendarICS,
  getProjectCalendar,
  getUserCalendar
} from "../services/calendar.service";

function resolveScope(request: Request): CalendarScope {
  return request.query.scope === "team" ? "team" : "user";
}

export async function getUserCalendarController(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = resolveScope(req);
    const payload = await getUserCalendar(req.currentUser!, req.params.userId, { scope });
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function getProjectCalendarController(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = await getProjectCalendar(req.currentUser!, req.params.projectId);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function exportUserCalendarICSController(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = resolveScope(req);
    const { filename, content } = await exportUserCalendarICS(req.currentUser!, req.params.userId, { scope });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    next(error);
  }
}
