"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "../../../components/layout/PageShell";
import { Card } from "../../../components/ui/Card";
import { Table } from "../../../components/ui/Table";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Input } from "../../../components/ui/Input";
import { Tabs } from "../../../components/ui/Tabs";
import { CommentsPanel } from "../../../components/collaboration/CommentsPanel";
import { AttachmentsPanel } from "../../../components/collaboration/AttachmentsPanel";
import { ActivityFeed } from "../../../components/collaboration/ActivityFeed";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../lib/apiClient";
import { Task, TimeEntry, Timesheet, TimesheetStatus, User } from "../../../lib/types";

interface TimesheetOverviewResponse {
  weekStart: string;
  weekEnd: string;
  timesheet: Timesheet | null;
  entries: TimeEntry[];
  tasks: Task[];
  projects: { id: string; name: string; code: string }[];
}

interface TimesheetApprovalQueue {
  timesheets: Timesheet[];
  users: User[];
  entries: Record<string, TimeEntry[]>;
  tasks: Task[];
  projects: { id: string; name: string; code: string }[];
}

const statusTone: Record<TimesheetStatus, "success" | "warning" | "neutral"> = {
  APPROVED: "success",
  SUBMITTED: "warning",
  REJECTED: "warning",
  DRAFT: "neutral"
};

const APPROVER_ROLES: User["role"][] = ["PM", "PROJECT_MANAGER", "SUPER_ADMIN"];

export default function TimesheetsPage() {
  const { user, loading } = useCurrentUser({ redirectTo: "/login" });
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart);
  const [overview, setOverview] = useState<TimesheetOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const canApprove = useMemo(() => (user ? APPROVER_ROLES.includes(user.role) : false), [user]);
  const [queue, setQueue] = useState<TimesheetApprovalQueue | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const resolveUserName = useCallback(
    (id: string) => {
      if (user && id === user.id) {
        return `${user.profile.firstName} ${user.profile.lastName}`;
      }
      const match = queue?.users.find((candidate) => candidate.id === id);
      if (match) {
        return `${match.profile.firstName} ${match.profile.lastName}`;
      }
      return `User ${id.slice(0, 6)}`;
    },
    [user, queue]
  );

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const response = await apiRequest<TimesheetOverviewResponse>(`/timesheets?weekStart=${encodeURIComponent(weekStart)}`);
      setOverview(response);
      setStatusMessage(null);
    } catch (error) {
      const apiError = error as ApiError;
      setStatusMessage(apiError?.message ?? "Unable to load timesheet.");
      setOverview(null);
    } finally {
      setOverviewLoading(false);
    }
  }, [weekStart]);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const response = await apiRequest<TimesheetApprovalQueue>("/timesheets?scope=approvals");
      setQueue(response);
      setQueueMessage(null);
    } catch (error) {
      const apiError = error as ApiError;
      setQueueMessage(apiError?.message ?? "Unable to load approval queue.");
      setQueue(null);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadOverview();
  }, [user, loadOverview]);

  useEffect(() => {
    if (!user || !canApprove) return;
    void loadQueue();
  }, [user, canApprove, loadQueue]);

  const handleGenerate = async () => {
    setActionLoading(true);
    setStatusMessage(null);
    try {
      await apiRequest("/timesheets/generate", {
        method: "POST",
        body: JSON.stringify({ weekStart })
      });
      await loadOverview();
      setStatusMessage("Timesheet refreshed from time entries.");
    } catch (error) {
      const apiError = error as ApiError;
      setStatusMessage(apiError?.message ?? "Unable to refresh timesheet.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!overview?.timesheet) return;
    setActionLoading(true);
    setStatusMessage(null);
    try {
      await apiRequest(`/timesheets/${overview.timesheet.id}/submit`, { method: "POST" });
      await loadOverview();
      setStatusMessage("Timesheet submitted for approval.");
    } catch (error) {
      const apiError = error as ApiError;
      setStatusMessage(apiError?.message ?? "Unable to submit timesheet.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async (timesheetId: string) => {
    setProcessingId(timesheetId);
    setQueueMessage(null);
    try {
      await apiRequest(`/timesheets/${timesheetId}/approve`, { method: "POST" });
      await loadQueue();
      setQueueMessage("Timesheet approved.");
    } catch (error) {
      const apiError = error as ApiError;
      setQueueMessage(apiError?.message ?? "Unable to approve timesheet.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (timesheetId: string) => {
    const comment = rejectNotes[timesheetId]?.trim();
    if (!comment) {
      setQueueMessage("Rejection comment is required.");
      return;
    }
    setProcessingId(timesheetId);
    setQueueMessage(null);
    try {
      await apiRequest(`/timesheets/${timesheetId}/reject`, {
        method: "POST",
        body: JSON.stringify({ comment })
      });
      setRejectNotes((prev) => ({ ...prev, [timesheetId]: "" }));
      await loadQueue();
      setQueueMessage("Timesheet rejected.");
    } catch (error) {
      const apiError = error as ApiError;
      setQueueMessage(apiError?.message ?? "Unable to reject timesheet.");
    } finally {
      setProcessingId(null);
    }
  };

  const shiftWeek = (direction: -1 | 1) => {
    const base = new Date(`${weekStart}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + direction * 7);
    setWeekStart(base.toISOString().slice(0, 10));
  };

  const displayWeekStart = overview?.weekStart ?? weekStart;
  const displayWeekEnd = overview?.weekEnd ?? getWeekEnd(displayWeekStart);
  const weekDays = useMemo(() => buildWeekDays(displayWeekStart), [displayWeekStart]);
  const taskLookup = useMemo(() => {
    const map: Record<string, Task> = {};
    (overview?.tasks ?? []).forEach((task) => {
      map[task.id] = task;
    });
    return map;
  }, [overview]);
  const projectLookup = useMemo(() => {
    const map: Record<string, { id: string; name: string; code: string }> = {};
    (overview?.projects ?? []).forEach((project) => {
      map[project.id] = project;
    });
    return map;
  }, [overview]);
  const gridRows = useMemo(() => {
    if (!overview) return [];
    const rows: { taskId: string; minutesByDate: Record<string, number>; total: number }[] = [];
    const lookup: Record<string, { taskId: string; minutesByDate: Record<string, number>; total: number }> = {};
    overview.entries.forEach((entry) => {
      if (!lookup[entry.taskId]) {
        lookup[entry.taskId] = { taskId: entry.taskId, minutesByDate: {}, total: 0 };
        rows.push(lookup[entry.taskId]);
      }
      lookup[entry.taskId].minutesByDate[entry.date] = (lookup[entry.taskId].minutesByDate[entry.date] ?? 0) + entry.minutes;
      lookup[entry.taskId].total += entry.minutes;
    });
    return rows;
  }, [overview]);

  const dayTotals = weekDays.map((day) =>
    overview?.entries.reduce((sum, entry) => (entry.date === day.date ? sum + entry.minutes : sum), 0) ?? 0
  );
  const weekTotal = dayTotals.reduce((sum, minutes) => sum + minutes, 0);

  const canSubmit = overview?.timesheet && ["DRAFT", "REJECTED"].includes(overview.timesheet.status);

  const queueUserLookup = useMemo(() => {
    const map: Record<string, User> = {};
    (queue?.users ?? []).forEach((entry) => {
      map[entry.id] = entry;
    });
    return map;
  }, [queue]);
  const queueTaskLookup = useMemo(() => {
    const map: Record<string, Task> = {};
    (queue?.tasks ?? []).forEach((task) => {
      map[task.id] = task;
    });
    return map;
  }, [queue]);
  const queueProjectLookup = useMemo(() => {
    const map: Record<string, { id: string; name: string; code: string }> = {};
    (queue?.projects ?? []).forEach((project) => {
      map[project.id] = project;
    });
    return map;
  }, [queue]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading workspace...</div>;
  }

  return (
    <PageShell
      title="Timesheets"
      subtitle="Weekly submissions and approvals"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      <Card title="Weekly timesheet" helperText={`${formatDisplayDate(displayWeekStart)} - ${formatDisplayDate(displayWeekEnd)}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" className="px-3 py-1 text-xs" onClick={() => shiftWeek(-1)}>
              Previous week
            </Button>
            <span className="text-sm font-semibold text-ink-900">{formatDisplayDate(displayWeekStart)}</span>
            <Button type="button" variant="ghost" className="px-3 py-1 text-xs" onClick={() => shiftWeek(1)}>
              Next week
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" disabled={actionLoading || overviewLoading} onClick={handleGenerate}>
              Refresh from entries
            </Button>
            <Button type="button" disabled={!canSubmit || actionLoading} onClick={handleSubmit}>
              Submit timesheet
            </Button>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-ink-100 bg-ink-50/40 p-4">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-ink-900">Status</p>
            {overview?.timesheet ? (
              <Badge tone={statusTone[overview.timesheet.status]} label={overview.timesheet.status} />
            ) : (
              <span className="text-sm text-ink-500">Generate a timesheet to begin.</span>
            )}
          </div>
          {overview?.timesheet?.rejectionComment && (
            <p className="mt-2 text-sm text-amber-700">Needs updates: {overview.timesheet.rejectionComment}</p>
          )}
          {overview?.timesheet?.status === "APPROVED" && (
            <p className="mt-1 text-xs text-ink-500">Approved timesheets lock their underlying time entries.</p>
          )}
        </div>
        {statusMessage && <p className="mt-3 text-sm text-ink-500">{statusMessage}</p>}
        <div className="mt-4">
          {overviewLoading ? (
            <p className="text-sm text-ink-500">Loading weekly data...</p>
          ) : !overview?.entries.length ? (
            <p className="text-sm text-ink-500">No time entries for this week yet.</p>
          ) : (
            <Table>
              <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3">Task</th>
                  {weekDays.map((day) => (
                    <th key={day.date} className="px-4 py-3">
                      {day.label}
                    </th>
                  ))}
                  <th className="px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 bg-white text-sm">
                {gridRows.map((row) => {
                  const task = taskLookup[row.taskId];
                  const project = task ? projectLookup[task.projectId] : undefined;
                  return (
                    <tr key={row.taskId}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink-900">{task?.title ?? "Task"}</p>
                        {project && <p className="text-xs text-ink-500">{project.code} · {project.name}</p>}
                      </td>
                      {weekDays.map((day) => (
                        <td key={`${row.taskId}-${day.date}`} className="px-4 py-3 text-center text-ink-700">
                          {row.minutesByDate[day.date] ? formatHours(row.minutesByDate[day.date]) : "—"}
                        </td>
                      ))}
                      <td className="px-4 py-3 font-semibold text-ink-900">{formatHours(row.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-ink-50 text-sm font-semibold text-ink-900">
                <tr>
                  <td className="px-4 py-3">Daily totals</td>
                  {dayTotals.map((minutes, index) => (
                    <td key={`${weekDays[index]?.date}-total`} className="px-4 py-3 text-center">
                      {minutes ? formatHours(minutes) : "—"}
                    </td>
                  ))}
                  <td className="px-4 py-3">{formatHours(weekTotal)}</td>
                </tr>
              </tfoot>
            </Table>
          )}
        </div>
      </Card>

      {canApprove && (
        <Card title="Approval queue" className="mt-6" helperText="Review submissions from developers and vendors">
          {queueMessage && <p className="mb-3 text-sm text-ink-500">{queueMessage}</p>}
          {queueLoading ? (
            <p className="text-sm text-ink-500">Loading pending timesheets...</p>
          ) : !queue?.timesheets.length ? (
            <p className="text-sm text-ink-500">No submitted timesheets awaiting review.</p>
          ) : (
            <ul className="space-y-4">
              {queue.timesheets.map((timesheet) => {
                const owner = queueUserLookup[timesheet.userId];
                const entries = queue.entries[timesheet.id] ?? [];
                const summaries = summarizeEntries(entries, queueTaskLookup, queueProjectLookup);
                return (
                  <li key={timesheet.id} className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink-900">
                          {owner ? `${owner.profile.firstName} ${owner.profile.lastName}` : "Unknown user"}
                        </p>
                        <p className="text-xs text-ink-500">
                          {formatDisplayDate(timesheet.weekStart)} - {formatDisplayDate(timesheet.weekEnd)}
                        </p>
                        <p className="text-xs text-ink-500">{formatHours(timesheet.totalMinutes)} across {entries.length} entries</p>
                      </div>
                      <Badge tone={statusTone[timesheet.status]} label={timesheet.status} />
                    </div>
                    {summaries.length > 0 && (
                      <div className="mt-3 grid gap-1 text-xs text-ink-600 md:grid-cols-2">
                        {summaries.slice(0, 4).map((summary) => (
                          <div key={summary.key} className="rounded-lg bg-ink-50 px-3 py-2">
                            <p className="font-medium text-ink-900">{summary.label}</p>
                            {summary.project && <p className="text-ink-500">{summary.project}</p>}
                            <p className="text-ink-500">{formatHours(summary.minutes)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                      <Input
                        placeholder="Rejection comment"
                        value={rejectNotes[timesheet.id] ?? ""}
                        onChange={(event) => setRejectNotes((prev) => ({ ...prev, [timesheet.id]: event.target.value }))}
                        className="md:flex-1"
                      />
                      <div className="flex gap-2">
                        <Button type="button" disabled={processingId === timesheet.id} onClick={() => handleApprove(timesheet.id)}>
                          {processingId === timesheet.id ? "Working..." : "Approve"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={processingId === timesheet.id}
                          onClick={() => handleReject(timesheet.id)}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {overview?.timesheet && (
        <Card className="mt-8" title="Collaboration" helperText="Share updates, files, and audit history">
          <Tabs
            tabs={[
              {
                id: "comments",
                label: "Comments",
                content: (
                  <CommentsPanel
                    entityId={overview.timesheet.id}
                    entityType="TIMESHEET"
                    resolveUserName={resolveUserName}
                  />
                )
              },
              {
                id: "attachments",
                label: "Attachments",
                content: <AttachmentsPanel entityId={overview.timesheet.id} entityType="TIMESHEET" />
              },
              {
                id: "activity",
                label: "Activity",
                content: (
                  <ActivityFeed
                    entityId={overview.timesheet.id}
                    entityType="TIMESHEET"
                    resolveUserName={resolveUserName}
                  />
                )
              }
            ]}
          />
        </Card>
      )}
    </PageShell>
  );
}

function getCurrentWeekStart(): string {
  const now = new Date();
  const current = new Date(now.getTime());
  current.setHours(0, 0, 0, 0);
  const day = current.getDay(); // 0 (Sun) - 6 (Sat)
  const distanceFromMonday = (day + 6) % 7;
  current.setDate(current.getDate() - distanceFromMonday);
  return current.toISOString().slice(0, 10);
}

function getWeekEnd(start: string): string {
  const base = new Date(`${start}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + 6);
  return base.toISOString().slice(0, 10);
}

function formatDisplayDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

function buildWeekDays(start: string) {
  const base = new Date(`${start}T00:00:00Z`);
  const days: { date: string; label: string }[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const current = new Date(base);
    current.setUTCDate(base.getUTCDate() + offset);
    days.push({
      date: current.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(current)
    });
  }
  return days;
}

function formatHours(minutes: number): string {
  if (!minutes) return "0h";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) {
    return `${hours}h ${mins}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${mins}m`;
}

function summarizeEntries(
  entries: TimeEntry[],
  taskLookup: Record<string, Task>,
  projectLookup: Record<string, { id: string; name: string; code: string }>
) {
  const map = new Map<string, { key: string; label: string; project?: string; minutes: number }>();
  entries.forEach((entry) => {
    const task = taskLookup[entry.taskId];
    const project = task ? projectLookup[task.projectId] : undefined;
    const key = entry.taskId;
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: task?.title ?? "Task",
        project: project ? `${project.code} · ${project.name}` : undefined,
        minutes: 0
      });
    }
    const summary = map.get(key)!;
    summary.minutes += entry.minutes;
  });
  return Array.from(map.values());
}
