import { NextFunction, Request, Response } from "express";
import { getCompanyById } from "../data/repositories";
import { createInternalUser } from "../services/user.service";

export async function createVendorContactController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.currentUser) {
      return res.status(401).json({ message: "Authentication required." });
    }
    const { email, profile, companyId } = req.body ?? {};
    if (!email || !profile || !companyId) {
      return res.status(400).json({ message: "email, profile, and companyId are required." });
    }
    const company = await getCompanyById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found." });
    }
    const user = await createInternalUser({
      email,
      role: "PROJECT_MANAGER",
      profile,
      companyId,
      createdById: req.currentUser.id
    });
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
}
