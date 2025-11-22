"use client";

import { useEffect, useState, useMemo } from "react";
import { PageShell } from "../../../../../components/layout/PageShell";
import { Button } from "../../../../../components/ui/Button";
import { Card } from "../../../../../components/ui/Card";
import { Modal } from "../../../../../components/ui/Modal";
import { Input } from "../../../../../components/ui/Input";
import { useCurrentUser } from "../../../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../../../lib/apiClient";
import { WorkItemType } from "../../../../../lib/types";
import Link from "next/link";

export default function WorkItemTypesPage() {
  const { user, loading: userLoading } = useCurrentUser({
    redirectTo: "/login",
    requiredRoles: ["SUPER_ADMIN", "PM"]
  });

  const [types, setTypes] = useState<WorkItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<WorkItemType | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "📋",
    color: "#6B7280"
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      fetchTypes();
    }
  }, [user]);

  async function fetchTypes() {
    try {
      setLoading(true);
      const response = await apiRequest<WorkItemType[] | { workItemTypes: WorkItemType[] }>("/work-item-types");
      if (Array.isArray(response)) {
        setTypes(response);
      } else if (response && "workItemTypes" in response && Array.isArray((response as any).workItemTypes)) {
        setTypes((response as any).workItemTypes);
      } else {
        setTypes([]);
      }
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || "Failed to load work item types");
    } finally {
      setLoading(false);
    }
  }

  const handleOpenCreate = () => {
    setEditingType(null);
    setFormData({ name: "", description: "", icon: "📋", color: "#6B7280" });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (type: WorkItemType) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      description: type.description || "",
      icon: type.icon || "📋",
      color: type.color || "#6B7280"
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingType) {
        await apiRequest(`/work-item-types/${editingType.id}`, {
          method: "PATCH",
          body: JSON.stringify(formData)
        });
      } else {
        await apiRequest("/work-item-types", {
          method: "POST",
          body: JSON.stringify(formData)
        });
      }
      setIsModalOpen(false);
      fetchTypes();
    } catch (err) {
      console.error("Failed to save work item type", err);
      alert("Failed to save work item type");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this work item type?")) return;
    try {
      await apiRequest(`/work-item-types/${id}`, { method: "DELETE" });
      fetchTypes();
    } catch (err) {
      console.error("Failed to delete work item type", err);
      alert("Failed to delete work item type");
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
      title="Work Item Types"
      subtitle="Manage the types of work items available in your projects"
      userName={userName}
      currentUser={user}
    >
      <div className="mb-6 flex items-center justify-between">
        <Link href="/admin/ui-configuration">
          <Button variant="ghost">← Back to Configuration</Button>
        </Link>
        <Button onClick={handleOpenCreate}>Create New Type</Button>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-center text-ink-500">Loading types...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {types.map((type) => (
            <Card key={type.id} title={type.name} helperText={type.description || "No description"}>
              <div className="mt-4 flex items-center justify-between text-xs text-ink-500">
                <span>Color: <span style={{ color: type.color }}>●</span> {type.color}</span>
                <span>Icon: {type.icon}</span>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => handleOpenEdit(type)}>Edit</Button>
                <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(type.id)}>Delete</Button>
              </div>
            </Card>
          ))}
          {types.length === 0 && (
            <div className="col-span-full py-12 text-center text-ink-400">
              No work item types found. Create one to get started.
            </div>
          )}
        </div>
      )}

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingType ? "Edit Work Item Type" : "Create Work Item Type"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Name</label>
            <Input
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Bug, Story, Task"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Description</label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this type"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700">Icon (Emoji)</label>
              <Input
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                placeholder="e.g. 🐛"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700">Color (Hex)</label>
              <Input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="h-9 p-1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}
