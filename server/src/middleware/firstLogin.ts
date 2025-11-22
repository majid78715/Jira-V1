import { NextFunction, Request, Response } from "express";

const FIRST_LOGIN_ALLOWED_PATHS = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/change-password-first-login",
  "/api/auth/accept-invitation",
  "/api/health"
];

export function enforceFirstLoginCompletion(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser || !req.currentUser.firstLoginRequired) {
    return next();
  }

  const path = req.path;
  const isAllowed = FIRST_LOGIN_ALLOWED_PATHS.some((allowed) => path.startsWith(allowed));

  if (isAllowed) {
    return next();
  }

  return res.status(403).json({
    message: "Password update required before continuing.",
    firstLoginRequired: true
  });
}
