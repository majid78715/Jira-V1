"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageShell } from "../../../../components/layout/PageShell";
import { Card } from "../../../../components/ui/Card";
import { Tabs } from "../../../../components/ui/Tabs";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Table } from "../../../../components/ui/Table";
import { DatePicker } from "../../../../components/ui/DatePicker";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../../lib/apiClient";
import { formatCurrency, formatDate, formatNumber, formatShortDate } from "../../../../lib/format";
import {
  ActivityLog,
  Assignment,
  Project,
  Task,
  TaskWorkflowSummary,
  User,
  WorkflowActionType
} from "../../../../lib/types";
import { CommentsPanel } from "../../../../components/collaboration/CommentsPanel";
import { AttachmentsPanel } from "../../../../components/collaboration/AttachmentsPanel";
import { ActivityFeed } from "../../../../components/collaboration/ActivityFeed";
import { TimeLogPanel, GitLabEntry } from "../../../../components/collaboration/TimeLogPanel";

interface TaskDetailResponse {
  task: Task;
  project: Project;
  assignments: Assignment[];
  activity: ActivityLog[];
  subtasks: Task[];
  workflow: TaskWorkflowSummary | null;
}

interface DevelopersResponse {
  users: User[];
}

const initialAssignmentForm = {
  developerId: "",
  note: ""
};

export default function TaskDetailPage() {
  const params = useParams<{ taskId: string }>();
  const router = useRouter();
  const taskId = Array.isArray(params?.taskId) ? params?.taskId[0] : params?.taskId;
  const { user, loading: sessionLoading } = useCurrentUser({ redirectTo: "/login" });
  const [detail, setDetail] = useState<TaskDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [assignmentForm, setAssignmentForm] = useState(initialAssignmentForm);
  const [actionLoading, setActionLoading] = useState(false);
  const [developers, setDevelopers] = useState<User[]>([]);
  const [workflowActionLoading, setWorkflowActionLoading] = useState(false);
  const [estimateForm, setEstimateForm] = useState({
    quantity: "",
    unit: "HOURS",
    notes: "",
    confidence: "MEDIUM"
  });
  const [finalForm, setFinalForm] = useState({
    plannedStartDate: "",
    note: ""
  });
  const [workflowComment, setWorkflowComment] = useState("");
  const [gitlabEntries, setGitlabEntries] = useState<GitLabEntry[]>([]);
  const [gitlabForm, setGitlabForm] = useState({ description: "", code: "" });
  const [subtaskForm, setSubtaskForm] = useState({ title: "", description: "", assigneeUserId: "" });
  const [showSubtaskForm, setShowSubtaskForm] = useState(true);

  const canRequestAssignment = user && user.role === "PROJECT_MANAGER";
  const canApproveAssignment = user && user.role === "PROJECT_MANAGER";
  const canCreateSubtask = user && (user.role === "PROJECT_MANAGER" || user.role === "PM");

  const loadTask = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiRequest<TaskDetailResponse>(`/tasks/${taskId}`);
      setDetail(response);
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to load task.");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const loadDevelopers = useCallback(async () => {
    try {
      const data = await apiRequest<DevelopersResponse>("/team/developers");
      setDevelopers(data.users ?? []);
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to load developers.");
    }
  }, []);

  useEffect(() => {
    if (!user || !taskId) return;
    void loadTask();
    if (user.role === "PROJECT_MANAGER" || user.role === "PM") {
      void loadDevelopers();
    }
  }, [user, taskId, loadTask, loadDevelopers]);

  const developerLookup = useMemo(() => {
    const map = new Map<string, User>();
    developers.forEach((dev) => map.set(dev.id, dev));
    return map;
  }, [developers]);

  const workflow = detail?.workflow ?? null;
  const activeStep = workflow?.instance.steps.find((step) => step.status === "ACTIVE");
  const finalStepId = workflow?.definition.steps[workflow.definition.steps.length - 1]?.id;
  const isFinalStepActive = Boolean(activeStep && finalStepId && activeStep.stepId === finalStepId && user?.role === "PM");
  const canSubmitEstimate = Boolean(user && user.role === "PM");
  const estimationStatus = detail?.task.estimation?.status ?? "NOT_SUBMITTED";
  const allowEstimateForm =
    canSubmitEstimate && (!detail?.task.estimation || ["CHANGES_REQUESTED", "REJECTED"].includes(estimationStatus));
  const canActOnWorkflow = Boolean(activeStep && user?.role === activeStep.assigneeRole && !isFinalStepActive);

  useEffect(() => {
    setWorkflowComment("");
  }, [activeStep?.stepId]);

  const currentStepDefinition = workflow?.definition.steps.find((step) => step.id === activeStep?.stepId);
  const requiresRejectComment = currentStepDefinition?.requiresCommentOnReject ?? false;
  const requiresSendBackComment = currentStepDefinition?.requiresCommentOnSendBack ?? false;
  const commentRequirementActions: string[] = [];
  if (requiresSendBackComment) {
    commentRequirementActions.push("Send back");
  }
  if (requiresRejectComment) {
    commentRequirementActions.push("Reject");
  }
  const workflowCommentRequirement = commentRequirementActions.length
    ? `Comment required for ${commentRequirementActions.join(" & ")}.`
    : null;
  const workflowCommentValue = workflowComment.trim();

  const resolveUserLabel = (id: string) => {
    if (!id) return "-";
    if (detail?.task.createdById === id) {
      return "Creator";
    }
    const dev = developerLookup.get(id);
    if (dev) {
      return `${dev.profile.firstName} ${dev.profile.lastName}`;
    }
    return `User ${id.slice(0, 6)}`;
  };

  const formatDateTime = (value?: string) =>
    formatDate(value, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const formatWorkflowStatus = (status?: string) => {
    if (!status) return "";
    return status
      .toLowerCase()
      .split("_")
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(" ");
  };
  const workflowTone = (status: string): "success" | "neutral" | "warning" => {
    if (["APPROVED", "COMPLETED"].includes(status)) return "success";
    if (["REJECTED", "CHANGES_REQUESTED"].includes(status)) return "warning";
    return "neutral";
  };
  const formatScheduleWindow = (start?: string | null, end?: string | null) => {
    const parse = (value?: string | null) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };
    const startDate = parse(start);
    const endDate = parse(end);
    if (!startDate && !endDate) return "Not scheduled";
    if (startDate && !endDate) return `${formatShortDate(startDate)} → TBD`;
    if (!startDate && endDate) return `TBD → ${formatShortDate(endDate)}`;
    return `${formatShortDate(startDate)} → ${formatShortDate(endDate)}`;
  };
  const formatDynamicApprover = (value: string | undefined) => {
    if (!value) return "";
    return value
      .toLowerCase()
      .split("_")
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(" ");
  };

  const handleRequestAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskId || !canRequestAssignment) return;
    try {
      setActionLoading(true);
      await apiRequest("/assignments", {
        method: "POST",
        body: JSON.stringify({
          taskId,
          developerId: assignmentForm.developerId,
          note: assignmentForm.note || undefined
        })
      });
      setAssignmentForm(initialAssignmentForm);
      setStatus("Assignment requested.");
      router.push("/projects");
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to request assignment.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignmentAction = async (path: string, payload?: Record<string, unknown>) => {
    try {
      setActionLoading(true);
      await apiRequest(path, {
        method: "POST",
        body: payload ? JSON.stringify(payload) : undefined
      });
      await loadTask();
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to update assignment.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitEstimate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskId) return;
    try {
      setWorkflowActionLoading(true);
      await apiRequest(`/tasks/${taskId}/estimate`, {
        method: "POST",
        body: JSON.stringify({
          quantity: Number(estimateForm.quantity),
          unit: estimateForm.unit,
          notes: estimateForm.notes || undefined,
          confidence: estimateForm.confidence
        })
      });
      setEstimateForm({ quantity: "", unit: "HOURS", notes: "", confidence: "MEDIUM" });
      setStatus("Estimate submitted.");
      await loadTask();
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to submit estimate.");
    } finally {
      setWorkflowActionLoading(false);
    }
  };

  const handleWorkflowAction = async (action: WorkflowActionType) => {
    if (!taskId) return;
    const trimmedComment = workflowComment.trim();
    const commentRequired =
      (action === "REJECT" && requiresRejectComment) ||
      (action === "SEND_BACK" && requiresSendBackComment);
    if (commentRequired && !trimmedComment) {
      setStatus("Comment is required for this action.");
      return;
    }
    try {
      setWorkflowActionLoading(true);
      await apiRequest(`/workflows/tasks/${taskId}/actions`, {
        method: "POST",
        body: JSON.stringify({ action, comment: trimmedComment || undefined })
      });
      setStatus(`Workflow action ${action.toLowerCase()} complete.`);
      setWorkflowComment("");
      await loadTask();
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to process workflow action.");
    } finally {
      setWorkflowActionLoading(false);
    }
  };

  const handleFinalApproval = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskId || !finalForm.plannedStartDate) return;
    try {
      setWorkflowActionLoading(true);
      const plannedStartDate = `${finalForm.plannedStartDate}T09:00:00`;
      await apiRequest(`/tasks/${taskId}/final-approve-and-start`, {
        method: "POST",
        body: JSON.stringify({ plannedStartDate, note: finalForm.note || undefined })
      });
      setFinalForm({ plannedStartDate: "", note: "" });
      setStatus("Task approved and scheduled.");
      await loadTask();
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to finalize approval.");
    } finally {
      setWorkflowActionLoading(false);
    }
  };

  const handleCreateSubtask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskId || !subtaskForm.title.trim()) return;
    try {
      setActionLoading(true);
      await apiRequest(`/tasks/${taskId}/subtasks`, {
        method: "POST",
        body: JSON.stringify({
          title: subtaskForm.title.trim(),
          description: subtaskForm.description.trim() || undefined,
          assigneeUserId: subtaskForm.assigneeUserId || undefined
        })
      });
      setSubtaskForm({ title: "", description: "", assigneeUserId: "" });
      setStatus("Subtask created.");
      await loadTask();
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to create subtask.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleGitLabSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!gitlabForm.description || !gitlabForm.code) return;

    const newEntry: GitLabEntry = {
      id: Date.now().toString(),
      description: gitlabForm.description,
      code: gitlabForm.code,
      createdAt: new Date().toISOString(),
      createdBy: user ? `${user.profile.firstName} ${user.profile.lastName}` : "Unknown User"
    };

    setGitlabEntries((prev) => [newEntry, ...prev]);
    setGitlabForm({ description: "", code: "" });
    setStatus("GitLab code snippet added.");
  };

  if (sessionLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading workspace...</div>;
  }

  if (!taskId) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Task ID missing.</div>;
  }

  let overviewContent: React.ReactNode;
  if (!detail) {
    overviewContent = <p className="text-sm text-ink-500">Gathering task info...</p>;
  } else {
    const estimationHours = detail.task.estimationHours ?? detail.task.budgetHours;
    const assignmentPlan = detail.task.assignmentPlan ?? [];
    const costLabel = detail.task.costAmount != null ? formatCurrency(detail.task.costAmount) : "Cost pending";
    const statusTone: "success" | "warning" | "neutral" =
      detail.task.status === "IN_PROGRESS" ? "success" : detail.task.status === "BLOCKED" ? "warning" : "neutral";
    overviewContent = (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Status</p>
            <Badge tone={statusTone} label={formatWorkflowStatus(detail.task.status)} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Item Type</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge
                tone={detail.task.itemType === "BUG" ? "warning" : (detail.task.itemType === "NEW_FEATURE" || detail.task.itemType === "EXISTING_FEATURE") ? "success" : "neutral"}
                label={formatWorkflowStatus(detail.task.itemType)}
              />
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Effort</p>
            <p className="text-sm text-ink-900">{formatNumber(estimationHours)} hours</p>
            <p className="text-xs text-ink-500">{costLabel}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Schedule</p>
            <p className="text-sm text-ink-900">{formatScheduleWindow(detail.task.plannedStartDate, detail.task.dueDate)}</p>
            {detail.task.reporterUserId && (
              <p className="text-xs text-ink-500">Reporter {resolveUserLabel(detail.task.reporterUserId)}</p>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-400">Description</p>
          <p className="text-sm text-ink-900">{detail.task.description || "No description."}</p>
        </div>
        {(detail.task.itemType === "NEW_FEATURE" && detail.task.typeMeta?.newFeature?.userStory) && (
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">User Story</p>
            <p className="text-sm text-ink-900 whitespace-pre-wrap">{detail.task.typeMeta.newFeature.userStory}</p>
          </div>
        )}
        {(detail.task.itemType === "EXISTING_FEATURE" && detail.task.typeMeta?.existingFeature?.userStory) && (
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">User Story</p>
            <p className="text-sm text-ink-900 whitespace-pre-wrap">{detail.task.typeMeta.existingFeature.userStory}</p>
          </div>
        )}
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-400">Assigned team (ENG)</p>
          {assignmentPlan.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {assignmentPlan.map((entry, index) => (
                <span key={`${entry.userId}-${index}`} className="rounded-full bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-600">
                  {resolveUserLabel(entry.userId)} · {formatNumber(entry.hours)}h
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-500">No core team assigned.</p>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-400">Required skills</p>
          <div className="flex flex-wrap gap-2">
            {detail.task.requiredSkills.length === 0 ? (
              <span className="text-sm text-ink-500">Not specified.</span>
            ) : (
              detail.task.requiredSkills.map((skill) => (
                <span key={skill} className="rounded-full bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-600">
                  {skill}
                </span>
              ))
            )}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-900">Assignments</p>
            <p className="text-xs text-ink-400">
              Project:{" "}
              <Link href={`/projects/${detail.project.id}`} className="text-brand-600 hover:underline">
                {detail.project.name}
              </Link>
            </p>
          </div>
          {detail.assignments.length === 0 ? (
            <p className="text-sm text-ink-500">No assignment requests yet.</p>
          ) : (
            <Table>
              <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3">Developer</th>
                  <th className="px-4 py-3">Requested By</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-sm">
                {detail.assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900">{resolveUserLabel(assignment.developerId)}</p>
                      <p className="text-xs text-ink-400">{assignment.developerId}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-ink-700">{resolveUserLabel(assignment.requestedById)}</p>
                      <p className="text-xs text-ink-400">{formatShortDate(assignment.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={assignment.status === "APPROVED" || assignment.status === "COMPLETED" ? "success" : assignment.status === "PENDING" || assignment.status === "SUBMITTED" ? "warning" : "neutral"} label={assignment.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      {assignment.requestedMessage || assignment.cancelReason || assignment.completionNote || "—"}
                    </td>
                    <td className="px-4 py-3 space-y-2">
                      {canApproveAssignment && ["APPROVED", "SUBMITTED"].includes(assignment.status) && (
                        <Button
                          type="button"
                          className="w-full text-xs"
                          disabled={actionLoading}
                          onClick={() => handleAssignmentAction(`/assignments/${assignment.id}/approve-completion`)}
                        >
                          Mark Complete
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        {canRequestAssignment && (
          <div className="rounded-2xl border border-dashed border-brand-200 p-4">
            <p className="mb-2 text-sm font-semibold text-ink-900">Request assignment</p>
            <form onSubmit={handleRequestAssignment} className="grid gap-3 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">Developer</label>
                <select
                  className="w-full rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  value={assignmentForm.developerId}
                  onChange={(e) => setAssignmentForm((prev) => ({ ...prev, developerId: e.target.value }))}
                  required
                >
                  <option value="">Select developer</option>
                  {developers.map((developer) => (
                    <option key={developer.id} value={developer.id}>
                      {developer.profile.firstName} {developer.profile.lastName} ({developer.email})
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-right">
                  <Link href="/team/developers" className="text-xs text-brand-600 hover:underline">
                    + Create new developer
                  </Link>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">Note</label>
                <Input value={assignmentForm.note} onChange={(e) => setAssignmentForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Context for the PM" />
              </div>
              <div className="lg:col-span-2 flex justify-end">
                <Button type="submit" disabled={actionLoading}>
                  {actionLoading ? "Submitting..." : "Submit request"}
                </Button>
              </div>
            </form>
          </div>
        )}
        <div className="rounded-2xl border border-ink-100 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink-900">Subtasks</p>
              {canCreateSubtask && <p className="text-[11px] text-ink-500">Create and assign subtasks below</p>}
            </div>
            {canCreateSubtask && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowSubtaskForm((prev) => !prev)}
                className="text-xs"
              >
                {showSubtaskForm ? "Hide form" : "+ Add subtask"}
              </Button>
            )}
          </div>
          {detail.subtasks && detail.subtasks.length ? (
            <div className="mt-3 space-y-2">
              {detail.subtasks.map((subtask) => (
                <div key={subtask.id} className="flex items-center justify-between rounded-lg border border-ink-100 p-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{subtask.title}</p>
                    <p className="text-xs text-ink-500">
                      {formatWorkflowStatus(subtask.status)} · Assignee {resolveUserLabel(subtask.assigneeUserId ?? "")}
                    </p>
                  </div>
                  <Link href={`/tasks/${subtask.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                    View
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-500">No subtasks yet.</p>
          )}
          {canCreateSubtask && showSubtaskForm && (
            <form onSubmit={handleCreateSubtask} className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">Title</label>
                <Input
                  value={subtaskForm.title}
                  onChange={(e) => setSubtaskForm((prev) => ({ ...prev, title: e.target.value }))}
                  required
                  placeholder="Subtask title"
                />
              </div>
              <div className="lg:col-span-1">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">Assignee</label>
                <select
                  className="w-full rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  value={subtaskForm.assigneeUserId}
                  onChange={(e) => setSubtaskForm((prev) => ({ ...prev, assigneeUserId: e.target.value }))}
                >
                  <option value="">Unassigned</option>
                  {developers.map((developer) => (
                    <option key={developer.id} value={developer.id}>
                      {developer.profile.firstName} {developer.profile.lastName} ({developer.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-1">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">Description</label>
                <Input
                  value={subtaskForm.description}
                  onChange={(e) => setSubtaskForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional details"
                />
              </div>
              <div className="lg:col-span-3 flex justify-end">
                <Button type="submit" disabled={actionLoading}>
                  {actionLoading ? "Creating..." : "Add subtask"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  const commentsContent = (
    <CommentsPanel 
      entityId={taskId} 
      entityType="TASK" 
      resolveUserName={resolveUserLabel} 
      gitlabEntries={gitlabEntries}
    />
  );

  const attachmentsContent = <AttachmentsPanel entityId={taskId} entityType="TASK" />;

  const activityContent = (
    <ActivityFeed entityId={taskId} entityType="TASK" resolveUserName={resolveUserLabel} />
  );

  const gitlabContent = (
    <div className="space-y-8">
      <div className="rounded-xl border border-ink-100 bg-white p-6 shadow-sm">
        <div className="mb-6 border-b border-ink-100 pb-4">
          <h3 className="text-lg font-semibold text-ink-900">Add GitLab Code Snippet</h3>
          <p className="text-sm text-ink-500">Submit code changes and descriptions for review.</p>
        </div>
        <form onSubmit={handleGitLabSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-500">
              Description
            </label>
            <Input
              value={gitlabForm.description}
              onChange={(e) => setGitlabForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Briefly describe the code changes..."
              required
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-500">
              Code
            </label>
            <div className="relative rounded-md border border-ink-200 shadow-sm">
              <textarea
                className="block w-full rounded-md border-0 bg-ink-50 px-4 py-3 text-sm font-mono text-ink-900 placeholder:text-ink-400 focus:ring-2 focus:ring-inset focus:ring-brand-500 sm:text-sm sm:leading-6 min-h-[200px]"
                value={gitlabForm.code}
                onChange={(e) => setGitlabForm((prev) => ({ ...prev, code: e.target.value }))}
                placeholder="// Paste your code here..."
                required
                spellCheck={false}
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={!gitlabForm.description || !gitlabForm.code}>
              Submit Code
            </Button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink-500 px-1">Submitted Snippets</h3>
        {gitlabEntries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/50 p-12 text-center">
            <p className="text-sm text-ink-500">No code snippets have been added yet.</p>
          </div>
        ) : (
          gitlabEntries.map((entry) => (
            <div key={entry.id} className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/80 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                    {entry.createdBy.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{entry.createdBy}</p>
                    <p className="text-xs text-ink-500">{formatDateTime(entry.createdAt)}</p>
                  </div>
                </div>
                <Badge label="GitLab Snippet" tone="neutral" />
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">Description</p>
                  <p className="text-sm leading-relaxed text-ink-800">{entry.description}</p>
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">Code</p>
                  <div className="relative overflow-hidden rounded-lg bg-[#0d1117] border border-ink-900/10">
                    <div className="absolute top-0 left-0 right-0 h-8 bg-[#161b22] border-b border-[#30363d] flex items-center px-4">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                        <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                        <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
                      </div>
                    </div>
                    <pre className="overflow-x-auto p-4 pt-12 text-xs font-mono text-[#c9d1d9] leading-relaxed">
                      <code>{entry.code}</code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const timeLogContent = detail ? (
    <TimeLogPanel 
      taskId={taskId} 
      projectId={detail.task.projectId} 
      currentUser={user} 
      resolveUserName={resolveUserLabel}
      gitlabEntries={gitlabEntries}
    />
  ) : null;

  const showWorkflowTab = user.role !== "DEVELOPER";

  const workflowContent = !detail ? (
    <p className="text-sm text-ink-500">Loading workflow.</p>
  ) : (
    <div className="space-y-6">
      <div className="rounded-xl border border-ink-100 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-ink-900">Estimate</p>
            {detail.task.estimation ? (
              <>
                <p className="text-sm text-ink-700">
                  {detail.task.estimation.quantity} {detail.task.estimation.unit?.toLowerCase()}
                </p>
                <p className="text-xs text-ink-400">Submitted {formatDateTime(detail.task.estimation.submittedAt)}</p>
              </>
            ) : (
              <p className="text-sm text-ink-500">No estimate submitted yet.</p>
            )}
          </div>
          <Badge
            label={formatWorkflowStatus(estimationStatus)}
            tone={
              estimationStatus === "APPROVED"
                ? "success"
                : estimationStatus === "UNDER_REVIEW"
                  ? "neutral"
                  : "warning"
            }
          />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Planned Start</p>
            <p className="text-sm text-ink-900">{formatDateTime(detail.task.plannedStartDate)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Expected Completion</p>
            <p className="text-sm text-ink-900">{formatDateTime(detail.task.expectedCompletionDate)}</p>
          </div>
        </div>
      </div>
      {allowEstimateForm && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
          <p className="mb-3 text-sm font-semibold text-ink-900">Submit estimate</p>
          <form onSubmit={handleSubmitEstimate} className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">Quantity</label>
              <Input
                type="number"
                min="0"
                step="0.5"
                required
                value={estimateForm.quantity}
                onChange={(e) => setEstimateForm((prev) => ({ ...prev, quantity: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">Unit</label>
              <select
                className="w-full rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                value={estimateForm.unit}
                onChange={(e) => setEstimateForm((prev) => ({ ...prev, unit: e.target.value }))}
              >
                <option value="HOURS">Hours</option>
                <option value="DAYS">Days</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">Confidence</label>
              <select
                className="w-full rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                value={estimateForm.confidence}
                onChange={(e) => setEstimateForm((prev) => ({ ...prev, confidence: e.target.value }))}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div className="md:col-span-4">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">Notes</label>
              <Input
                value={estimateForm.notes}
                onChange={(e) => setEstimateForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Context or risks"
              />
            </div>
            <div className="md:col-span-4 flex justify-end">
              <Button type="submit" disabled={workflowActionLoading || !estimateForm.quantity}>
                {workflowActionLoading ? "Submitting..." : "Submit estimate"}
              </Button>
            </div>
          </form>
        </div>
      )}
      <div className="rounded-xl border border-ink-100 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-ink-900">Workflow timeline</p>
        {!workflow ? (
          <p className="text-sm text-ink-500">Workflow will initialize after an estimate is submitted.</p>
        ) : (
          <div className="space-y-4">
            {workflow.instance.steps.map((step) => {
              const isCurrent = activeStep?.stepId === step.stepId;
              return (
                <div key={step.stepId} className="rounded-xl border border-ink-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{step.name}</p>
                      <p className="text-xs text-ink-500">
                        {step.dynamicApproverType ? formatDynamicApprover(step.dynamicApproverType) : step.assigneeRole}
                      </p>
                    </div>
                    <Badge label={formatWorkflowStatus(step.status)} tone={workflowTone(step.status) as any} />
                  </div>
                  {step.actedAt && (
                    <p className="mt-1 text-xs text-ink-400">Last action {formatDateTime(step.actedAt)}</p>
                  )}
                  {isCurrent && (
                    <div className="mt-4 space-y-3">
                      {isFinalStepActive ? (
                        <form onSubmit={handleFinalApproval} className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">
                              Planned start date
                            </label>
                            <DatePicker
                              required
                              value={finalForm.plannedStartDate}
                              onChange={(e) => setFinalForm((prev) => ({ ...prev, plannedStartDate: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">
                              Note
                            </label>
                            <Input
                              value={finalForm.note}
                              onChange={(e) => setFinalForm((prev) => ({ ...prev, note: e.target.value }))}
                              placeholder="Optional note"
                            />
                          </div>
                          <div className="md:col-span-2 flex justify-end">
                            <Button type="submit" disabled={workflowActionLoading || !finalForm.plannedStartDate}>
                              {workflowActionLoading ? "Scheduling..." : "Approve & schedule"}
                            </Button>
                          </div>
                        </form>
                      ) : canActOnWorkflow ? (
                        <div className="space-y-3 w-full">
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">
                              Comment
                            </label>
                            <textarea
                              className="w-full rounded-lg border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                              rows={3}
                              placeholder="Add context for reviewers"
                              value={workflowComment}
                              onChange={(e) => setWorkflowComment(e.target.value)}
                            />
                            {workflowCommentRequirement && (
                              <p className="mt-1 text-xs text-ink-400">{workflowCommentRequirement}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" disabled={workflowActionLoading} onClick={() => handleWorkflowAction("APPROVE")}>
                              Approve
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={workflowActionLoading || (requiresSendBackComment && !workflowCommentValue)}
                              onClick={() => handleWorkflowAction("SEND_BACK")}
                            >
                              Send back
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={workflowActionLoading}
                              onClick={() => handleWorkflowAction("REQUEST_CHANGE")}
                            >
                              Request change
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={workflowActionLoading || (requiresRejectComment && !workflowCommentValue)}
                              onClick={() => handleWorkflowAction("REJECT")}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-ink-400">Waiting for the assigned reviewer.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <PageShell
      title={detail ? detail.task.title : "Task"}
      subtitle={detail ? detail.project.name : "Task detail"}
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      {status && <p className="mb-4 text-sm text-ink-500">{status}</p>}
      <Card helperText={detail ? `Project ${detail.project.code}` : undefined}>
        <Tabs
          tabs={[
            { id: "overview", label: "Overview", content: overviewContent },
            { id: "comments", label: "Comments", content: commentsContent },
            { id: "attachments", label: "Attachments", content: attachmentsContent },
            { id: "time-log", label: "Log Work", content: timeLogContent },
            { id: "gitlab", label: "GitLab Code Details", content: gitlabContent },
            ...(showWorkflowTab ? [{ id: "workflow", label: "Estimation & Workflow", content: workflowContent }] : []),
            { id: "activity", label: "Activity", content: activityContent }
          ]}
        />
      </Card>
    </PageShell>
  );
}
