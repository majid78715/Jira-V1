import { NextFunction, Request, Response } from "express";
import { getUserById, toPublicUser } from "../data/repositories";
import { verifyAuthToken, AUTH_COOKIE_NAME } from "../services/auth.service";
import { resolveRoleModules } from "../services/rolePermission.service";

export async function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token =
    req.cookies?.[AUTH_COOKIE_NAME] ??
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.replace("Bearer ", "")
      : undefined);

  if (!token) {
    return next();
  }

  try {
    const payload = verifyAuthToken(token);
    if (!payload) {
      return next();
    }
    const user = await getUserById(payload.sub);
    if (!user || !user.isActive) {
      return next();
    }
    const permittedModules = await resolveRoleModules(user.role);
    req.currentUser = { ...toPublicUser(user), permittedModules };
    return next();
  } catch {
    return next();
  }
}
