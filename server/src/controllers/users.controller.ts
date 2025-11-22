import { NextFunction, Request, Response } from "express";
import { searchUsersDirectory } from "../services/userDirectory.service";
import { Role } from "../models/_types";
import { getUserPreferencesForUser, updateUserPreferencesForUser } from "../services/userPreferences.service";
import { updateProfileDirectly } from "../services/profile.service";

export async function listUsersDirectoryController(req: Request, res: Response, next: NextFunction) {
  try {
    const { role, country, city, timeZone, q } = req.query;
    const users = await searchUsersDirectory({
      role: typeof role === "string" && role ? (role as Role) : undefined,
      country: typeof country === "string" ? country : undefined,
      city: typeof city === "string" ? city : undefined,
      timeZone: typeof timeZone === "string" ? timeZone : undefined,
      query: typeof q === "string" ? q : undefined
    });
    res.json({ users });
  } catch (error) {
    next(error);
  }
}

export async function getUserPreferencesController(req: Request, res: Response, next: NextFunction) {
  try {
    const preferences = await getUserPreferencesForUser(req.currentUser!, req.params.id);
    res.json({ preferences });
  } catch (error) {
    next(error);
  }
}

export async function updateUserPreferencesController(req: Request, res: Response, next: NextFunction) {
  try {
    const { notificationPreferences, workflowPreferences, availabilityPreferences } = req.body ?? {};
    const preferences = await updateUserPreferencesForUser(req.currentUser!, req.params.id, {
      notificationPreferences,
      workflowPreferences,
      availabilityPreferences
    });
    res.json({ preferences });
  } catch (error) {
    next(error);
  }
}

export async function updateOwnProfileController(req: Request, res: Response, next: NextFunction) {
  try {
    const { profile } = req.body ?? {};
    if (!profile) {
      return res.status(400).json({ message: "profile is required." });
    }
    const user = await updateProfileDirectly(req.currentUser!, profile);
    res.json({ user });
  } catch (error) {
    next(error);
  }
}
