"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { Task, TaskPriority, User, WorkItemType } from "../../lib/types";

interface ProjectItemFormProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  team: User[];
  onCreated?: (task: Task) => void;
  parentId?: string | null;
  parentTask?: Task | null;
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function ProjectItemForm({ open, onClose, projectId, team, onCreated, parentId, parentTask }: ProjectItemFormProps) {
  const [availableTypes, setAvailableTypes] = useState<WorkItemType[]>([]);
  const [itemType, setItemType] = useState<string>("");
  const [title, setTitle] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedCompletion, setPlannedCompletion] = useState("");
  const [estimatedHours, setEstimatedHours] = useState<string>("");
  const [bugPriority, setBugPriority] = useState<TaskPriority>("HIGH");
  const [bugSteps, setBugSteps] = useState("");
  const [bugExpected, setBugExpected] = useState("");
  const [bugActual, setBugActual] = useState("");
  const [featureStory, setFeatureStory] = useState("");
  const [description, setDescription] = useState("");
  const [improvementDescription, setImprovementDescription] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }
    fetchWorkItemTypes();
    fetchAllUsers();
    resetForm();
  }, [open]);

  async function fetchAllUsers() {
    try {
      const response = await apiRequest<{ users: User[] }>("/users");
      setAllUsers(response.users || []);
    } catch (error) {
      console.error("Failed to fetch users", error);
    }
  }

  async function fetchWorkItemTypes() {
    try {
      const response = await apiRequest<WorkItemType[] | { workItemTypes: WorkItemType[] }>("/work-item-types");
      let types: WorkItemType[] = [];
      if (Array.isArray(response)) {
        types = response;
      } else if (response && "workItemTypes" in response && Array.isArray((response as any).workItemTypes)) {
        types = (response as any).workItemTypes;
      }
      setAvailableTypes(types);
      if (types.length > 0) {
        setItemType(types[0].name); // Default to first type
      }
    } catch (error) {
      console.error("Failed to fetch work item types", error);
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      return;
    }
    const accepted: File[] = [];
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`File ${file.name} exceeds the 10MB limit.`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) {
      event.target.value = "";
      return;
    }
    setAttachments((prev) => [...prev, ...accepted]);
    event.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  };

  const handleSubmit = async (shouldClose: boolean = true) => {
    if (!title.trim()) {
      setError("Please provide a title.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      
      const payload: Record<string, unknown> = {
        itemType,
        title: title.trim(),
        plannedStartDate: plannedStart || undefined,
        plannedCompletionDate: plannedCompletion || undefined,
        estimatedHours: estimatedHours ? Number(estimatedHours) : 0,
        parentId: parentId || undefined,
        assignees: assignees.map(id => ({ userId: id, hours: 0 })),
        taskFields: {
          description: description || undefined
        }
      };
      if (itemType === "BUG") {
        payload.bugFields = {
          priority: bugPriority,
          steps: bugSteps || undefined,
          expected: bugExpected || undefined,
          actual: bugActual || undefined
        };
      } else if (itemType === "NEW_FEATURE") {
        payload.newFeatureFields = {
          userStory: featureStory || undefined
        };
      } else if (itemType === "EXISTING_FEATURE") {
        payload.existingFeatureFields = {
          userStory: featureStory || undefined
        };
      } else if (itemType === "IMPROVEMENT") {
        payload.improvementFields = {
          description: improvementDescription || undefined
        };
      }
      const response = await apiRequest<{ task: Task }>(`/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (attachments.length) {
        await uploadAttachments(response.task.id);
      }
      onCreated?.(response.task);
      if (shouldClose) {
        handleClose();
      } else {
        resetForm();
      }
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to create item.");
    } finally {
      setSubmitting(false);
    }
  };

  const uploadAttachments = async (entityId: string) => {
    for (const file of attachments) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityId", entityId);
      formData.append("entityType", "TASK");
      await apiRequest("/files", { method: "POST", body: formData });
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const safeTeam = team || [];
  // Combine team and allUsers, removing duplicates
  const assignableUsers = [...safeTeam];
  allUsers.forEach(user => {
    if (!assignableUsers.some(u => u.id === user.id)) {
      assignableUsers.push(user);
    }
  });

  return (
    <Modal open={open} onClose={handleClose} title={parentId ? (parentTask ? `Create Subtask for "${parentTask.title}"` : "Create Subtask") : "Create Task"}>
      <div className="space-y-6">
        {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        <section className="space-y-4">
          <Header label="Section A — Essentials" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Task Type">
              <Select value={itemType} onChange={(e) => setItemType(e.target.value)}>
                {availableTypes.length > 0 ? (
                  availableTypes.map((type) => (
                    <option key={type.id} value={type.name}>
                      {type.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="NEW_FEATURE">New Feature</option>
                    <option value="EXISTING_FEATURE">Existing Feature</option>
                    <option value="BUG">Bug</option>
                    <option value="IMPROVEMENT">Improvement</option>
                  </>
                )}
              </Select>
            </Field>
            <Field label="Estimated Hours">
              <Input
                type="number"
                min="0"
                step="0.5"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                placeholder="0.0"
              />
            </Field>
          </div>
          <Field label="Title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" />
          </Field>
          <Field label="Assignees">
            <div className="space-y-2">
              <Select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    setAssignees(prev => prev.includes(e.target.value) ? prev : [...prev, e.target.value]);
                  }
                }}
              >
                <option value="">Select team member...</option>
                {assignableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email}
                  </option>
                ))}
              </Select>
              {assignees.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {assignees.map((userId) => {
                    const user = assignableUsers.find(u => u.id === userId);
                    if (!user) return null;
                    return (
                      <span key={userId} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 border border-brand-100">
                        {user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email}
                        <button
                          type="button"
                          onClick={() => setAssignees(prev => prev.filter(id => id !== userId))}
                          className="ml-1 text-brand-400 hover:text-brand-600"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </Field>
          <Field label="Description">
            <textarea
              className="w-full rounded-lg border border-ink-100 px-3 py-2 text-sm"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description..."
            />
          </Field>
          <Field label="Attachments">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-ink-100 px-3 py-2 text-sm font-semibold text-brand-600">
              Upload
              <input type="file" className="hidden" multiple onChange={handleFileChange} />
            </label>
            {attachments.length > 0 && (
              <ul className="mt-2 space-y-2 text-sm text-ink-600">
                {attachments.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2">
                    <span>{file.name}</span>
                    <button type="button" className="text-xs text-ink-400 hover:text-ink-700" onClick={() => removeAttachment(index)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </section>

        <section className="space-y-4">
          <Header label="Section B — Schedule" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Planned start">
              <Input type="date" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
            </Field>
            <Field label="Planned completion">
              <Input type="date" value={plannedCompletion} onChange={(e) => setPlannedCompletion(e.target.value)} />
            </Field>
          </div>
        </section>

        <section>
          <Header label="Section C — Type-specific details" />
          {itemType === "BUG" && (
            <details open className="rounded-2xl border border-ink-100 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink-700">Bug details</summary>
              <div className="mt-4 space-y-3">
                <Field label="Priority">
                  <Select value={bugPriority} onChange={(e) => setBugPriority(e.target.value as TaskPriority)}>
                    {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Steps to reproduce">
                  <textarea className="w-full rounded-lg border border-ink-100 px-3 py-2 text-sm" rows={3} value={bugSteps} onChange={(e) => setBugSteps(e.target.value)} />
                </Field>
                <Field label="Expected result">
                  <textarea className="w-full rounded-lg border border-ink-100 px-3 py-2 text-sm" rows={3} value={bugExpected} onChange={(e) => setBugExpected(e.target.value)} />
                </Field>
                <Field label="Actual result">
                  <textarea className="w-full rounded-lg border border-ink-100 px-3 py-2 text-sm" rows={3} value={bugActual} onChange={(e) => setBugActual(e.target.value)} />
                </Field>
              </div>
            </details>
          )}
          {(itemType === "NEW_FEATURE" || itemType === "EXISTING_FEATURE") && (
            <details open className="rounded-2xl border border-ink-100 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink-700">Feature details</summary>
              <div className="mt-4 space-y-3">
                <Field label="User story">
                  <textarea className="w-full rounded-lg border border-ink-100 px-3 py-2 text-sm" rows={4} value={featureStory} onChange={(e) => setFeatureStory(e.target.value)} />
                </Field>
              </div>
            </details>
          )}
          {itemType === "IMPROVEMENT" && (
            <details open className="rounded-2xl border border-ink-100 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink-700">Improvement details</summary>
              <div className="mt-4 space-y-3">
                <Field label="Description">
                  <textarea className="w-full rounded-lg border border-ink-100 px-3 py-2 text-sm" rows={4} value={improvementDescription} onChange={(e) => setImprovementDescription(e.target.value)} />
                </Field>
              </div>
            </details>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={() => handleSubmit(false)} disabled={submitting}>
            Create & Add Another
          </Button>
          <Button type="button" onClick={() => handleSubmit(true)} disabled={submitting}>
            {submitting ? "Creating..." : "Create Task"}
          </Button>
        </div>
      </div>
    </Modal>
  );

  function resetForm() {
    setItemType("NEW_FEATURE");
    setTitle("");
    setPlannedStart("");
    setPlannedCompletion("");
    setEstimatedHours("");
    setBugPriority("HIGH");
    setBugSteps("");
    setBugExpected("");
    setBugActual("");
    setFeatureStory("");
    setDescription("");
    setImprovementDescription("");
    setAttachments([]);
    setAssignees([]);
    setError(null);
    setSubmitting(false);
  }
}

function Header({ label }: { label: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>;
}

function Field({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wide text-ink-500">
      {label}
      {required && <span className="text-red-500"> *</span>}
      <div className="mt-1 text-sm text-ink-900">{children}</div>
    </label>
  );
}
