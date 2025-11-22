"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageShell } from "../../../../components/layout/PageShell";
import { Card } from "../../../../components/ui/Card";
import { Table } from "../../../../components/ui/Table";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../../lib/apiClient";
import { formatCurrency, formatNumber, formatShortDate } from "../../../../lib/format";
import { Assignment, Task } from "../../../../lib/types";

interface AssignmentListResponse {
  assignments: Assignment[];
  tasks: Task[];
}

export default function MyTasksPage() {
  const { user, loading: sessionLoading } = useCurrentUser({
    redirectTo: "/login",
    requiredRoles: ["DEVELOPER", "ENGINEER"]
  });
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [taskMap, setTaskMap] = useState<Record<string, Task>>({});
  const [completionNotes, setCompletionNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadAssignments();
  }, [user]);

  const loadAssignments = async () => {
    try {
      setLoading(true);
      const response = await apiRequest<AssignmentListResponse>("/assignments");
      setAssignments(response.assignments ?? []);
      const map: Record<string, Task> = {};
      (response.tasks ?? []).forEach((task) => {
        map[task.id] = task;
      });
      setTaskMap(map);
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to load assignments.");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (assignment: Assignment) => {
    try {
      setCompletingId(assignment.id);
      setStatus(null);
      await apiRequest(`/assignments/${assignment.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ note: completionNotes[assignment.id] ?? "" })
      });
      setCompletionNotes((prev) => ({ ...prev, [assignment.id]: "" }));
      setStatus("Assignment completed.");
      await loadAssignments();
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to complete assignment.");
    } finally {
      setCompletingId(null);
    }
  };

  if (sessionLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading workspace...</div>;
  }

  return (
    <PageShell
      title="My Tasks"
      subtitle="Assignments approved for you"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      {status && <p className="mb-4 text-sm text-ink-500">{status}</p>}
      <Card title="Assignments" helperText={loading ? "Loading" : `${assignments.length} records`}>
        {loading ? (
          <p className="text-sm text-ink-500">Fetching your queue...</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-ink-500">No assignments yet. Check back once a PM approves your request.</p>
        ) : (
          <Table>
            <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Effort</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-sm">
              {assignments.map((assignment) => {
                const task = taskMap[assignment.taskId];
                return (
                  <tr key={assignment.id} className="hover:bg-ink-50/50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900">{task?.title ?? assignment.taskId}</p>
                      {task && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                          <Badge
                            tone={task.itemType === "BUG" ? "warning" : (task.itemType === "NEW_FEATURE" || task.itemType === "EXISTING_FEATURE") ? "success" : "neutral"}
                            label={task.itemType}
                          />
                        </div>
                      )}
                      <p className="text-xs text-ink-400">
                        Approved {assignment.approvedAt ? formatShortDate(assignment.approvedAt) : "Pending"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {task ? (
                        <>
                          <p className="text-sm text-ink-900">{formatNumber(task.estimationHours ?? task.budgetHours)}h</p>
                          <p className="text-xs text-ink-500">
                            {task.costAmount != null ? formatCurrency(task.costAmount) : "Cost TBD"}
                          </p>
                        </>
                      ) : (
                        "--"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={assignment.status === "APPROVED" ? "success" : assignment.status === "PENDING" ? "warning" : "neutral"} label={assignment.status} />
                    </td>
                    <td className="px-4 py-3 space-y-2">
                      <Link href={`/tasks/${assignment.taskId}`} className="text-sm font-medium text-brand-600 hover:underline">
                        View task
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </PageShell>
  );
}
