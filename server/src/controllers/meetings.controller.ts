import { Request, Response, NextFunction } from "express";
import {
  createMeetingService,
  deleteMeetingService,
  getMeetingService,
  listMeetingsService,
  updateMeetingService,
  suggestMeetingTimesService
} from "../services/meetings.service";

export async function listMeetingsController(req: Request, res: Response, next: NextFunction) {
  try {
    const meetings = await listMeetingsService(req.currentUser!, req.query);
    res.json(meetings);
  } catch (error) {
    next(error);
  }
}

export async function getMeetingController(req: Request, res: Response, next: NextFunction) {
  try {
    const meeting = await getMeetingService(req.currentUser!, req.params.id);
    res.json(meeting);
  } catch (error) {
    next(error);
  }
}

export async function createMeetingController(req: Request, res: Response, next: NextFunction) {
  try {
    const meeting = await createMeetingService(req.currentUser!, req.body);
    res.status(201).json(meeting);
  } catch (error) {
    next(error);
  }
}

export async function updateMeetingController(req: Request, res: Response, next: NextFunction) {
  try {
    const meeting = await updateMeetingService(req.currentUser!, req.params.id, req.body);
    res.json(meeting);
  } catch (error) {
    next(error);
  }
}

export async function deleteMeetingController(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteMeetingService(req.currentUser!, req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function suggestMeetingTimesController(req: Request, res: Response, next: NextFunction) {
  try {
    const { participantIds, durationMinutes } = req.body;
    const suggestions = await suggestMeetingTimesService(req.currentUser!, participantIds, durationMinutes);
    res.json({ suggestions });
  } catch (error) {
    next(error);
  }
}
