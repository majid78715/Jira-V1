"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Notification } from "../../lib/types";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { Button } from "../ui/Button";
import { emitNotificationsUpdated } from "../../lib/notifications";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const toggle = () => setOpen((prev) => !prev);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{ notifications: Notification[] }>("/notifications?limit=20");
      setNotifications(response.notifications ?? []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to fetch notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!panelRef.current) {
        return;
      }
      if (!panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      window.addEventListener("click", handleClick);
    }
    return () => {
      window.removeEventListener("click", handleClick);
    };
  }, [open]);

  const handleRefresh = async () => {
    await fetchNotifications();
  };

  const markAsRead = async (id: string) => {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: "POST" });
      await fetchNotifications();
      emitNotificationsUpdated();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to update notification.");
    }
  };

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        className="relative rounded-full p-2 text-ink-600 hover:bg-ink-100"
        aria-label="View notifications"
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-2xl border border-ink-100 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-900">Notifications</p>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={handleRefresh} disabled={loading}>
              Refresh
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          {loading ? (
            <p className="mt-3 text-sm text-ink-500">Loading…</p>
          ) : notifications.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">You&rsquo;re all caught up.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className={`rounded-xl border border-ink-100 px-3 py-2 ${notification.read ? "bg-white" : "bg-ink-50"}`}
                >
                  <p className="text-sm font-semibold text-ink-900">{notification.message}</p>
                  <p className="text-xs text-ink-400">{formatDate(notification.createdAt)}</p>
                  {!notification.read && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-2 px-2 py-1 text-xs"
                      onClick={() => markAsRead(notification.id)}
                    >
                      Mark as read
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
