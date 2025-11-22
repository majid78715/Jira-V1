import { NextFunction, Request, Response } from "express";
import {
  approveLeaveRequest,
  createLeaveRequest,
  listLeaveRequests,
  rejectLeaveRequest,
  updateLeaveRequest
} from "../services/dayOff.service";
import { DayOffStatus, LeaveType } from "../models/_types";

export async function listLeaveController(req: Request, res: Response, next: NextFunction) {
  try {
    const scope = (req.query.scope as "mine" | "team" | "vendor" | "org" | undefined) ?? "mine";
    const statuses = parseStatuses(req.query.statuses as string | undefined);
    const leaveTypes = parseLeaveTypes(req.query.types as string | undefined);
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    const payload = await listLeaveRequests(req.currentUser!, { scope, statuses, leaveTypes, userId, startDate, endDate });
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function createLeaveController(req: Request, res: Response, next: NextFunction) {
  try {
    const request = await createLeaveRequest(req.currentUser!, req.body ?? {});
    res.status(201).json({ request });
  } catch (error) {
    next(error);
  }
}

export async function updateLeaveController(req: Request, res: Response, next: NextFunction) {
  try {
    const request = await updateLeaveRequest(req.currentUser!, req.params.id, req.body ?? {});
    res.json({ request });
  } catch (error) {
    next(error);
  }
}

export async function approveLeaveController(req: Request, res: Response, next: NextFunction) {
  try {
    const { comment } = req.body ?? {};
    const request = await approveLeaveRequest(req.currentUser!, req.params.id, comment);
    res.json({ request });
  } catch (error) {
    next(error);
  }
}

export async function rejectLeaveController(req: Request, res: Response, next: NextFunction) {
  try {
    const comment = typeof req.body?.comment === "string" ? req.body.comment : "";
    const request = await rejectLeaveRequest(req.currentUser!, req.params.id, comment);
    res.json({ request });
  } catch (error) {
    next(error);
  }
}

function parseStatuses(input?: string): DayOffStatus[] | undefined {
  if (!input) {
    return undefined;
  }
  const allowed: DayOffStatus[] = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"];
  const statuses = input
    .split(",")
    .map((value) => value.trim().toUpperCase() as DayOffStatus)
    .filter((status) => allowed.includes(status));
  return statuses.length ? statuses : undefined;
}

function parseLeaveTypes(input?: string): LeaveType[] | undefined {
  if (!input) {
    return undefined;
  }
  const allowed: LeaveType[] = ["ANNUAL", "SICK", "UNPAID", "EMERGENCY", "OTHER"];
  const types = input
    .split(",")
    .map((value) => value.trim().toUpperCase() as LeaveType)
    .filter((type) => allowed.includes(type));
  return types.length ? types : undefined;
}
