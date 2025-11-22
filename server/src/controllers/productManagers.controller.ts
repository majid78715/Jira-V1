import { NextFunction, Request, Response } from "express";
import {
  deactivateProductManager,
  listProductManagerRoster,
  updateProductManagerRecord
} from "../services/productManager.service";

export async function listProductManagersController(_req: Request, res: Response, next: NextFunction) {
  try {
    const payload = await listProductManagerRoster();
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function updateProductManagerController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { email, companyId, profile, vpUserId, preferredCompanyIds, isActive } = req.body;
    const user = await updateProductManagerRecord(req.currentUser!.id, id, {
      email,
      companyId,
      profile,
      vpUserId,
      preferredCompanyIds,
      isActive
    });
    res.json({ user });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function deleteProductManagerController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await deactivateProductManager(req.currentUser!.id, id);
    res.status(204).end();
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

function handleKnownError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof Error) {
    const message = error.message;
    const status = message.toLowerCase().includes("not found") ? 404 : 400;
    return res.status(status).json({ message });
  }
  return next(error);
}
