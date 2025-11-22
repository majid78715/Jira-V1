import { NextFunction, Request, Response } from "express";
import { Role } from "../models/_types";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    return res.status(401).json({ message: "Authentication required." });
  }
  return next();
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      return res.status(401).json({ message: "Authentication required." });
    }
    if (!roles.includes(req.currentUser.role)) {
      return res.status(403).json({ message: "Insufficient permissions." });
    }
    return next();
  };
}
