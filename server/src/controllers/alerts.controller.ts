import { Request, Response, NextFunction } from "express";
import { fetchAlerts, resolveAlertForUser } from "../services/alert.service";

export async function listAlertsController(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, type, search } = req.query;
    const result = await fetchAlerts(req.currentUser!, {
      status: typeof status === "string" ? status : undefined,
      type: typeof type === "string" ? type : undefined,
      search: typeof search === "string" ? search : undefined
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function resolveAlertController(req: Request, res: Response, next: NextFunction) {
  try {
    const alert = await resolveAlertForUser(req.currentUser!, req.params.id);
    res.json({ alert });
  } catch (error) {
    next(error);
  }
}
