import { Request, Response, NextFunction } from "express";
import { clockIn, clockOut, getAttendanceSummary } from "../services/attendance.service";

export async function getAttendanceController(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await getAttendanceSummary(req.currentUser!);
    res.json(summary);
  } catch (error) {
    next(error);
  }
}

export async function clockInController(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await clockIn(req.currentUser!);
    res.status(201).json({ record });
  } catch (error) {
    next(error);
  }
}

export async function clockOutController(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await clockOut(req.currentUser!);
    res.json({ record });
  } catch (error) {
    next(error);
  }
}
