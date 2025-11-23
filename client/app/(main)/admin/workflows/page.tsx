"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PageShell } from "../../../../components/layout/PageShell";
import { Card } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { Modal } from "../../../../components/ui/Modal";
import { Badge } from "../../../../components/ui/Badge";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";
import { ApiError } from "../../../../lib/apiClient";
import {
  Role,
  RoleDefinition,
  WorkflowApproverDynamic,
  WorkflowApproverType,
  WorkflowDefinition,
  WorkflowEntityType
} from "../../../../lib/types";
import { createWorkflowDefinition, fetchWorkflowDefinitions } from "../../../../features/workflow/api";
import { fetchRoles } from "../../../../features/admin/api";

type StepFormState = {
  name: string;
  approverType: WorkflowApproverType;
  approverRole: Role;
  dynamicApproverType: WorkflowApproverDynamic;
  requiresCommentOnReject: boolean;
  requiresCommentOnSendBack: boolean;
};

const dynamicApproverOptions: { value: WorkflowApproverDynamic; label: string }[] = [
  { value: "ENGINEERING_TEAM", label: "Engineering team" },
  { value: "TASK_PROJECT_MANAGER", label: "Task project manager" },
  { value: "TASK_PM", label: "Task PM" },
  { value: "TASK_ASSIGNED_DEVELOPER", label: "Assigned developer" }
];

const entityTypeOptions: WorkflowEntityType[] = ["TASK"];

function createStepState(): StepFormState {
  return {
    name: "",
    approverType: "ROLE",
    approverRole: "PROJECT_MANAGER",
    dynamicApproverType: "TASK_PROJECT_MANAGER",
    requiresCommentOnReject: true,
    requiresCommentOnSendBack: true
  };
}

export default function AdminWorkflowsPage() {
  const { user, loading: sessionLoading } = useCurrentUser({
    redirectTo: "/login"
  });
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState("");
  const [entityType, setEntityType] = useState<WorkflowEntityType>("TASK");
  const [steps, setSteps] = useState<StepFormState[]>([createStepState()]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const canCreateWorkflow = (user?.permittedModules?.includes("createWorkflow") ?? false) || user?.role === "SUPER_ADMIN" || user?.role === "PM";
  const hasAccess = canCreateWorkflow;

  const loadRoles = useCallback(async () => {
    try {
      const list = await fetchRoles();
      setRoles(list);
    } catch (error) {
      console.error("Failed to load roles", error);
    }
  }, []);

  const loadDefinitions = useCallback(async () => {
    try {
      setLoading(true);
      setListError(null);
      const list = await fetchWorkflowDefinitions("TASK");
      setDefinitions(list);
    } catch (error) {
      const apiError = error as ApiError;
      setListError(apiError?.message ?? "Unable to load workflows.");
    } finally {
      setLoading(false);
    }
  }, []);

  const resetForm = () => {
    setFormName("");
    setEntityType("TASK");
    setSteps([createStepState()]);
    setFeedback(null);
  };

  const handleOpenModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
  };

  const handleStepChange = (index: number, partial: Partial<StepFormState>) => {
    setSteps((prev) =>
      prev.map((step, idx) => {
        if (idx !== index) {
          return step;
        }
        const next: StepFormState = { ...step, ...partial };
        if (partial.approverType === "ROLE" && !partial.approverRole) {
          next.approverRole = step.approverRole ?? "ENGINEER";
        }
        if (partial.approverType === "DYNAMIC" && !partial.dynamicApproverType) {
          next.dynamicApproverType = "ENGINEERING_TEAM";
        }
        return next;
      })
    );
  };

  const handleAddStep = () => {
    setSteps((prev) => [...prev, createStepState()]);
  };

  const handleRemoveStep = (index: number) => {
    setSteps((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  const handleCreateWorkflow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formName.trim()) {
      setFeedback("Workflow name is required.");
      return;
    }
    if (!steps.length) {
      setFeedback("Add at least one step.");
      return;
    }
    const invalidStep = steps.find(
      (step) =>
        !step.name.trim() ||
        (step.approverType === "ROLE" && !step.approverRole) ||
        (step.approverType === "DYNAMIC" && !step.dynamicApproverType)
    );
    if (invalidStep) {
      setFeedback("Complete all required step fields.");
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await createWorkflowDefinition({
        name: formName.trim(),
        entityType,
        steps: steps.map((step, index) => ({
          name: step.name.trim(),
          order: index + 1,
          approverType: step.approverType,
          approverRole: step.approverType === "ROLE" ? step.approverRole : undefined,
          dynamicApproverType: step.approverType === "DYNAMIC" ? step.dynamicApproverType : undefined,
          requiresCommentOnReject: step.requiresCommentOnReject,
          requiresCommentOnSendBack: step.requiresCommentOnSendBack
        }))
      });
      setModalOpen(false);
      resetForm();
      await loadDefinitions();
    } catch (error) {
      const apiError = error as ApiError;
      setFeedback(apiError?.message ?? "Unable to create workflow.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (user) {
      void loadDefinitions();
      void loadRoles();
    }
  }, [user, loadDefinitions, loadRoles]);

  const pageHelper = loading ? "Loading workflows..." : `${definitions.length} definition(s)`;

  if (sessionLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading access...</div>;
  }

  if (!hasAccess) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Access Denied</div>;
  }

  return (
    <PageShell
      title="Admin · Workflows"
      subtitle="Configure approval workflows"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-ink-900">Workflow Definitions</p>
            <p className="text-sm text-ink-500">Manage approval logic for vendor and engineering flows.</p>
          </div>
          {canCreateWorkflow && <Button onClick={handleOpenModal}>Create Workflow</Button>}
        </div>
        <Card title="Definitions" helperText={pageHelper}>
          {loading ? (
            <p className="text-sm text-ink-500">Loading workflows...</p>
          ) : listError ? (
            <p className="text-sm text-ink-500">{listError}</p>
          ) : definitions.length === 0 ? (
            <p className="text-sm text-ink-500">No workflows configured yet.</p>
          ) : (
            <div className="space-y-4">
              {definitions.map((definition) => (
                <div key={definition.id} className="rounded-xl border border-ink-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-base font-semibold text-ink-900">{definition.name}</p>
                      <p className="text-xs uppercase tracking-wide text-ink-400">{definition.entityType}</p>
                    </div>
                    <Badge tone={definition.isActive ? "success" : "neutral"} label={definition.isActive ? "Active" : "Inactive"} />
                  </div>
                  {definition.description && (
                    <p className="mt-2 text-sm text-ink-600">{definition.description}</p>
                  )}
                  <div className="mt-4 space-y-2">
                    {definition.steps.map((step) => (
                      <div key={step.id} className="rounded-lg border border-ink-100 bg-ink-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-ink-900">
                            Step {step.order}: {step.name}
                          </p>
                          <span className="text-xs text-ink-500">
                            {step.approverType === "DYNAMIC"
                              ? formatDynamicLabel(step.dynamicApproverType)
                              : step.approverRole ?? step.assigneeRole}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-ink-500">
                          Comment on reject: {step.requiresCommentOnReject ? "Required" : "Optional"} · Comment on send back:{" "}
                          {step.requiresCommentOnSendBack ? "Required" : "Optional"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <Modal open={modalOpen} onClose={handleCloseModal} title="Create Workflow Definition">
        <form className="space-y-4" onSubmit={handleCreateWorkflow}>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-700">Workflow name</label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Task estimation workflow" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-700">Entity type</label>
            <Select value={entityType} onChange={(e) => setEntityType(e.target.value as WorkflowEntityType)}>
              {entityTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={`step-${index}`} className="rounded-xl border border-ink-100 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink-900">Step {index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-xs"
                    disabled={steps.length === 1}
                    onClick={() => handleRemoveStep(index)}
                  >
                    Remove
                  </Button>
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">Name</label>
                    <Input
                      value={step.name}
                      onChange={(e) => handleStepChange(index, { name: e.target.value })}
                      placeholder="Vendor manager review"
                      required
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">Approver type</label>
                      <Select
                        value={step.approverType}
                        onChange={(e) => handleStepChange(index, { approverType: e.target.value as WorkflowApproverType })}
                      >
                        <option value="ROLE">Role</option>
                        <option value="DYNAMIC">Dynamic</option>
                      </Select>
                    </div>
                    {step.approverType === "ROLE" ? (
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">Assignee Role</label>
                        <Select
                          value={step.approverRole}
                          onChange={(e) => handleStepChange(index, { approverRole: e.target.value as Role })}
                        >
                          {roles.map((role) => (
                            <option key={role.id} value={role.name}>
                              {role.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ) : (
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-400">Dynamic approver</label>
                        <Select
                          value={step.dynamicApproverType}
                          onChange={(e) =>
                            handleStepChange(index, { dynamicApproverType: e.target.value as WorkflowApproverDynamic })
                          }
                        >
                          {dynamicApproverOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-ink-200 text-brand-600 focus:ring-brand-200"
                        checked={step.requiresCommentOnReject}
                        onChange={(e) => handleStepChange(index, { requiresCommentOnReject: e.target.checked })}
                      />
                      Requires comment on reject
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-ink-200 text-brand-600 focus:ring-brand-200"
                        checked={step.requiresCommentOnSendBack}
                        onChange={(e) => handleStepChange(index, { requiresCommentOnSendBack: e.target.checked })}
                      />
                      Requires comment on send back
                    </label>
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" variant="secondary" className="w-full" onClick={handleAddStep}>
              Add Step
            </Button>
          </div>
          {feedback && <p className="text-sm text-ink-500">{feedback}</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving..." : "Save workflow"}
          </Button>
        </form>
      </Modal>
    </PageShell>
  );
}

function formatDynamicLabel(value?: WorkflowApproverDynamic) {
  if (!value) {
    return "Dynamic approver";
  }
  return value
    .toLowerCase()
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}
