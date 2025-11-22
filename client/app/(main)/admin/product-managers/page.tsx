"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "../../../../components/layout/PageShell";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { Button } from "../../../../components/ui/Button";
import { Table } from "../../../../components/ui/Table";
import { Badge } from "../../../../components/ui/Badge";
import { Modal } from "../../../../components/ui/Modal";
import { apiRequest, ApiError } from "../../../../lib/apiClient";
import { Company, Invitation, User } from "../../../../lib/types";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";

const inviteFormDefaults = {
  email: "",
  firstName: "",
  lastName: "",
  companyId: "",
  vpUserId: "",
  preferredCompanyIds: [] as string[]
};

const editFormDefaults = {
  email: "",
  firstName: "",
  lastName: "",
  mobileNumber: "",
  country: "",
  city: "",
  timeZone: "",
  title: "",
  companyId: "",
  status: "Active" as "Active" | "Disabled",
  vpUserId: "",
  preferredCompanyIds: [] as string[]
};

type FeedbackMessage = { tone: "success" | "error"; message: string };

type EditFormState = typeof editFormDefaults;

type InviteFormState = typeof inviteFormDefaults;

type DeleteState = { manager: User | null; submitting: boolean; error: string | null };

export default function ProductManagersPage() {
  const { user, loading: sessionLoading } = useCurrentUser({
    redirectTo: "/login",
    requiredRoles: ["SUPER_ADMIN", "PM"]
  });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [productManagers, setProductManagers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [vpUsers, setVpUsers] = useState<User[]>([]);
  const [inviteForm, setInviteForm] = useState<InviteFormState>(inviteFormDefaults);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingManager, setEditingManager] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(editFormDefaults);
  const [editFeedback, setEditFeedback] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteState, setDeleteState] = useState<DeleteState>({ manager: null, submitting: false, error: null });
  const [cancellingInvitationId, setCancellingInvitationId] = useState<string | null>(null);

  const vpOptions = useMemo(() => vpUsers, [vpUsers]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [teamResponse, companyResponse, vpResponse] = await Promise.all([
        apiRequest<{ users: User[]; invitations: Invitation[] }>("/team/product-managers"),
        apiRequest<{ companies: Company[] }>("/companies"),
        apiRequest<{ users: User[] }>("/team/vps")
      ]);
      setProductManagers(teamResponse.users);
      setInvitations(teamResponse.invitations);
      setCompanies(companyResponse.companies);
      setVpUsers(vpResponse.users);
    } catch (error) {
      const apiError = error as ApiError;
      setFeedback({ tone: "error", message: apiError?.message ?? "Unable to load product managers." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    void loadData();
  }, [user, loadData]);

  const handleInviteChange = (field: keyof InviteFormState, value: string | string[]) => {
    setInviteForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteForm.companyId) {
      setInviteStatus("Select a company for the invite.");
      return;
    }
    setSubmittingInvite(true);
    setInviteStatus(null);
    try {
      const response = await apiRequest<{ invitation: Invitation; user: User; tempPassword: string }>("/invitations/product-manager", {
        method: "POST",
        body: JSON.stringify({
          email: inviteForm.email,
          firstName: inviteForm.firstName,
          lastName: inviteForm.lastName,
          companyId: inviteForm.companyId,
          vpUserId: inviteForm.vpUserId || undefined,
          preferredCompanyIds: inviteForm.preferredCompanyIds
        })
      });
      setInviteStatus(
        `Product Manager created successfully! Temporary password: ${response.tempPassword} (share with ${response.user.profile.firstName}).`
      );
      setInviteForm(inviteFormDefaults);
      await loadData();
    } catch (error) {
      const apiError = error as ApiError;
      setInviteStatus(apiError?.message ?? "Unable to send invitation.");
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    setCancellingInvitationId(invitationId);
    try {
      await apiRequest(`/invitations/${invitationId}`, { method: "DELETE" });
      await loadData();
    } catch (error) {
      const apiError = error as ApiError;
      setFeedback({ tone: "error", message: apiError?.message ?? "Unable to cancel invitation." });
    } finally {
      setCancellingInvitationId(null);
    }
  };

  const openEditModal = (manager: User) => {
    setEditingManager(manager);
    setEditFeedback(null);
    setEditForm({
      email: manager.email,
      firstName: manager.profile.firstName,
      lastName: manager.profile.lastName,
      mobileNumber: manager.profile.mobileNumber,
      country: manager.profile.country,
      city: manager.profile.city,
      timeZone: manager.profile.timeZone,
      title: manager.profile.title,
      companyId: manager.companyId ?? "",
      status: manager.isActive ? "Active" : "Disabled",
      vpUserId: manager.vpUserId ?? "",
      preferredCompanyIds: manager.preferences?.preferredCompanyIds ?? []
    });
  };

  const closeEditModal = () => {
    setEditingManager(null);
    setEditForm(editFormDefaults);
    setEditFeedback(null);
  };

  const handleEditChange = (field: keyof EditFormState, value: string | string[]) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingManager) {
      return;
    }
    setEditSubmitting(true);
    setEditFeedback(null);
    try {
      await apiRequest(`/team/product-managers/${editingManager.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          email: editForm.email,
          companyId: editForm.companyId || undefined,
          profile: {
            firstName: editForm.firstName,
            lastName: editForm.lastName,
            mobileNumber: editForm.mobileNumber,
            country: editForm.country,
            city: editForm.city,
            timeZone: editForm.timeZone,
            title: editForm.title
          },
          isActive: editForm.status === "Active",
          vpUserId: editForm.vpUserId || undefined,
          preferredCompanyIds: editForm.preferredCompanyIds
        })
      });
      await loadData();
      closeEditModal();
    } catch (error) {
      const apiError = error as ApiError;
      setEditFeedback(apiError?.message ?? "Unable to update product manager.");
    } finally {
      setEditSubmitting(false);
    }
  };

  const openDeleteModal = (manager: User) => {
    setDeleteState({ manager, submitting: false, error: null });
  };

  const closeDeleteModal = () => {
    setDeleteState({ manager: null, submitting: false, error: null });
  };

  const handleDeleteManager = async () => {
    if (!deleteState.manager) {
      return;
    }
    setDeleteState((prev) => ({ ...prev, submitting: true, error: null }));
    try {
      await apiRequest(`/team/product-managers/${deleteState.manager.id}`, { method: "DELETE" });
      await loadData();
      closeDeleteModal();
    } catch (error) {
      const apiError = error as ApiError;
      setDeleteState((prev) => ({ ...prev, submitting: false, error: apiError?.message ?? "Unable to deactivate user." }));
    }
  };

  if (sessionLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Checking access...</div>;
  }

  return (
    <PageShell
      title="Admin - Product Managers"
      subtitle="Invite, update, or deactivate product managers"
      currentUser={user}
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
    >
      {feedback && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${feedback.tone === "success" ? "border-brand-200 bg-brand-50 text-brand-900" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {feedback.message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Product managers" helperText={loading ? "Loading" : `${productManagers.length} active`}>
          {loading ? (
            <p className="text-sm text-ink-500">Loading product managers...</p>
          ) : productManagers.length === 0 ? (
            <p className="text-sm text-ink-500">No product managers yet.</p>
          ) : (
            <Table>
              <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">VP</th>
                  <th className="px-4 py-3">Default companies</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-sm text-ink-700">
                {productManagers.map((manager) => (
                  <tr key={manager.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900">
                        {manager.profile.firstName} {manager.profile.lastName}
                      </p>
                      <p className="text-xs text-ink-400">{manager.email}</p>
                    </td>
                    <td className="px-4 py-3">{companies.find((company) => company.id === manager.companyId)?.name ?? "N/A"}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        if (!manager.vpUserId) {
                          return <span className="text-sm text-ink-400">Unassigned</span>;
                        }
                        const vp = vpOptions.find((candidate) => candidate.id === manager.vpUserId);
                        if (!vp) {
                          return <span className="text-sm text-ink-400">Removed</span>;
                        }
                        return (
                          <div>
                            <p className="font-medium text-ink-900">
                              {vp.profile.firstName} {vp.profile.lastName}
                            </p>
                            <p className="text-xs text-ink-400">{vp.email}</p>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const preferred = manager.preferences?.preferredCompanyIds ?? [];
                        if (!preferred.length) {
                          return <span className="text-sm text-ink-400">None</span>;
                        }
                        return (
                          <ul className="space-y-1 text-xs text-ink-600">
                            {preferred.map((companyId) => {
                              const label = companies.find((company) => company.id === companyId)?.name || companyId;
                              return <li key={`${manager.id}-${companyId}`}>{label}</li>;
                            })}
                          </ul>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={manager.isActive ? "Active" : "Inactive"} tone={manager.isActive ? "success" : "warning"} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" type="button" onClick={() => openEditModal(manager)}>
                          Edit
                        </Button>
                        <Button variant="ghost" type="button" className="text-red-600 hover:bg-red-50" onClick={() => openDeleteModal(manager)}>
                          Deactivate
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Invite Product Managers" helperText="Direct creation">
          <form className="space-y-4" onSubmit={handleInviteSubmit}>
            <div>
              <label className="text-sm font-medium text-ink-700">First name</label>
              <Input value={inviteForm.firstName} onChange={(event) => handleInviteChange("firstName", event.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Last name</label>
              <Input value={inviteForm.lastName} onChange={(event) => handleInviteChange("lastName", event.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Email</label>
              <Input type="email" value={inviteForm.email} onChange={(event) => handleInviteChange("email", event.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Company</label>
              <Select value={inviteForm.companyId} onChange={(event) => handleInviteChange("companyId", event.target.value)}>
                <option value="">Select company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Assigned VP</label>
              <Select value={inviteForm.vpUserId} onChange={(event) => handleInviteChange("vpUserId", event.target.value)}>
                <option value="">None</option>
                {vpOptions.map((vp) => (
                  <option key={vp.id} value={vp.id}>
                    {vp.profile.firstName} {vp.profile.lastName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Default company filters</label>
              <select
                multiple
                value={inviteForm.preferredCompanyIds}
                onChange={(event) =>
                  handleInviteChange(
                    "preferredCompanyIds",
                    Array.from(event.target.selectedOptions).map((option) => option.value)
                  )
                }
                className="mt-1 w-full rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-brand-300 focus:outline-none"
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-ink-500">Hold Cmd/Ctrl to select multiple companies.</p>
            </div>
            {inviteStatus ? <p className="text-sm text-ink-500">{inviteStatus}</p> : null}
            <Button type="submit" className="w-full" disabled={submittingInvite}>
              {submittingInvite ? "Inviting..." : "Create product manager"}
            </Button>
          </form>
        </Card>
      </div>

      <Card className="mt-6" title="Pending invitations" helperText={invitations.length ? `${invitations.length} open` : "None"}>
        {invitations.length ? (
          <Table>
            <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-sm text-ink-700">
              {invitations.map((invite) => (
                <tr key={invite.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink-900">{invite.email}</p>
                    <p className="text-xs text-ink-400">
                      {invite.firstName} {invite.lastName}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-500">{new Date(invite.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <Badge label={invite.status} tone={invite.status === "SENT" ? "warning" : invite.status === "ACCEPTED" ? "success" : "neutral"} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {invite.status === "SENT" && (
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={() => handleCancelInvitation(invite.id)}
                        disabled={cancellingInvitationId === invite.id}
                        className="text-red-600 hover:bg-red-50"
                      >
                        {cancellingInvitationId === invite.id ? "Cancelling..." : "Cancel"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-ink-500">No pending invitations.</p>
        )}
      </Card>

      <Modal open={Boolean(editingManager)} onClose={closeEditModal} title="Edit product manager">
        {editingManager && (
          <form className="space-y-4" onSubmit={handleEditSubmit}>
            <div>
              <label className="text-sm font-medium text-ink-700">Email</label>
              <Input value={editForm.email} onChange={(event) => handleEditChange("email", event.target.value)} required />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">First name</label>
                <Input value={editForm.firstName} onChange={(event) => handleEditChange("firstName", event.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">Last name</label>
                <Input value={editForm.lastName} onChange={(event) => handleEditChange("lastName", event.target.value)} required />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Mobile</label>
              <Input value={editForm.mobileNumber} onChange={(event) => handleEditChange("mobileNumber", event.target.value)} required />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">Country</label>
                <Input value={editForm.country} onChange={(event) => handleEditChange("country", event.target.value)} required />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">City</label>
                <Input value={editForm.city} onChange={(event) => handleEditChange("city", event.target.value)} required />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Time zone</label>
              <Input value={editForm.timeZone} onChange={(event) => handleEditChange("timeZone", event.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Title</label>
              <Input value={editForm.title} onChange={(event) => handleEditChange("title", event.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Company</label>
              <Select value={editForm.companyId} onChange={(event) => handleEditChange("companyId", event.target.value)}>
                <option value="">Unassigned</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">Status</label>
                <Select value={editForm.status} onChange={(event) => handleEditChange("status", event.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Disabled">Disabled</option>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">Assigned VP</label>
                <Select value={editForm.vpUserId} onChange={(event) => handleEditChange("vpUserId", event.target.value)}>
                  <option value="">None</option>
                  {vpOptions.map((vp) => (
                    <option key={vp.id} value={vp.id}>
                      {vp.profile.firstName} {vp.profile.lastName}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Default companies</label>
              <select
                multiple
                value={editForm.preferredCompanyIds}
                onChange={(event) =>
                  handleEditChange(
                    "preferredCompanyIds",
                    Array.from(event.target.selectedOptions).map((option) => option.value)
                  )
                }
                className="mt-1 w-full rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-brand-300 focus:outline-none"
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-ink-500">Hold Cmd/Ctrl to select multiple companies.</p>
            </div>
            {editFeedback ? <p className="text-sm text-red-600">{editFeedback}</p> : null}
            <Button type="submit" className="w-full" disabled={editSubmitting}>
              {editSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(deleteState.manager)} onClose={closeDeleteModal} title="Deactivate product manager">
        {deleteState.manager && (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">
              Deactivate {deleteState.manager.profile.firstName} {deleteState.manager.profile.lastName}? They will no longer access the workspace.
            </p>
            {deleteState.error ? <p className="text-sm text-red-600">{deleteState.error}</p> : null}
            <div className="flex gap-3">
              <Button className="flex-1" variant="ghost" onClick={closeDeleteModal} disabled={deleteState.submitting}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleDeleteManager} disabled={deleteState.submitting}>
                {deleteState.submitting ? "Deactivating..." : "Deactivate"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
