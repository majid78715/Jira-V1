"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "../../../components/layout/PageShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { CalendarTimeline } from "../../../components/CalendarTimeline";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { API_BASE_URL, ApiError, apiRequest } from "../../../lib/apiClient";
import { CalendarScope, User, UserCalendarResponse } from "../../../lib/types";

const scopeOptions: { id: CalendarScope; label: string }[] = [
  { id: "user", label: "My calendar" },
  { id: "team", label: "Team calendar" }
];

export default function CalendarPage() {
  const { user, loading: sessionLoading } = useCurrentUser({ redirectTo: "/login" });
  const [scope, setScope] = useState<CalendarScope>("user");
  const [calendar, setCalendar] = useState<UserCalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const loadCalendar = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setStatus(null);
    try {
      const query = scope === "team" ? "?scope=team" : "";
      const data = await apiRequest<UserCalendarResponse>(`/calendar/user/${user.id}${query}`);
      setCalendar(data);
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to load calendar.");
      setCalendar(null);
    } finally {
      setLoading(false);
    }
  }, [scope, user]);

  useEffect(() => {
    if (!user) return;
    void loadCalendar();
  }, [user, scope, loadCalendar]);

  const participantNames = useMemo(
    () => calendar?.users?.map((entry: User) => `${entry.profile.firstName} ${entry.profile.lastName}`) ?? [],
    [calendar]
  );

  const handleDownloadICS = useCallback(async () => {
    if (!user) return;
    setDownloading(true);
    setStatus(null);
    try {
      const query = scope === "team" ? "?scope=team" : "";
      const response = await fetch(`${API_BASE_URL}/export/ics/user/${user.id}${query}`, {
        credentials: "include",
        headers: {
          Accept: "text/calendar"
        }
      });
      if (!response.ok) {
        throw new Error("Unable to download calendar.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition");
      const match = disposition?.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] ?? `calendar-${scope}.ics`;
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to download calendar.";
      setStatus(message);
    } finally {
      setDownloading(false);
    }
  }, [scope, user]);

  if (sessionLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading workspace…</div>;
  }

  const helperText =
    scope === "team"
      ? "Includes everyone tied to your company."
      : "Assignments, milestones, holidays, and personal day offs.";

  return (
    <PageShell
      title="Calendar"
      subtitle="Plan assignments against availability"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      <div className="flex flex-col gap-4 rounded-2xl border border-ink-100 bg-white/90 p-4 shadow-card lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-900">
            {scope === "team" ? "Team calendar" : "My calendar"}
          </p>
          <p className="text-sm text-ink-500">{helperText}</p>
          {status && <p className="mt-2 text-sm text-amber-600">{status}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-full bg-ink-50 p-1">
            {scopeOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setScope(option.id)}
                className={clsx(
                  "rounded-full px-4 py-1.5 text-sm font-semibold transition",
                  scope === option.id ? "bg-brand-600 text-white shadow-sm" : "text-ink-500 hover:text-ink-900"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button type="button" onClick={handleDownloadICS} disabled={downloading || !calendar}>
            {downloading ? "Preparing ICS…" : "Download ICS"}
          </Button>
        </div>
      </div>

      <Card className="mt-6" title="Upcoming plan" helperText={helperText}>
        <CalendarTimeline
          events={calendar?.events ?? []}
          loading={loading}
          emptyState={scope === "team" ? "No events for your team yet." : "No events scheduled."}
        />
      </Card>

      {scope === "team" && (
        <Card className="mt-6" title="People included" helperText="Derived from your company roster">
          {participantNames.length === 0 ? (
            <p className="text-sm text-ink-500">No teammates on record yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {participantNames.map((name) => (
                <span key={name} className="rounded-full bg-ink-50 px-3 py-1 text-sm text-ink-600">
                  {name}
                </span>
              ))}
            </div>
          )}
        </Card>
      )}
    </PageShell>
  );
}
