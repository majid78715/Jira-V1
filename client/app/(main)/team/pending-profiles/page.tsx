"use client";

import { useEffect, useState } from "react";
import { PageShell } from "../../../../components/layout/PageShell";
import { Card } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Table } from "../../../../components/ui/Table";
import { Badge } from "../../../../components/ui/Badge";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../../lib/apiClient";
import { ProfileChangeRequest, User } from "../../../../lib/types";

export default function PendingProfilesPage() {
  const { user, loading: sessionLoading } = useCurrentUser({
    redirectTo: "/login",
    requiredRoles: ["PM", "SUPER_ADMIN"]
  });
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<ProfileChangeRequest[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pendingResponse, requestResponse] = await Promise.all([
        apiRequest<{ users: User[] }>("/users/pending-profiles"),
        apiRequest<{ requests: ProfileChangeRequest[] }>("/profile-change-requests")
      ]);
      setPendingUsers(pendingResponse.users);
      setRequests(requestResponse.requests);
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to load pending profiles.");
    } finally {
      setLoading(false);
    }
  };

  const handleCommentChange = (id: string, value: string) => {
    setComments((prev) => ({ ...prev, [id]: value }));
  };

  const actOnUser = async (id: string, action: "approve" | "reject") => {
    try {
      await apiRequest(`/users/${id}/${action}-profile`, {
        method: "POST",
        body: JSON.stringify({ comment: comments[id] ?? "" })
      });
      setStatus(`User ${action}d.`);
      await loadData();
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to update profile.");
    }
  };

  const actOnRequest = async (id: string, action: "approve" | "reject") => {
    try {
      await apiRequest(`/profile-change-requests/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ comment: comments[id] ?? "" })
      });
      setStatus(`Request ${action}d.`);
      await loadData();
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to update request.");
    }
  };

  if (sessionLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Checking permissions…</div>;
  }

  return (
    <PageShell
      title="Pending Profiles"
      subtitle="Approve invitations and change requests"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      {status && <p className="mb-4 text-sm text-ink-500">{status}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="New Members" helperText={loading ? "Loading…" : `${pendingUsers.length} awaiting`}>
          {pendingUsers.length === 0 ? (
            <p className="text-sm text-ink-500">No new members awaiting approval.</p>
          ) : (
            <Table>
              <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-sm">
                {pendingUsers.map((pending) => (
                  <tr key={pending.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900">{`${pending.profile.firstName} ${pending.profile.lastName}`}</p>
                      <p className="text-xs text-ink-400">{pending.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={pending.role} tone="neutral" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <Input
                          placeholder="Comment"
                          value={comments[pending.id] ?? ""}
                          onChange={(e) => handleCommentChange(pending.id, e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button type="button" onClick={() => actOnUser(pending.id, "approve")}>
                            Approve
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => actOnUser(pending.id, "reject")}>
                            Reject
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Profile Change Requests" helperText={`${requests.length} pending`}>
          {requests.length === 0 ? (
            <p className="text-sm text-ink-500">No pending change requests.</p>
          ) : (
            <Table>
              <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Requested Title</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-sm">
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900">
                        {`${request.profile.firstName} ${request.profile.lastName}`}
                      </p>
                      <p className="text-xs text-ink-400">Request #{request.id.slice(0, 6)}</p>
                    </td>
                    <td className="px-4 py-3">{request.profile.title}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <Input
                          placeholder="Comment"
                          value={comments[request.id] ?? ""}
                          onChange={(e) => handleCommentChange(request.id, e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button type="button" onClick={() => actOnRequest(request.id, "approve")}>
                            Approve
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => actOnRequest(request.id, "reject")}>
                            Reject
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
