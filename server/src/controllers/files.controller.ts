import { Request, Response, NextFunction } from "express";
import { registerAttachment } from "../services/attachment.service";
import { AttachmentEntityType } from "../models/_types";

function normalizeEntityType(value?: string): AttachmentEntityType | undefined {
  if (!value) {
    return undefined;
  }
  const allowed: AttachmentEntityType[] = ["TASK", "TIMESHEET", "PROJECT", "PROFILE"];
  if (allowed.includes(value as AttachmentEntityType)) {
    return value as AttachmentEntityType;
  }
  throw new Error("Invalid entityType.");
}

export async function uploadFileController(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ message: "file is required." });
    }
    const { entityId, entityType } = req.body ?? {};
    const attachment = await registerAttachment(req.currentUser!, {
      entityId: typeof entityId === "string" && entityId.length ? entityId : undefined,
      entityType: normalizeEntityType(typeof entityType === "string" ? entityType : undefined),
      fileName: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: `/uploads/${file.filename}`
    });
    res.status(201).json({ attachment });
  } catch (error) {
    next(error);
  }
}

