import { NextFunction, Request, Response } from "express";
import {
  getChatSessionTranscript,
  listUserChatSessions,
  sendChatMessageForUser
} from "../services/aiChat.service";

export async function listChatSessionsController(req: Request, res: Response, next: NextFunction) {
  try {
    const sessions = await listUserChatSessions(req.currentUser!);
    res.json({ sessions });
  } catch (error) {
    next(error);
  }
}

export async function getChatSessionController(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const result = await getChatSessionTranscript(req.currentUser!, sessionId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function sendChatMessageController(req: Request, res: Response, next: NextFunction) {
  try {
    const { message, sessionId } = req.body ?? {};
    const contextChips = parseContextChips(req.body?.contextChips);
    const result = await sendChatMessageForUser(req.currentUser!, {
      message,
      sessionId,
      contextChips
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

function parseContextChips(payload: unknown): string[] | undefined {
  if (!Array.isArray(payload)) {
    return undefined;
  }
  return payload
    .map((chip) => (typeof chip === "string" ? chip : String(chip)))
    .map((chip) => chip.trim())
    .filter((chip) => chip.length > 0);
}
