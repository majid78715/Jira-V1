"use client";

import { useEffect, useState, useMemo } from "react";
import { PageShell } from "../../../../../components/layout/PageShell";
import { Button } from "../../../../../components/ui/Button";
import { Card } from "../../../../../components/ui/Card";
import { Modal } from "../../../../../components/ui/Modal";
import { Input } from "../../../../../components/ui/Input";
import { Select } from "../../../../../components/ui/Select";
import { useCurrentUser } from "../../../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../../../lib/apiClient";
import { WorkflowScheme, WorkflowState } from "../../../../../lib/types";
import Link from "next/link";

export default function WorkflowSchemesPage() {
  const { user, loading: userLoading } = useCurrentUser({
    redirectTo: "/login",
    requiredRoles: ["SUPER_ADMIN", "PM"]
  });

  const [schemes, setSchemes] = useState<WorkflowScheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingScheme, setEditingScheme] = useState<WorkflowScheme | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    states: Partial<WorkflowState>[];
  }>({
    name: "",
    description: "",
    states: []
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      fetchSchemes();
    }
  }, [user]);

  async function fetchSchemes() {
    try {
      setLoading(true);
      const response = await apiRequest<WorkflowScheme[] | { workflowSchemes: WorkflowScheme[] }>("/workflow-schemes");
      if (Array.isArray(response)) {
        setSchemes(response);
      } else if (response && "workflowSchemes" in response && Array.isArray((response as any).workflowSchemes)) {
        setSchemes((response as any).workflowSchemes);
      } else {
        setSchemes([]);
      }
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || "Failed to load workflow schemes");
    } finally {
      setLoading(false);
    }
  }

  const handleOpenCreate = () => {
    setEditingScheme(null);
    setFormData({
      name: "",
      description: "",
      states: [
        { name: "To Do", category: "TODO", order: 0 },
        { name: "In Progress", category: "IN_PROGRESS", order: 1 },
        { name: "Done", category: "DONE", order: 2 }
      ]
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (scheme: WorkflowScheme) => {
    setEditingScheme(scheme);
    setFormData({
      name: scheme.name,
      description: scheme.description || "",
      states: scheme.states.map(s => ({ ...s }))
    });
    setIsModalOpen(true);
  };

  const handleAddState = () => {
    setFormData({
      ...formData,
      states: [
        ...formData.states,
        { name: "New State", category: "TODO", order: formData.states.length }
      ]
    });
  };

  const handleRemoveState = (index: number) => {
    const newStates = [...formData.states];
    newStates.splice(index, 1);
    setFormData({ ...formData, states: newStates });
  };

  const handleStateChange = (index: number, field: keyof WorkflowState, value: any) => {
    const newStates = [...formData.states];
    newStates[index] = { ...newStates[index], [field]: value };
    setFormData({ ...formData, states: newStates });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Ensure states have IDs if they are new (backend might handle this, but let's be safe or let backend generate)
      // Actually backend should generate IDs for new states.
      
      if (editingScheme) {
        await apiRequest(`/workflow-schemes/${editingScheme.id}`, {
          method: "PATCH",
          body: JSON.stringify(formData)
        });
      } else {
        await apiRequest("/workflow-schemes", {
          method: "POST",
          body: JSON.stringify(formData)
        });
      }
      setIsModalOpen(false);
      fetchSchemes();
    } catch (err) {
      console.error("Failed to save workflow scheme", err);
      alert("Failed to save workflow scheme");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this workflow scheme?")) return;
    try {
      await apiRequest(`/workflow-schemes/${id}`, { method: "DELETE" });
      fetchSchemes();
    } catch (err) {
      console.error("Failed to delete workflow scheme", err);
      alert("Failed to delete workflow scheme");
    }
  };

  const userName = useMemo(() => {
    if (!user) {
      return "";
    }
    return `${user.profile.firstName} ${user.profile.lastName}`;
  }, [user]);

  if (userLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading…</div>;
  }

  return (
    <PageShell
      title="Workflow Schemes"
      subtitle="Manage status flows and transitions"
      userName={userName}
      currentUser={user}
    >
      <div className="mb-6 flex items-center justify-between">
        <Link href="/admin/ui-configuration">
          <Button variant="ghost">← Back to Configuration</Button>
        </Link>
        <Button onClick={handleOpenCreate}>Create New Scheme</Button>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-center text-ink-500">Loading schemes...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {schemes.map((scheme) => (
            <Card key={scheme.id} title={scheme.name} helperText={scheme.description || "No description"}>
              <div className="mt-4 text-xs text-ink-500">
                <p>{scheme.states.length} States</p>
                <p>{scheme.transitions.length} Transitions</p>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => handleOpenEdit(scheme)}>Edit</Button>
                <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(scheme.id)}>Delete</Button>
              </div>
            </Card>
          ))}
          {schemes.length === 0 && (
            <div className="col-span-full py-12 text-center text-ink-400">
              No workflow schemes found. Create one to get started.
            </div>
          )}
        </div>
      )}

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingScheme ? "Edit Workflow Scheme" : "Create Workflow Scheme"}
      >
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700">Name</label>
              <Input
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Software Development Workflow"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700">Description</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this workflow"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-xs font-medium text-ink-700">States (Columns)</label>
              <Button type="button" variant="ghost" onClick={handleAddState} className="text-xs py-1 h-auto">
                + Add State
              </Button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto p-1">
              {formData.states.map((state, index) => (
                <div key={index} className="flex items-center gap-2 rounded-md border border-ink-100 p-2 bg-ink-50">
                  <div className="flex-1">
                    <Input
                      value={state.name}
                      onChange={(e) => handleStateChange(index, "name", e.target.value)}
                      placeholder="State Name"
                      className="mb-1 h-8 text-xs"
                    />
                    <Select
                      value={state.category}
                      onChange={(e) => handleStateChange(index, "category", e.target.value)}
                      className="h-8 text-xs"
                    >
                      <option value="TODO">To Do</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="DONE">Done</option>
                    </Select>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveState(index)}
                    className="text-ink-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-ink-100">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}
