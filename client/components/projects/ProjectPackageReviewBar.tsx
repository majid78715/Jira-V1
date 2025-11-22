"use client";

import { useMemo, useState } from "react";
import { Project, ProjectPackageReturnTarget, User } from "../../lib/types";
import { apiRequest, ApiError } from "../../lib/apiClient";
import {
  PACKAGE_RETURN_OPTIONS,
  buildPackageTimeline,
  canEditPackageStage,
  packageReturnLabel,
  resolveProjectPackageStage
} from "../../lib/projectPackage";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";

interface ProjectPackageReviewBarProps {
  project: Project;
  currentUser: User;
  onActionComplete: () => Promise<void>;
  hasTasks?: boolean;
  hasAssignedDeveloper?: boolean;
  hasCompletedTask?: boolean;
}

export function ProjectPackageReviewBar({
  project,
  currentUser,
  onActionComplete,
  hasTasks = true,
  hasAssignedDeveloper = false,
  hasCompletedTask = false
}: ProjectPackageReviewBarProps) {
  const stage = resolveProjectPackageStage(project);
  const timeline = useMemo(() => buildPackageTimeline(project), [project]);
  const canAct =
    Boolean(stage) && project.packageStatus !== "ACTIVE" && canEditPackageStage(project, currentUser);
  
  const hasDeveloper = useMemo(() => {
    return project.coreTeamMembers?.some(
      (m) => m.role === "DEVELOPER" || m.role === "ENGINEER"
    );
  }, [project.coreTeamMembers]);
  const requiresTasks = stage?.id === "PM" || stage?.id === "PM_FINAL";

  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackTarget, setSendBackTarget] = useState<ProjectPackageReturnTarget>("PM");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sentBackInfo =
    project.packageStatus === "SENT_BACK"
      ? {
          label: packageReturnLabel(project.packageSentBackTo ?? "PM"),
          reason: project.packageSentBackReason ?? "Awaiting updates"
        }
      : null;

  const advanceLabel =
    stage?.id === "PM"
      ? "Start Project"
      : stage?.status === "PM_ACTIVATE"
        ? "Approve & Start"
        : "Complete Project";

  const handleAdvance = async () => {
    if (!stage) {
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      setStatusMessage(null);
      const endpoint =
        stage.status === "PM_ACTIVATE"
          ? `/projects/${project.id}/activate`
          : `/projects/${project.id}/package/submit`;
      await apiRequest(endpoint, { method: "POST" });
      setStatusMessage(stage.status === "PM_ACTIVATE" ? "Project activated." : "Advanced to next stage.");
      setSendBackOpen(false);
      setReason("");
      await onActionComplete();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to advance package.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendBack = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Reason is required to send back the package.");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      setStatusMessage(null);
      await apiRequest(`/projects/${project.id}/package/send-back`, {
        method: "POST",
        body: JSON.stringify({ targetStage: sendBackTarget, reason: trimmed })
      });
      setStatusMessage(`Sent back to ${packageReturnLabel(sendBackTarget)}.`);
      setSendBackOpen(false);
      setReason("");
      await onActionComplete();
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to send the package back.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-ink-100 bg-white p-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[9px] uppercase tracking-wide text-ink-400">Package workflow</p>
          <p className="text-xs font-semibold text-ink-900">
            {project.packageStatus === "ACTIVE"
              ? "Activated"
              : stage
              ? `${stage.label} stage`
              : "Awaiting owner"}
          </p>
          <p className="text-[10px] text-ink-500">
            {stage?.description ?? "Package is ready for standard execution."}
          </p>
        </div>
        {sentBackInfo && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            <p className="font-semibold">Sent back to {sentBackInfo.label}</p>
            <p className="text-[10px]">{sentBackInfo.reason}</p>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {timeline.map((item, index) => (
          <div
            key={item.id}
            className={`flex min-w-[80px] flex-1 items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] ${
              item.status === "done"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : item.status === "active"
                ? "border-brand-200 bg-brand-gradient/10 text-brand-700"
                : "border-ink-100 bg-ink-50 text-ink-400"
            }`}
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-semibold text-ink-600 shadow">
              {index + 1}
            </span>
            <div>
              <p className="font-semibold">
                {item.label}
                {item.id === "PJM" && project.deliveryManager && (
                  <span className="ml-1 font-normal text-ink-500">
                    ({project.deliveryManager.profile.firstName} {project.deliveryManager.profile.lastName})
                  </span>
                )}
              </p>
              {item.isSentBack && <p className="text-[9px] text-amber-700">Needs updates</p>}
            </div>
          </div>
        ))}
      </div>
      {canAct && stage && (
        <div className="sticky top-16 mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-100 bg-brand-gradient/5 px-2 py-1.5">
          <div className="space-y-0.5 text-[10px]">
            {error && <p className="text-red-600">{error}</p>}
            {statusMessage && <p className="text-emerald-600">{statusMessage}</p>}
            {requiresTasks && !hasTasks && stage.id === "PM" && <p className="text-amber-600">Add at least one task to start the project.</p>}
            {requiresTasks && !hasTasks && stage.id === "PM_FINAL" && <p className="text-amber-600">Add tasks before starting.</p>}
            {stage.id === "PJM" && !hasAssignedDeveloper && (
              <p className="text-amber-600">Assign a developer to proceed.</p>
            )}
            {stage.id === "PJM" && hasTasks && !hasCompletedTask && (
              <p className="text-amber-600">Complete a task before submitting.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" variant="ghost" onClick={() => setSendBackOpen((prev) => !prev)} disabled={submitting} className="text-[10px] py-1 h-6 px-2">
              Send Back
            </Button>
            <Button 
              type="button" 
              onClick={handleAdvance} 
              disabled={
                submitting ||
                (requiresTasks && !hasTasks) ||
                (stage.id === "PJM" && (!hasAssignedDeveloper || !hasCompletedTask))
              } 
              title={
                requiresTasks && !hasTasks
                  ? "Add tasks before advancing"
                  : stage.id === "PJM" && (!hasAssignedDeveloper || !hasCompletedTask)
                    ? "Assign a developer and complete a task before advancing"
                  : undefined
              } 
              className="text-[10px] py-1 h-6 px-2"
            >
              {submitting ? "Processing..." : advanceLabel}
            </Button>
          </div>
        </div>
      )}
      {canAct && sendBackOpen && (
        <div className="mt-3 space-y-2 rounded-xl border border-ink-100 bg-ink-50 p-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Send back to</p>
            <Select value={sendBackTarget} onChange={(e) => setSendBackTarget(e.target.value as ProjectPackageReturnTarget)} className="text-xs py-1">
              {PACKAGE_RETURN_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Reason</p>
            <textarea
              className="mt-1 w-full rounded-md border border-ink-200 px-2 py-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide context for the owner"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setSendBackOpen(false)} disabled={submitting} size="sm">
              Cancel
            </Button>
            <Button type="button" onClick={handleSendBack} disabled={submitting || !reason.trim()} size="sm">
              {submitting ? "Sending..." : "Confirm send back"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
