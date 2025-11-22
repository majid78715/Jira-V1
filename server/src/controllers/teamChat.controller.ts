import { NextFunction, Request, Response } from "express";
import {
  createTeamChatRoomForUser,
  deleteTeamChatRoomForUser,
  ensureDirectTeamChatRoomForUser,
  getTeamChatMessagesForRoom,
  listTeamChatRoomsForUser,
  postTeamChatMessage
} from "../services/teamChat.service";

export async function listTeamChatRoomsController(req: Request, res: Response, next: NextFunction) {
  try {
    const rooms = await listTeamChatRoomsForUser(req.currentUser!);
    res.json({ rooms });
  } catch (error) {
    next(error);
  }
}

export async function getTeamChatMessagesController(req: Request, res: Response, next: NextFunction) {
  try {
    const { roomId } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await getTeamChatMessagesForRoom(req.currentUser!, roomId, limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function createTeamChatMessageController(req: Request, res: Response, next: NextFunction) {
  try {
    const { roomId } = req.params;
    const { body, mentions } = req.body ?? {};
    const message = await postTeamChatMessage(req.currentUser!, roomId, body, mentions);
    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
}

export async function createTeamChatRoomController(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, description, topic } = req.body ?? {};
    const room = await createTeamChatRoomForUser(req.currentUser!, { name, description, topic });
    res.status(201).json({ room });
  } catch (error) {
    next(error);
  }
}

export async function ensureDirectTeamChatRoomController(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;
    const room = await ensureDirectTeamChatRoomForUser(req.currentUser!, userId);
    res.json({ room });
  } catch (error) {
    next(error);
  }
}

export async function deleteTeamChatRoomController(req: Request, res: Response, next: NextFunction) {
  try {
    const { roomId } = req.params;
    await deleteTeamChatRoomForUser(req.currentUser!, roomId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
