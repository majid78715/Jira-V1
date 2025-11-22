import { Request, Response, NextFunction } from "express";
import {
  authenticateWithEmail,
  authenticateAsUser,
  AUTH_COOKIE_NAME,
  changePasswordForUser,
  completeFirstLoginPasswordChange
} from "../services/auth.service";

const isProduction = process.env.NODE_ENV === "production";
const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12h

export async function loginController(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required." });
    }
    const { token, user } = await authenticateWithEmail(email, password);
    res
      .cookie(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: COOKIE_MAX_AGE_MS
      })
      .json({ user, firstLoginRequired: user.firstLoginRequired });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid credentials.") {
      return res.status(401).json({ message: error.message });
    }
    return next(error);
  }
}

export async function impersonateController(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.body ?? {};
    if (!userId) {
      return res.status(400).json({ message: "userId is required." });
    }
    const { token, user } = await authenticateAsUser(userId);
    res
      .cookie(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: COOKIE_MAX_AGE_MS
      })
      .json({ user, firstLoginRequired: user.firstLoginRequired });
  } catch (error) {
    return next(error);
  }
}

export function currentUserController(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  if (!req.currentUser) {
    return res.status(401).json({ message: "Authentication required." });
  }
  return res.json({ user: req.currentUser });
}

export function logoutController(req: Request, res: Response) {
  return res
    .setHeader("Cache-Control", "no-store")
    .clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction
    })
    .status(204)
    .send();
}

export async function changePasswordFirstLoginController(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body ?? {};
    const user = await completeFirstLoginPasswordChange(
      req.currentUser.id,
      currentPassword,
      newPassword,
      confirmNewPassword
    );
    return res.json({ user });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
}

export async function changePasswordController(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    return res.status(401).json({ message: "Authentication required." });
  }
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body ?? {};
    const user = await changePasswordForUser(req.currentUser.id, currentPassword, newPassword, confirmNewPassword);
    return res.json({ user });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
}
