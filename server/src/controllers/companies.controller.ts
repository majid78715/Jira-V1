import { Request, Response, NextFunction } from "express";
import {
  createCompanyRecord,
  deleteCompanyRecord,
  listCompanyRecords,
  updateCompanyRecord
} from "../services/company.service";
import { CompanyType } from "../models/_types";

const allowedCompanyTypes: CompanyType[] = ["HUMAIN", "VENDOR"];

export async function listCompaniesController(_req: Request, res: Response, next: NextFunction) {
  try {
    const companies = await listCompanyRecords();
    res.json({ companies });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function createCompanyController(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, type, description, isActive, ceoUserId, vendorOwnerUserId, vendorCeoUserId, region, timeZone, slaConfig } = req.body;
    if (!name || !type) {
      return res.status(400).json({ message: "name and type are required." });
    }
    if (!allowedCompanyTypes.includes(type)) {
      return res.status(400).json({ message: "Invalid company type." });
    }
    const company = await createCompanyRecord(req.currentUser!.role, {
      name,
      type,
      description,
      isActive,
      ceoUserId,
      vendorOwnerUserId,
      vendorCeoUserId,
      region,
      timeZone,
      slaConfig
    });
    res.status(201).json({ company });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function updateCompanyController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { name, type, description, isActive, ceoUserId, vendorOwnerUserId, vendorCeoUserId, region, timeZone, slaConfig } = req.body;
    if (type && !allowedCompanyTypes.includes(type)) {
      return res.status(400).json({ message: "Invalid company type." });
    }
    const company = await updateCompanyRecord(req.currentUser!.role, id, {
      name,
      type,
      description,
      isActive,
      ceoUserId,
      vendorOwnerUserId,
      vendorCeoUserId,
      region,
      timeZone,
      slaConfig
    });
    res.json({ company });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function deleteCompanyController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await deleteCompanyRecord(id);
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
