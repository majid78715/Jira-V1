import { Notification, PublicUser } from "../models/_types";
import {
  createNotification,
  getUserById,
  listNotifications,
  markNotificationRead
} from "../data/repositories";
import { HttpError } from "../middleware/httpError";

type NotificationQuery = {
  read?: string;
  limit?: string;
  type?: string;
};

type CreateNotificationPayload = {
  userId?: string;
  message: string;
  type?: string;
  metadata?: Record<string, unknown>;
};

export async function fetchNotifications(actor: PublicUser, query: NotificationQuery): Promise<Notification[]> {
  const readFilter =
    query.read === "true" ? true : query.read === "false" ? false : undefined;
  const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
  return listNotifications({
    userId: actor.id,
    read: readFilter,
    type: query.type,
    limit: Number.isFinite(limit) ? limit : undefined
  });
}

export async function createNotificationForUser(
  actor: PublicUser,
  payload: CreateNotificationPayload
): Promise<Notification> {
  const message = payload.message?.trim();
  if (!message) {
    throw new HttpError(400, "message is required.");
  }
  const targetUserId = payload.userId ?? actor.id;
  if (payload.userId && !["PM", "SUPER_ADMIN"].includes(actor.role)) {
    throw new HttpError(403, "Only PMs or admins can notify other users.");
  }
  const recipient = await getUserById(targetUserId);
  if (!recipient) {
    throw new HttpError(404, "Recipient not found.");
  }
  if (recipient.id !== actor.id) {
    if (!actor.companyId || recipient.companyId !== actor.companyId) {
      throw new HttpError(403, "Cannot notify users outside your tenant.");
    }
  }
  return createNotification({
    userId: recipient.id,
    message,
    type: payload.type ?? "CUSTOM",
    metadata: payload.metadata
  });
}

export async function markNotificationAsRead(actor: PublicUser, id: string): Promise<Notification> {
  return markNotificationRead(id, actor.id);
}
