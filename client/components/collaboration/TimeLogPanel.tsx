"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Table } from "../ui/Table";
import { Badge } from "../ui/Badge";
import { formatShortDate, formatNumber } from "../../lib/format";
import { User } from "../../lib/types";

interface TimeEntry {
  id: string;
  date: string;
  minutes: number;
  note?: string;
  startedAt: string;
  endedAt: string;
  userId: string;
}

export interface GitLabEntry {
  id: string;
  description: string;
  code: string;
  createdAt: string;
  createdBy: string;
}

interface TimeLogPanelProps {
  taskId: string;
  projectId: string;
  currentUser: User;
  resolveUserName: (id: string) => string;
  gitlabEntries?: GitLabEntry[];
}

export function TimeLogPanel({ taskId, projectId, currentUser, resolveUserName, gitlabEntries = [] }: TimeLogPanelProps) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    hours: "",
    minutes: "",
    note: ""
  });

  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch entries for this task. 
      // Note: The API currently lists entries for the current user. 
      // If we want to see all entries for the task, we might need a different API or filter.
      // For now, we use the updated controller which accepts taskId, but it still filters by user context in service unless we are admin/manager.
      // Assuming listTimeEntriesForUser allows seeing own entries for the task.
      const response = await apiRequest<{ entries: TimeEntry[] }>(`/time-entries?taskId=${taskId}`);
      setEntries(response.entries);
    } catch (err) {
      console.error(err);
      // Ignore error if just no entries or permission issue for now, or show it
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || (!form.hours && !form.minutes)) {
      setError("Date and duration are required.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const totalMinutes = (Number(form.hours || 0) * 60) + Number(form.minutes || 0);

      await apiRequest("/time-entries", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          taskId,
          date: form.date,
          minutes: totalMinutes,
          note: form.note || undefined,
          billable: true // Default to billable for now
        })
      });

      setForm({
        date: new Date().toISOString().split("T")[0],
        hours: "",
        minutes: "",
        note: ""
      });
      await loadEntries();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Failed to log time.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalHours = entries.reduce((sum, entry) => sum + entry.minutes, 0) / 60;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-ink-100 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-ink-900">Log Work</h3>
        {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-4 items-end">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">Date</label>
            <Input 
              type="date" 
              value={form.date} 
              onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))} 
              required 
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">Duration</label>
            <div className="flex gap-2">
              <Input 
                type="number" 
                placeholder="Hrs" 
                min="0" 
                value={form.hours} 
                onChange={(e) => setForm(prev => ({ ...prev, hours: e.target.value }))} 
              />
              <Input 
                type="number" 
                placeholder="Min" 
                min="0" 
                max="59" 
                value={form.minutes} 
                onChange={(e) => setForm(prev => ({ ...prev, minutes: e.target.value }))} 
              />
            </div>
          </div>
          
          <div className="md:col-span-4">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">Link Code Change (GitLab)</label>
            <select
              className="w-full rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-ink-50 disabled:text-ink-400"
              onChange={(e) => {
                const entry = gitlabEntries.find(g => g.id === e.target.value);
                if (entry) {
                  setForm(prev => ({ 
                    ...prev, 
                    note: prev.note ? `${prev.note} [Code: ${entry.description}]` : `[Code: ${entry.description}]` 
                  }));
                }
              }}
              defaultValue=""
              disabled={gitlabEntries.length === 0}
            >
              <option value="" disabled>
                {gitlabEntries.length === 0 ? "No GitLab snippets added yet (Add in GitLab tab)" : "Select a code snippet to link..."}
              </option>
              {gitlabEntries.map(entry => (
                <option key={entry.id} value={entry.id}>
                  [{entry.createdBy}] {entry.description} ({formatShortDate(entry.createdAt)})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">Note</label>
            <div className="flex gap-2">
              <Input 
                placeholder="What did you work on?" 
                value={form.note} 
                onChange={(e) => setForm(prev => ({ ...prev, note: e.target.value }))} 
                className="flex-1"
              />
              <Button type="submit" disabled={submitting}>
                {submitting ? "Logging..." : "Log Time"}
              </Button>
            </div>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-ink-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <h3 className="font-semibold text-ink-900">Time Entries</h3>
          <Badge label={`${formatNumber(totalHours)} Total Hours`} tone="neutral" />
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-sm text-ink-500">Loading entries...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-500">No time logged yet.</div>
        ) : (
          <Table>
            <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Duration</th>
                <th className="px-6 py-3">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-sm">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-6 py-3 text-ink-900">{formatShortDate(entry.date)}</td>
                  <td className="px-6 py-3 text-ink-900">{resolveUserName(entry.userId)}</td>
                  <td className="px-6 py-3 text-ink-900 font-medium">
                    {Math.floor(entry.minutes / 60)}h {entry.minutes % 60}m
                  </td>
                  <td className="px-6 py-3 text-ink-500">{entry.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
