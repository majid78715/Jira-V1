import { NextFunction, Request, Response } from "express";
import { createHoliday, deleteHoliday, listHolidays, updateHoliday } from "../services/companyHoliday.service";

export async function listCompanyHolidaysController(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
    const vendorId = typeof req.query.vendorId === "string" ? req.query.vendorId : undefined;
    const holidays = await listHolidays(req.currentUser!, { companyId, vendorId });
    res.json({ holidays });
  } catch (error) {
    next(error);
  }
}

export async function createCompanyHolidayController(req: Request, res: Response, next: NextFunction) {
  try {
    const holiday = await createHoliday(req.currentUser!, req.body ?? {});
    res.status(201).json({ holiday });
  } catch (error) {
    next(error);
  }
}

export async function updateCompanyHolidayController(req: Request, res: Response, next: NextFunction) {
  try {
    const holiday = await updateHoliday(req.currentUser!, req.params.id, req.body ?? {});
    res.json({ holiday });
  } catch (error) {
    next(error);
  }
}

export async function deleteCompanyHolidayController(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteHoliday(req.currentUser!, req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
