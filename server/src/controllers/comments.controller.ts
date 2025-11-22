import { Request, Response, NextFunction } from "express";
import { addComment, listCommentsForEntity } from "../services/comment.service";
import { CommentEntityType } from "../models/_types";

function parseEntityType(value?: string): CommentEntityType {
  if (value === "TASK" || value === "TIMESHEET") {
    return value;
  }
  throw new Error("Invalid entityType.");
}

export async function listCommentsController(req: Request, res: Response, next: NextFunction) {
  try {
    const { entityId, entityType } = req.query;
    if (typeof entityId !== "string" || !entityId) {
      return res.status(400).json({ message: "entityId is required." });
    }
    if (typeof entityType !== "string") {
      return res.status(400).json({ message: "entityType is required." });
    }
    const comments = await listCommentsForEntity({
      entityId,
      entityType: parseEntityType(entityType)
    });
    res.json({ comments });
  } catch (error) {
    next(error);
  }
}

export async function createCommentController(req: Request, res: Response, next: NextFunction) {
  try {
    const { entityId, entityType, body, attachmentIds } = req.body ?? {};
    if (!entityId || typeof entityId !== "string") {
      return res.status(400).json({ message: "entityId is required." });
    }
    if (!entityType || typeof entityType !== "string") {
      return res.status(400).json({ message: "entityType is required." });
    }
    const comment = await addComment(req.currentUser!, {
      entityId,
      entityType: parseEntityType(entityType),
      body: body ?? "",
      attachmentIds: Array.isArray(attachmentIds) ? attachmentIds : undefined
    });
    res.status(201).json({ comment });
  } catch (error) {
    next(error);
  }
}

