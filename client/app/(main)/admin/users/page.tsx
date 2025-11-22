"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "../../../../components/layout/PageShell";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { Button } from "../../../../components/ui/Button";
import { Modal } from "../../../../components/ui/Modal";
import { Table } from "../../../../components/ui/Table";
import { Badge } from "../../../../components/ui/Badge";
import { apiRequest, ApiError } from "../../../../lib/apiClient";
import { Company, Role, User } from "../../../../lib/types";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";

const roleOptions: Role[] = ["SUPER_ADMIN", "VP", "PM", "ENGINEER", "PROJECT_MANAGER", "DEVELOPER", "VIEWER"];

const initialFormState = {
  email: "",
  role: "PM" as Role,
  firstName: "",
  lastName: "",
  mobileNumber: "",
  country: "",
  city: "",
  timeZone: "",
  title: "",
  companyId: ""
};

type EditUserFormState = typeof initialFormState & { status: "Active" | "Disabled" };

const initialEditFormState: EditUserFormState = {
  ...initialFormState,
  status: "Active"
};

export default function AdminUsersPage() {
  const { user: currentUser, loading: sessionLoading } = useCurrentUser({
    redirectTo: "/login",
    requiredRoles: ["SUPER_ADMIN", "PM"]
  });
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState(initialFormState);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState(initialEditFormState);
  const [editFeedback, setEditFeedback] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const [usersResponse, companiesResponse] = await Promise.all([
          apiRequest<{ users: User[] }>("/admin/users"),
          apiRequest<{ companies: Company[] }>("/companies")
        ]);
        setUsers(usersResponse.users);
        setCompanies(companiesResponse.companies);
      } catch (error) {
        const apiError = error as ApiError;
        setFeedback(apiError?.message ?? "Unable to load users.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditChange = (field: string, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const openEditModal = (user: User) => {
    setEditFeedback(null);
    setEditingUser(user);
    setEditForm({
      email: user.email,
      role: user.role,
      firstName: user.profile.firstName,
      lastName: user.profile.lastName,
      mobileNumber: user.profile.mobileNumber,
      country: user.profile.country,
      city: user.profile.city,
      timeZone: user.profile.timeZone,
      title: user.profile.title,
      companyId: user.companyId ?? "",
      status: user.isActive ? "Active" : "Disabled"
    });
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setEditForm(initialEditFormState);
    setEditFeedback(null);
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingUser) {
      return;
    }
    setEditSubmitting(true);
    setEditFeedback(null);
    try {
      const response = await apiRequest<{ user: User }>(`/admin/users/${editingUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          email: editForm.email,
          role: editForm.role,
          companyId: editForm.companyId || undefined,
          isActive: editForm.status === "Active",
          profile: {
            firstName: editForm.firstName,
            lastName: editForm.lastName,
            mobileNumber: editForm.mobileNumber,
            country: editForm.country,
            city: editForm.city,
            timeZone: editForm.timeZone,
            title: editForm.title
          }
        })
      });
      setUsers((prev) => prev.map((user) => (user.id === response.user.id ? response.user : user)));
      setFeedback("User updated.");
      closeEditModal();
    } catch (error) {
      const apiError = error as ApiError;
      setEditFeedback(apiError?.message ?? "Unable to update user.");
    } finally {
      setEditSubmitting(false);
    }
  };

  const openDeleteModal = (user: User) => {
    setDeleteFeedback(null);
    setDeleteTarget(user);
  };

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeleteFeedback(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleteSubmitting(true);
    setDeleteFeedback(null);
    try {
      await apiRequest(`/admin/users/${deleteTarget.id}`, {
        method: "DELETE"
      });
      setUsers((prev) => prev.filter((user) => user.id !== deleteTarget.id));
      setFeedback("User deleted.");
      closeDeleteModal();
    } catch (error) {
      const apiError = error as ApiError;
      setDeleteFeedback(apiError?.message ?? "Unable to delete user.");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      await apiRequest<{ user: User }>("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: form.email,
          role: form.role,
          companyId: form.companyId || undefined,
          profile: {
            firstName: form.firstName,
            lastName: form.lastName,
            mobileNumber: form.mobileNumber,
            country: form.country,
            city: form.city,
            timeZone: form.timeZone,
            title: form.title
          }
        })
      });
      setFeedback("User created.");
      setForm(initialFormState);
      const refreshed = await apiRequest<{ users: User[] }>("/admin/users");
      setUsers(refreshed.users);
    } catch (error) {
      const apiError = error as ApiError;
      setFeedback(apiError?.message ?? "Unable to create user.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sessionLoading || !currentUser) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Checking access…</div>;
  }

  return (
    <PageShell
      title="Admin · Users"
      subtitle="Manage internal accounts"
      userName={`${currentUser.profile.firstName} ${currentUser.profile.lastName}`}
      currentUser={currentUser}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Team Roster" helperText={loading ? "Loading…" : `${users.length} users`}>
          {loading ? (
            <p className="text-sm text-ink-500">Loading users…</p>
          ) : (
            <Table>
              <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-sm text-ink-700">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3">{`${user.profile.firstName} ${user.profile.lastName}`}</td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">
                      <Badge label={user.role} tone={user.role === "SUPER_ADMIN" ? "success" : "neutral"} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={user.isActive ? "Active" : "Disabled"} tone={user.isActive ? "success" : "warning"} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="px-3 py-1 text-xs"
                          onClick={() => openEditModal(user)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="px-3 py-1 text-xs text-rose-600 hover:text-rose-700 disabled:text-ink-400"
                          onClick={() => openDeleteModal(user)}
                          disabled={currentUser.id === user.id}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card
          title="Create Internal User"
          helperText="Default password 12124545 -> user must change on first login."
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">First name</label>
                <Input value={form.firstName} onChange={(e) => handleChange("firstName", e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">Last name</label>
                <Input value={form.lastName} onChange={(e) => handleChange("lastName", e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Email</label>
              <Input type="email" value={form.email} onChange={(e) => handleChange("email", e.target.value)} required />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">Role</label>
                <Select value={form.role} onChange={(e) => handleChange("role", e.target.value)}>
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">Company</label>
                <Select value={form.companyId} onChange={(e) => handleChange("companyId", e.target.value)}>
                  <option value="">Unassigned</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">Mobile (E.164)</label>
                <Input value={form.mobileNumber} onChange={(e) => handleChange("mobileNumber", e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">Country (ISO-2)</label>
                <Input value={form.country} onChange={(e) => handleChange("country", e.target.value)} required />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">City</label>
                <Input value={form.city} onChange={(e) => handleChange("city", e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">Time Zone</label>
                <Input value={form.timeZone} onChange={(e) => handleChange("timeZone", e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Title</label>
              <Input value={form.title} onChange={(e) => handleChange("title", e.target.value)} required />
            </div>
            {feedback && <p className="text-sm text-ink-500">{feedback}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating..." : "Create user"}
            </Button>
          </form>
        </Card>
      </div>

      <Modal open={Boolean(editingUser)} onClose={closeEditModal} title="Edit internal user">
        {editingUser && (
          <form className="space-y-4" onSubmit={handleEditSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">First name</label>
                <Input value={editForm.firstName} onChange={(e) => handleEditChange("firstName", e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">Last name</label>
                <Input value={editForm.lastName} onChange={(e) => handleEditChange("lastName", e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Email</label>
              <Input type="email" value={editForm.email} onChange={(e) => handleEditChange("email", e.target.value)} required />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">Role</label>
                <Select value={editForm.role} onChange={(e) => handleEditChange("role", e.target.value)}>
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">Company</label>
                <Select value={editForm.companyId} onChange={(e) => handleEditChange("companyId", e.target.value)}>
                  <option value="">Unassigned</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">Mobile (E.164)</label>
                <Input value={editForm.mobileNumber} onChange={(e) => handleEditChange("mobileNumber", e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">Country (ISO-2)</label>
                <Input value={editForm.country} onChange={(e) => handleEditChange("country", e.target.value)} required />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">City</label>
                <Input value={editForm.city} onChange={(e) => handleEditChange("city", e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">Time Zone</label>
                <Input value={editForm.timeZone} onChange={(e) => handleEditChange("timeZone", e.target.value)} required />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">Title</label>
                <Input value={editForm.title} onChange={(e) => handleEditChange("title", e.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">Status</label>
                <Select value={editForm.status} onChange={(e) => handleEditChange("status", e.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Disabled">Disabled</option>
                </Select>
              </div>
            </div>
            {editFeedback && <p className="text-sm text-rose-600">{editFeedback}</p>}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" className="px-4 py-2" onClick={closeEditModal}>
                Cancel
              </Button>
              <Button type="submit" disabled={editSubmitting}>
                {editSubmitting ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(deleteTarget)} onClose={closeDeleteModal} title="Delete user">
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">
              Deleting{" "}
              <span className="font-semibold text-ink-800">
                {deleteTarget.profile.firstName} {deleteTarget.profile.lastName}
              </span>{" "}
              removes their access and dependent records. This action cannot be undone.
            </p>
            {deleteFeedback && <p className="text-sm text-rose-600">{deleteFeedback}</p>}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={closeDeleteModal}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-rose-600 hover:bg-rose-700"
                onClick={handleDeleteConfirm}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? "Deleting..." : "Delete user"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
