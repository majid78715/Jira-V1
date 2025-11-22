import { NextFunction, Request, Response } from "express";
import { getScheduleForUser, saveScheduleForUser } from "../services/schedule.service";

export async function getUserScheduleController(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = await getScheduleForUser(req.currentUser!, req.params.userId);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function saveUserScheduleController(req: Request, res: Response, next: NextFunction) {
  try {
    const { slots } = req.body ?? {};
    if (!Array.isArray(slots)) {
      return res.status(400).json({ message: "slots array is required." });
    }
    const schedule = await saveScheduleForUser(req.currentUser!, req.params.userId, { slots });
    res.status(201).json({ schedule });
  } catch (error) {
    next(error);
  }
}
