import { Request, Response, NextFunction } from "express";
import {
  cancelAssignment,
  listAssignmentsForUser,
  requestAssignment,
  approveTaskCompletion
} from "../services/assignment.service";
import { AssignmentStatus } from "../models/_types";

const assignmentStatuses: AssignmentStatus[] = ["PENDING", "APPROVED", "CANCELLED", "COMPLETED", "SUBMITTED"];

export async function listAssignmentsController(req: Request, res: Response, next: NextFunction) {
  try {
    const statusQuery = req.query.status as string | undefined;
    const scope = (req.query.scope as "my" | "pending" | "all" | undefined) ?? "all";
    let status: AssignmentStatus | undefined;
    if (statusQuery) {
      if (!assignmentStatuses.includes(statusQuery as AssignmentStatus)) {
        return res.status(400).json({ message: "Invalid status filter." });
      }
      status = statusQuery as AssignmentStatus;
    }
    const taskId = req.query.taskId as string | undefined;
    const payload = await listAssignmentsForUser(req.currentUser!, { status, scope, taskId });
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function createAssignmentController(req: Request, res: Response, next: NextFunction) {
  try {
    const { taskId, developerId, note } = req.body;
    if (!taskId || !developerId) {
      return res.status(400).json({ message: "taskId and developerId are required." });
    }
    const assignment = await requestAssignment(req.currentUser!, { taskId, developerId, note });
    res.status(201).json({ assignment });
  } catch (error) {
    next(error);
  }
}

export async function cancelAssignmentController(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = req.body ?? {};
    const assignment = await cancelAssignment(req.params.id, req.currentUser!, reason);
    res.json({ assignment });
  } catch (error) {
    next(error);
  }
}

export async function approveCompletionController(req: Request, res: Response, next: NextFunction) {
  try {
    const assignment = await approveTaskCompletion(req.params.id, req.currentUser!);
    res.json({ assignment });
  } catch (error) {
    next(error);
  }
}
