"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "../../../components/layout/PageShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Table } from "../../../components/ui/Table";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../lib/apiClient";
import { DayOff, Task, TimeEntry, User } from "../../../lib/types";

type TimeTab = "MY_TIME" | "TEAM_TIME" | "VENDOR_TIME" | "ORG" | "LEAVE";

interface TimeEntriesApiResponse {
  entries: TimeEntry[];
  tasks: Task[];
  projects: { id: string; name: string; code: string }[];
  aggregates: { todayMinutes: number; weekMinutes: number };
}

interface LeaveResponse {
  dayOffs: DayOff[];
  users: User[];
}

export default function TimeWorkspacePage() {
  const { user, loading } = useCurrentUser({ redirectTo: "/login" });
  const [activeTab, setActiveTab] = useState<TimeTab>("MY_TIME");
  const [timeData, setTimeData] = useState<TimeEntriesApiResponse | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [leaveData, setLeaveData] = useState<LeaveResponse | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (activeTab === "MY_TIME") {
      const load = async () => {
        try {
          const response = await apiRequest<TimeEntriesApiResponse>("/time-entries");
          setTimeData(response);
          setTimeError(null);
        } catch (error) {
          const apiError = error as ApiError;
          setTimeError(apiError.message ?? "Unable to load time entries.");
        }
      };
      void load();
    }
    if (activeTab === "LEAVE") {
      const loadLeave = async () => {
        try {
          const response = await apiRequest<LeaveResponse>("/leave?scope=mine");
          setLeaveData(response);
          setLeaveError(null);
        } catch (error) {
          const apiError = error as ApiError;
          setLeaveError(apiError.message ?? "Unable to load leave requests.");
        }
      };
      void loadLeave();
    }
  }, [user, activeTab]);

  const timeRows = useMemo(() => {
    if (!timeData) return [];
    const taskLookup = Object.fromEntries(timeData.tasks.map((task) => [task.id, task]));
    const projectLookup = Object.fromEntries(timeData.projects.map((project) => [project.id, project]));
    return timeData.entries.map((entry) => {
      const task = taskLookup[entry.taskId];
      const project = projectLookup[entry.projectId];
      return {
        id: entry.id,
        project: project ? `${project.code} · ${project.name}` : entry.projectId,
        task: task?.title ?? entry.taskId,
        date: entry.date,
        minutes: entry.minutes,
        billable: entry.billable ? "Billable" : "Non-billable"
      };
    });
  }, [timeData]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading...</div>;
  }

  const tabs: { id: TimeTab; label: string }[] = [
    { id: "MY_TIME", label: "My Time" },
    { id: "TEAM_TIME", label: "Team Time" },
    { id: "VENDOR_TIME", label: "Vendor Time" },
    { id: "ORG", label: "Organisation" },
    { id: "LEAVE", label: "Time-Off & Leave" }
  ];

  return (
    <PageShell
      title="Time Workspace"
      subtitle="Log time, review approvals, and monitor utilisation"
      currentUser={user}
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
    >
      <div className="mb-6 flex flex-wrap gap-3">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={tab.id === activeTab ? "primary" : "ghost"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === "MY_TIME" && (
        <Card title="My Time" helperText="Entries logged for the current period">
          {timeError && <p className="text-sm text-red-600">{timeError}</p>}
          {timeData && (
            <>
              <div className="mb-4 flex gap-6 text-sm text-ink-600">
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-400">Today</p>
                  <p className="text-lg font-semibold text-ink-900">{formatHours(timeData.aggregates.todayMinutes)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-400">This week</p>
                  <p className="text-lg font-semibold text-ink-900">{formatHours(timeData.aggregates.weekMinutes)}</p>
                </div>
              </div>
              <Table
                columns={[
                  { header: "Project", accessor: "project" },
                  { header: "Task", accessor: "task" },
                  { header: "Date", render: (row: any) => new Date(row.date).toLocaleDateString() },
                  { header: "Hours", render: (row: any) => formatHours(row.minutes) },
                  { header: "Type", accessor: "billable" }
                ]}
                rows={timeRows}
                rowKey={(row: any) => row.id}
              />
            </>
          )}
        </Card>
      )}

      {activeTab === "TEAM_TIME" && (
        <Card title="Team Time" helperText="Approvals and utilisation for your team">
          <p className="text-sm text-ink-500">
            Team summaries will appear here once server-side aggregation endpoints are available.
          </p>
        </Card>
      )}

      {activeTab === "VENDOR_TIME" && (
        <Card title="Vendor Time" helperText="Vendor utilisation and hours">
          <p className="text-sm text-ink-500">Vendor performance dashboards are coming soon.</p>
        </Card>
      )}

      {activeTab === "ORG" && (
        <Card title="Organisation Overview" helperText="Portfolio wide utilisation">
          <p className="text-sm text-ink-500">Executive analytics will be surfaced in a future update.</p>
        </Card>
      )}

      {activeTab === "LEAVE" && (
        <Card title="My Leave" helperText="Submitted leave requests and approvals">
          {leaveError && <p className="text-sm text-red-600">{leaveError}</p>}
          {!leaveData && !leaveError && <p className="text-sm text-ink-500">Loading leave requests...</p>}
          {leaveData && (
            <ul className="space-y-3">
              {leaveData.dayOffs.map((leave) => (
                <li key={leave.id} className="rounded-xl border border-ink-100 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">
                        {new Date(leave.date).toLocaleDateString()} · {leave.leaveType}
                      </p>
                      <p className="text-xs text-ink-500">{leave.reason || "No reason provided"}</p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{leave.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </PageShell>
  );
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
