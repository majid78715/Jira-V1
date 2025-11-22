import { Request, Response } from "express";
import {
  listReleases,
  getReleaseById,
  createRelease,
  updateRelease,
  deleteRelease,
  NewReleaseInput,
  UpdateReleaseInput
} from "../data/repositories";

export const getReleases = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({ error: "Project ID is required" });
    }
    const releases = await listReleases(projectId);
    res.json(releases);
  } catch (error) {
    console.error("Error listing releases:", error);
    res.status(500).json({ error: "Failed to list releases" });
  }
};

export const getRelease = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const release = await getReleaseById(id);
    if (!release) {
      return res.status(404).json({ error: "Release not found" });
    }
    res.json(release);
  } catch (error) {
    console.error("Error getting release:", error);
    res.status(500).json({ error: "Failed to get release" });
  }
};

export const createNewRelease = async (req: Request, res: Response) => {
  try {
    const input: NewReleaseInput = req.body;
    if (!input.projectId || !input.name) {
      return res.status(400).json({ error: "Project ID and Name are required" });
    }
    const release = await createRelease(input);
    res.status(201).json(release);
  } catch (error: any) {
    console.error("Error creating release:", error);
    res.status(400).json({ error: error.message || "Failed to create release" });
  }
};

export const updateReleaseDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const update: UpdateReleaseInput = req.body;
    const release = await updateRelease(id, update);
    res.json(release);
  } catch (error: any) {
    console.error("Error updating release:", error);
    res.status(400).json({ error: error.message || "Failed to update release" });
  }
};

export const removeRelease = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deleteRelease(id);
    res.status(204).send();
  } catch (error: any) {
    console.error("Error deleting release:", error);
    res.status(400).json({ error: error.message || "Failed to delete release" });
  }
};
