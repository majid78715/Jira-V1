"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiRequest } from "../lib/apiClient";
import { Notification } from "../lib/types";
import { NOTIFICATIONS_UPDATED_EVENT } from "../lib/notifications";

type UseNotificationBadgeOptions = {
  enabled?: boolean;
  limit?: number;
  pollIntervalMs?: number;
  type?: string;
};

export function useNotificationBadge(options: UseNotificationBadgeOptions = {}) {
  const { enabled = true, limit = 50, pollIntervalMs = 30000, type } = options;
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPendingNotifications = useCallback(async () => {
    if (!enabled) {
      setPendingCount(0);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("read", "false");
      params.set("limit", String(limit));
      if (type) {
        params.set("type", type);
      }
      const response = await apiRequest<{ notifications: Notification[] }>(`/notifications?${params.toString()}`);
      setPendingCount(response.notifications?.length ?? 0);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [enabled, limit]);

  useEffect(() => {
    void fetchPendingNotifications();
  }, [fetchPendingNotifications]);

  useEffect(() => {
    if (!enabled || !pollIntervalMs) {
      return;
    }
    const timer = window.setInterval(() => {
      void fetchPendingNotifications();
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, pollIntervalMs, fetchPendingNotifications]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const handler = () => {
      void fetchPendingNotifications();
    };
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, handler);
  }, [enabled, fetchPendingNotifications]);

  return {
    pendingCount,
    loading,
    error,
    refresh: fetchPendingNotifications
  };
}
