import { Request, Response, NextFunction } from "express";
import { addTaskComment, bulkUpdateTasks, getTaskDetail, updateTaskRecord, deleteTask, bulkDeleteTasks, createSubtask } from "../services/task.service";
import { finalApproveTaskAndStart, submitTaskEstimate } from "../services/taskWorkflow.service";

export async function getTaskDetailController(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = await getTaskDetail(req.params.taskId);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function updateTaskController(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      title,
      description,
      budgetHours,
      requiredSkills,
      acceptanceCriteria,
      dueDate,
      plannedStartDate,
      status,
      taskType,
      priority,
      assigneeUserId,
      reporterUserId,
      isVendorTask,
      vendorId,
      estimateStoryPoints,
      dependencyTaskIds,
      linkedIssueIds,
      epicId,
      component,
      environment
    } = req.body ?? {};
    const task = await updateTaskRecord(
      req.params.taskId,
      {
        title,
        description,
        budgetHours,
        requiredSkills,
        acceptanceCriteria,
        dueDate,
        plannedStartDate,
        status,
        taskType,
        priority,
        assigneeUserId,
        reporterUserId,
        isVendorTask,
        vendorId,
        estimateStoryPoints,
        dependencyTaskIds,
        linkedIssueIds,
        epicId,
        component,
        environment
      },
      req.currentUser!
    );
    res.json({ task });
  } catch (error) {
    next(error);
  }
}

export async function bulkUpdateTasksController(req: Request, res: Response, next: NextFunction) {
  try {
    const { taskIds, status, assigneeUserId, vendorId } = req.body ?? {};
    const tasks = await bulkUpdateTasks(req.currentUser!, taskIds ?? [], { status, assigneeUserId, vendorId });
    res.json({ tasks });
  } catch (error) {
    next(error);
  }
}

export async function addTaskCommentController(req: Request, res: Response, next: NextFunction) {
  try {
    const { body, attachmentIds } = req.body ?? {};
    if (!body) {
      return res.status(400).json({ message: "body is required." });
    }
    const comment = await addTaskComment(
      req.params.taskId,
      req.currentUser!,
      body,
      Array.isArray(attachmentIds) ? attachmentIds : undefined
    );
    res.status(201).json({ comment });
  } catch (error) {
    next(error);
  }
}

export async function submitTaskEstimateController(req: Request, res: Response, next: NextFunction) {
  try {
    const { quantity, unit, notes, confidence } = req.body ?? {};
    if (quantity === undefined || !unit) {
      return res.status(400).json({ message: "quantity and unit are required." });
    }
    const payload = await submitTaskEstimate(req.params.taskId, req.currentUser!, {
      quantity: Number(quantity),
      unit,
      notes,
      confidence
    });
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
}

export async function finalApproveTaskController(req: Request, res: Response, next: NextFunction) {
  try {
    const { plannedStartDate, note } = req.body ?? {};
    if (!plannedStartDate) {
      return res.status(400).json({ message: "plannedStartDate is required." });
    }
    const payload = await finalApproveTaskAndStart(req.params.taskId, req.currentUser!, {
      plannedStartDate,
      note
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function deleteTaskController(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteTask(req.params.taskId, req.currentUser!);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function bulkDeleteTasksController(req: Request, res: Response, next: NextFunction) {
  try {
    const { taskIds } = req.body ?? {};
    if (!Array.isArray(taskIds) || !taskIds.length) {
      return res.status(400).json({ message: "taskIds array is required." });
    }
    await bulkDeleteTasks(req.currentUser!, taskIds);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function createSubtaskController(req: Request, res: Response, next: NextFunction) {
  try {
    const { title, description, assigneeUserId, assignees } = req.body ?? {};
    if (!title?.trim()) {
      return res.status(400).json({ message: "title is required." });
    }
    const task = await createSubtask(req.params.taskId, { title, description, assigneeUserId, assignees }, req.currentUser!);
    res.status(201).json({ task });
  } catch (error) {
    next(error);
  }
}
