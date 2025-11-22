import { apiRequest } from "./apiClient";
import { Notification } from "./types";

export const NOTIFICATIONS_UPDATED_EVENT = "notifications:updated";

export function emitNotificationsUpdated() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}

export async function fetchUnreadNotificationsByType(type: string, limit = 100): Promise<Notification[]> {
  const params = new URLSearchParams();
  params.set("read", "false");
  params.set("type", type);
  params.set("limit", String(limit));
  const response = await apiRequest<{ notifications: Notification[] }>(`/notifications?${params.toString()}`);
  return response.notifications ?? [];
}

export async function markNotificationsRead(notificationIds: string[]): Promise<void> {
  for (const notificationId of notificationIds) {
    await apiRequest(`/notifications/${notificationId}/read`, { method: "POST" });
  }
}
