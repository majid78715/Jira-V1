"use client";

import { useCallback, useEffect, useState } from "react";
import { ActivityLog } from "../../lib/types";
import { apiRequest, ApiError } from "../../lib/apiClient";

interface ActivityFeedProps {
  entityId?: string;
  entityType?: string;
  resolveUserName?: (userId: string) => string;
}

export function ActivityFeed({ entityId, entityType, resolveUserName }: ActivityFeedProps) {
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    if (!entityId) {
      setActivity([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ entityId });
      if (entityType) {
        params.set("entityType", entityType);
      }
      const response = await apiRequest<{ activity: ActivityLog[] }>(`/activity?${params.toString()}`);
      setActivity(response.activity ?? []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to load activity.");
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  if (!entityId) {
    return <p className="text-sm text-ink-500">Activity will appear after the record is created.</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (loading) {
    return <p className="text-sm text-ink-500">Loading activity…</p>;
  }

  if (!activity.length) {
    return <p className="text-sm text-ink-500">No activity recorded yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {activity.map((log) => (
        <li key={log.id} className="rounded-xl border border-ink-100 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink-900">
              {resolveUserName?.(log.actorId) ?? log.actorId}
            </p>
            <p className="text-xs text-ink-400">{formatDate(log.createdAt)}</p>
          </div>
          <p className="text-sm text-ink-800">{log.message}</p>
        </li>
      ))}
    </ul>
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

