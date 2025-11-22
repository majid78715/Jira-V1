"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "../../../../components/layout/PageShell";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/Input";
import { Button } from "../../../../components/ui/Button";
import { Table } from "../../../../components/ui/Table";
import { Badge } from "../../../../components/ui/Badge";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../../lib/apiClient";
import { Invitation, User } from "../../../../lib/types";

const initialForm = {
  email: "",
  firstName: "",
  lastName: ""
};

export default function DevelopersPage() {
  const { user, loading: sessionLoading } = useCurrentUser({
    redirectTo: "/login",
    requiredRoles: ["PROJECT_MANAGER"]
  });
  const [developers, setDevelopers] = useState<User[]>([]);
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
      const response = await apiRequest<{ users: User[]; invitations: Invitation[] }>("/team/developers");
      setDevelopers(response.users);
      setInvitations(response.invitations);
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to load developers.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const response = await apiRequest<{ user: User; tempPassword: string }>("/invitations/developer", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setStatus(`Developer created! Temporary password: ${response.tempPassword}`);
      setForm(initialForm);
      await loadData();
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to create developer.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sessionLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Checking permissions…</div>;
  }

  return (
    <PageShell
      title="Developers"
      subtitle="Invite developers to your vendor team"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Developers" helperText={loading ? "Loading…" : `${developers.length} active`}>
          {loading ? (
            <p className="text-sm text-ink-500">Loading developers…</p>
          ) : (
            <Table>
              <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-sm text-ink-700">
                {developers.map((developer) => (
                  <tr key={developer.id}>
                    <td className="px-4 py-3">{`${developer.profile.firstName} ${developer.profile.lastName}`}</td>
                    <td className="px-4 py-3">{developer.email}</td>
                    <td className="px-4 py-3">
                      <Badge
                        label={developer.profileStatus === "ACTIVE" ? "Active" : developer.profileStatus}
                        tone={developer.profileStatus === "ACTIVE" ? "success" : "warning"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Create Developer" helperText="Direct account creation">
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
            {status && (
              <div className={`rounded-md p-3 text-sm ${status.includes("password") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {status}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating..." : "Create Developer"}
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
