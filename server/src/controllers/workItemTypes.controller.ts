import { Request, Response } from "express";
import {
  listWorkItemTypes,
  getWorkItemTypeById,
  createWorkItemType,
  updateWorkItemType,
  deleteWorkItemType,
  NewWorkItemTypeInput,
  UpdateWorkItemTypeInput
} from "../data/repositories";

export const getWorkItemTypes = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    const types = await listWorkItemTypes(projectId as string);
    res.json(types);
  } catch (error) {
    console.error("Error listing work item types:", error);
    res.status(500).json({ error: "Failed to list work item types" });
  }
};

export const getWorkItemType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const type = await getWorkItemTypeById(id);
    if (!type) {
      return res.status(404).json({ error: "Work item type not found" });
    }
    res.json(type);
  } catch (error) {
    console.error("Error getting work item type:", error);
    res.status(500).json({ error: "Failed to get work item type" });
  }
};

export const createNewWorkItemType = async (req: Request, res: Response) => {
  try {
    const input: NewWorkItemTypeInput = req.body;
    if (!input.name) {
      return res.status(400).json({ error: "Name is required" });
    }
    const type = await createWorkItemType(input);
    res.status(201).json(type);
  } catch (error: any) {
    console.error("Error creating work item type:", error);
    res.status(400).json({ error: error.message || "Failed to create work item type" });
  }
};

export const updateWorkItemTypeDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const update: UpdateWorkItemTypeInput = req.body;
    const type = await updateWorkItemType(id, update);
    res.json(type);
  } catch (error: any) {
    console.error("Error updating work item type:", error);
    res.status(400).json({ error: error.message || "Failed to update work item type" });
  }
};

export const removeWorkItemType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deleteWorkItemType(id);
    res.status(204).send();
  } catch (error: any) {
    console.error("Error deleting work item type:", error);
    res.status(400).json({ error: error.message || "Failed to delete work item type" });
  }
};
