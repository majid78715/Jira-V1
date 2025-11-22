import { NextFunction, Request, Response } from "express";
import { WorkflowActionType } from "../models/_types";
import { performTaskWorkflowAction } from "../services/taskWorkflow.service";

const allowedActions: WorkflowActionType[] = ["APPROVE", "REJECT", "SEND_BACK", "REQUEST_CHANGE"];

export async function performTaskWorkflowActionController(req: Request, res: Response, next: NextFunction) {
  try {
    const { action, comment } = req.body as { action: WorkflowActionType; comment?: string };
    if (!action || !allowedActions.includes(action)) {
      return res.status(400).json({ message: "Invalid workflow action." });
    }
    const workflow = await performTaskWorkflowAction(req.params.taskId, req.currentUser!, { action, comment });
    res.json({ workflow });
  } catch (error) {
    next(error);
  }
}
