import { Request, Response } from "express";
import { noopService } from "../services/_noop.service";

export function noopController(_req: Request, res: Response) {
  const payload = noopService();
  return res.status(501).json(payload);
}
