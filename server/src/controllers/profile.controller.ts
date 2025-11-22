import { Request, Response, NextFunction } from "express";
import {
  approveUserProfile,
  rejectUserProfile,
  submitProfileChangeRequest,
  approveProfileChangeRequest,
  rejectProfileChangeRequest
} from "../services/profile.service";
import { listPendingProfiles, listProfileChangeRequests } from "../data/repositories";

export async function listPendingProfilesController(_req: Request, res: Response, next: NextFunction) {
  try {
    const users = await listPendingProfiles();
    res.json({ users });
  } catch (error) {
    next(error);
  }
}

export async function approveProfileController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { comment } = req.body ?? {};
    const user = await approveUserProfile(id, req.currentUser!.id, comment);
    res.json({ user });
  } catch (error) {
    next(error);
  }
}

export async function rejectProfileController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { comment } = req.body ?? {};
    const user = await rejectUserProfile(id, req.currentUser!.id, comment);
    res.json({ user });
  } catch (error) {
    next(error);
  }
}

export async function createProfileChangeRequestController(req: Request, res: Response, next: NextFunction) {
  try {
    const { profile } = req.body;
    if (!profile) {
      return res.status(400).json({ message: "profile is required." });
    }
    const request = await submitProfileChangeRequest(req.currentUser!.id, profile);
    res.status(201).json({ request });
  } catch (error) {
    next(error);
  }
}

export async function listPendingProfileChangeRequestsController(_req: Request, res: Response, next: NextFunction) {
  try {
    const requests = await listProfileChangeRequests("PENDING");
    res.json({ requests });
  } catch (error) {
    next(error);
  }
}

export async function approveProfileChangeRequestController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { comment } = req.body ?? {};
    const request = await approveProfileChangeRequest(id, req.currentUser!.id, comment);
    res.json({ request });
  } catch (error) {
    next(error);
  }
}

export async function rejectProfileChangeRequestController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { comment } = req.body ?? {};
    const request = await rejectProfileChangeRequest(id, req.currentUser!.id, comment);
    res.json({ request });
  } catch (error) {
    next(error);
  }
}
