import { Request, Response, NextFunction } from "express";
import { fetchAttachments } from "../services/attachment.service";
import { AttachmentEntityType } from "../models/_types";

function parseAttachmentEntityType(value?: string): AttachmentEntityType | undefined {
  if (!value) {
    return undefined;
  }
  const allowed: AttachmentEntityType[] = ["TASK", "TIMESHEET", "PROJECT", "PROFILE"];
  if (allowed.includes(value as AttachmentEntityType)) {
    return value as AttachmentEntityType;
  }
  throw new Error("Invalid attachment entityType.");
}

export async function listAttachmentsController(req: Request, res: Response, next: NextFunction) {
  try {
    const { entityId, entityType } = req.query;
    const attachments = await fetchAttachments(req.currentUser!, {
      entityId: typeof entityId === "string" ? entityId : undefined,
      entityType: parseAttachmentEntityType(typeof entityType === "string" ? entityType : undefined)
    });
    res.json({ attachments });
  } catch (error) {
    next(error);
  }
}
