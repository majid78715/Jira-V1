"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "../../../../../components/layout/PageShell";
import { Card } from "../../../../../components/ui/Card";
import { Input } from "../../../../../components/ui/Input";
import { Select } from "../../../../../components/ui/Select";
import { Button } from "../../../../../components/ui/Button";
import { Table } from "../../../../../components/ui/Table";
import { Badge } from "../../../../../components/ui/Badge";
import { useCurrentUser } from "../../../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../../../lib/apiClient";
import { Company, Invitation, User } from "../../../../../lib/types";

const initialForm = {
  email: "",
  firstName: "",
  lastName: "",
  companyId: ""
};

export default function AdminprojectManagersPage() {
  const { user, loading: sessionLoading } = useCurrentUser({
    redirectTo: "/login",
    requiredRoles: ["PM", "SUPER_ADMIN"]
  });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [teamResponse, companyResponse] = await Promise.all([
        apiRequest<{ users: User[]; invitations: Invitation[] }>("/team/project-managers"),
        apiRequest<{ companies: Company[] }>("/companies")
      ]);
      setManagers(teamResponse.users);
      setInvitations(teamResponse.invitations);
      setCompanies(companyResponse.companies);
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to load project managers.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.companyId) {
      setStatus("Select a company for the invite.");
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      await apiRequest<{ invitation: Invitation }>("/invitations/project-manager", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setStatus("Invitation sent.");
      setForm(initialForm);
      await loadData();
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to send invitation.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sessionLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Checking permissions...</div>;
  }

  return (
    <PageShell
      title="Admin · Project Managers"
      subtitle="Invite, manage, and monitor project leaders"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Active Project Managers" helperText={loading ? "Loading..." : `${managers.length} active`}>
          {loading ? (
            <p className="text-sm text-ink-500">Loading roster...</p>
          ) : (
            <Table>
              <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-sm text-ink-700">
                {managers.map((manager) => (
                  <tr key={manager.id}>
                    <td className="px-4 py-3">{`${manager.profile.firstName} ${manager.profile.lastName}`}</td>
                    <td className="px-4 py-3">{manager.email}</td>
                    <td className="px-4 py-3">
                      {companies.find((c) => c.id === manager.companyId)?.name ?? "Unassigned"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        label={manager.profileStatus === "ACTIVE" ? "Active" : manager.profileStatus}
                        tone={manager.profileStatus === "ACTIVE" ? "success" : "warning"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Invite Project Manager" helperText="Full name + company">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-sm font-medium text-ink-700">Email</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">First name</label>
                <Input
                  value={form.firstName}
                  onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">Last name</label>
                <Input
                  value={form.lastName}
                  onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Company</label>
              <Select
                value={form.companyId}
                onChange={(e) => setForm((prev) => ({ ...prev, companyId: e.target.value }))}
                required
              >
                <option value="">Select company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
            </div>
            {status && <p className="text-sm text-ink-500">{status}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Sending..." : "Send invite"}
            </Button>
          </form>
        </Card>
      </div>

      <Card className="mt-8" title="Open Invitations" helperText={`${invitations.length} invites`}>
        {invitations.length === 0 ? (
          <p className="text-sm text-ink-500">No pending invitations.</p>
        ) : (
          <Table>
            <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Invitee</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Token</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-sm">
              {invitations.map((invite) => (
                <tr key={invite.id}>
                  <td className="px-4 py-3">{`${invite.firstName} ${invite.lastName}`}</td>
                  <td className="px-4 py-3">{invite.email}</td>
                  <td className="px-4 py-3 font-mono text-xs">{invite.token}</td>
                  <td className="px-4 py-3">
                    <Badge
                      label={invite.status}
                      tone={invite.status === "SENT" ? "warning" : "success"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </PageShell>
  );
}
