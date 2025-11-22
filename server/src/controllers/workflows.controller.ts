import { Request, Response } from "express";
import {
  listWorkflowSchemes,
  getWorkflowSchemeById,
  createWorkflowScheme,
  updateWorkflowScheme,
  deleteWorkflowScheme,
  NewWorkflowSchemeInput,
  UpdateWorkflowSchemeInput
} from "../data/repositories";

export const getWorkflowSchemes = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    const schemes = await listWorkflowSchemes(projectId as string);
    res.json(schemes);
  } catch (error) {
    console.error("Error listing workflow schemes:", error);
    res.status(500).json({ error: "Failed to list workflow schemes" });
  }
};

export const getWorkflowScheme = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const scheme = await getWorkflowSchemeById(id);
    if (!scheme) {
      return res.status(404).json({ error: "Workflow scheme not found" });
    }
    res.json(scheme);
  } catch (error) {
    console.error("Error getting workflow scheme:", error);
    res.status(500).json({ error: "Failed to get workflow scheme" });
  }
};

export const createNewWorkflowScheme = async (req: Request, res: Response) => {
  try {
    const input: NewWorkflowSchemeInput = req.body;
    if (!input.name) {
      return res.status(400).json({ error: "Name is required" });
    }
    if (!input.states || input.states.length === 0) {
      return res.status(400).json({ error: "At least one state is required" });
    }
    const scheme = await createWorkflowScheme(input);
    res.status(201).json(scheme);
  } catch (error: any) {
    console.error("Error creating workflow scheme:", error);
    res.status(400).json({ error: error.message || "Failed to create workflow scheme" });
  }
};

export const updateWorkflowSchemeDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const update: UpdateWorkflowSchemeInput = req.body;
    const scheme = await updateWorkflowScheme(id, update);
    res.json(scheme);
  } catch (error: any) {
    console.error("Error updating workflow scheme:", error);
    res.status(400).json({ error: error.message || "Failed to update workflow scheme" });
  }
};

export const removeWorkflowScheme = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deleteWorkflowScheme(id);
    res.status(204).send();
  } catch (error: any) {
    console.error("Error deleting workflow scheme:", error);
    res.status(400).json({ error: error.message || "Failed to delete workflow scheme" });
  }
};
