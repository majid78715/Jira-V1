import { NextFunction, Request, Response } from "express";
import { WorkflowEntityType } from "../models/_types";
import { WorkflowDefinitionRequest, createDefinition, listDefinitions, removeDefinition, updateDefinition } from "../services/workflow.service";

function resolveEntityType(value?: string): WorkflowEntityType {
  if (!value) {
    throw new Error("entityType is required.");
  }
  if (value !== "TASK") {
    throw new Error("Unsupported entity type.");
  }
  return value as WorkflowEntityType;
}

export async function listWorkflowDefinitionsController(req: Request, res: Response, next: NextFunction) {
  try {
    const entityType = resolveEntityType((req.query.entityType as string) ?? "TASK");
    const definitions = await listDefinitions(entityType);
    res.json({ definitions });
  } catch (error) {
    next(error);
  }
}

export async function createWorkflowDefinitionController(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = req.body as WorkflowDefinitionRequest;
    const definition = await createDefinition(payload);
    res.status(201).json({ definition });
  } catch (error) {
    next(error);
  }
}

export async function updateWorkflowDefinitionController(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = req.body as Partial<WorkflowDefinitionRequest>;
    const definition = await updateDefinition(req.params.id, payload);
    res.json({ definition });
  } catch (error) {
    next(error);
  }
}

export async function deleteWorkflowDefinitionController(req: Request, res: Response, next: NextFunction) {
  try {
    await removeDefinition(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
