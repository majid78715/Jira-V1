import { Request, Response, NextFunction } from "express";
import {
  fetchNotifications,
  createNotificationForUser,
  markNotificationAsRead
} from "../services/notification.service";

export async function listNotificationsController(req: Request, res: Response, next: NextFunction) {
  try {
    const notifications = await fetchNotifications(req.currentUser!, req.query);
    res.json({ notifications });
  } catch (error) {
    next(error);
  }
}

export async function createNotificationController(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, message, type, metadata } = req.body ?? {};
    const notification = await createNotificationForUser(req.currentUser!, {
      userId: typeof userId === "string" ? userId : undefined,
      message,
      type,
      metadata
    });
    res.status(201).json({ notification });
  } catch (error) {
    next(error);
  }
}

export async function markNotificationReadController(req: Request, res: Response, next: NextFunction) {
  try {
    const notification = await markNotificationAsRead(req.currentUser!, req.params.id);
    res.json({ notification });
  } catch (error) {
    next(error);
  }
}

