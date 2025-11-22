import { Request, Response, NextFunction } from "express";
import {
  inviteProjectManager,
  inviteDeveloper,
  acceptInvitation,
  inviteProductManager,
  cancelInvitation
} from "../services/invitation.service";
import { listUserInvitations, listUsersByRole } from "../data/repositories";

export async function inviteProjectManagerController(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, firstName, lastName, companyId } = req.body;
    if (!email || !firstName || !lastName || !companyId) {
      return res.status(400).json({ message: "email, firstName, lastName, and companyId are required." });
    }
    const invitation = await inviteProjectManager({
      email,
      firstName,
      lastName,
      companyId,
      invitedById: req.currentUser!.id
    });
    res.status(201).json({ invitation });
  } catch (error) {
    next(error);
  }
}

export async function inviteDeveloperController(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, firstName, lastName } = req.body;
    if (!email || !firstName || !lastName) {
      return res.status(400).json({ message: "email, firstName, and lastName are required." });
    }
    const companyId = req.currentUser?.companyId;
    if (!companyId) {
      return res.status(400).json({ message: "project manager must belong to a company." });
    }
    const result = await inviteDeveloper({
      email,
      firstName,
      lastName,
      companyId,
      invitedById: req.currentUser!.id
    });
    res.status(201).json({ invitation: result.invitation, user: result.user, tempPassword: result.tempPassword });
  } catch (error) {
    next(error);
  }
}

export async function inviteProductManagerController(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, firstName, lastName, companyId, vpUserId, preferredCompanyIds } = req.body;
    if (!email || !firstName || !lastName || !companyId) {
      return res.status(400).json({ message: "email, firstName, lastName, and companyId are required." });
    }
    const result = await inviteProductManager({
      email,
      firstName,
      lastName,
      companyId,
      invitedById: req.currentUser!.id,
      vpUserId,
      preferredCompanyIds
    });
    res.status(201).json({ invitation: result.invitation, user: result.user, tempPassword: result.tempPassword });
  } catch (error) {
    next(error);
  }
}

export async function cancelInvitationController(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    return res.status(401).json({ message: "Authentication required." });
  }
  try {
    const { id } = req.params;
    const invitation = await cancelInvitation({
      invitationId: id,
      actorId: req.currentUser.id,
      actorRole: req.currentUser.role
    });
    res.json({ invitation });
  } catch (error) {
    next(error);
  }
}

export async function acceptInvitationController(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, password, profile } = req.body;
    if (!token || !password || !profile) {
      return res.status(400).json({ message: "token, password, and profile are required." });
    }
    const user = await acceptInvitation({ token, password, profile });
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
}

export async function listProjectManagersController(_req: Request, res: Response, next: NextFunction) {
  try {
    const [users, invitations] = await Promise.all([
      listUsersByRole("PROJECT_MANAGER"),
      listUserInvitations({ role: "PROJECT_MANAGER" })
    ]);
    res.json({ users, invitations });
  } catch (error) {
    next(error);
  }
}

export async function listDevelopersController(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.currentUser?.companyId;
    if (!companyId) {
      return res.status(400).json({ message: "Company context required." });
    }
    const [developers, pms, invitations] = await Promise.all([
      listUsersByRole("DEVELOPER", companyId),
      listUsersByRole("PM", companyId),
      listUserInvitations({ role: "DEVELOPER", companyId })
    ]);
    res.json({ users: [...developers, ...pms], invitations });
  } catch (error) {
    next(error);
  }
}
