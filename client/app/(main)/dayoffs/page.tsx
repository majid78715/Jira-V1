"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PageShell } from "../../../components/layout/PageShell";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../lib/apiClient";
import { DayOff, User } from "../../../lib/types";

interface DayOffResponse {
  dayOffs: DayOff[];
  users: User[];
}

const statusTone: Record<DayOff["status"], "success" | "neutral" | "warning"> = {
  APPROVED: "success",
  SUBMITTED: "neutral",
  DRAFT: "neutral",
  REJECTED: "warning",
  CANCELLED: "warning"
};

export default function DayOffsPage() {
  const { user, loading } = useCurrentUser({ redirectTo: "/login" });
  const [myRequests, setMyRequests] = useState<DayOff[]>([]);
  const [pendingRequests, setPendingRequests] = useState<DayOff[]>([]);
  const [userLookup, setUserLookup] = useState<Record<string, User>>({});
  const [form, setForm] = useState({ date: "", reason: "" });
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canApprove = useMemo(() => (user ? ["PM", "PROJECT_MANAGER", "SUPER_ADMIN"].includes(user.role) : false), [user]);

  useEffect(() => {
    if (!user) return;
    const loadMine = async () => {
      const data = await apiRequest<DayOffResponse>("/leave?scope=mine");
      setMyRequests(data.dayOffs ?? []);
      setUserLookup((prev) => {
        const merged = { ...prev };
        data.users?.forEach((entry) => {
          merged[entry.id] = entry;
        });
        return merged;
      });
    };
    const loadPending = async () => {
      if (!canApprove) {
        setPendingRequests([]);
        return;
      }
      const scopeParam = user.role === "PROJECT_MANAGER" ? "vendor" : "team";
      const data = await apiRequest<DayOffResponse>(`/leave?scope=${scopeParam}`);
      setPendingRequests(data.dayOffs ?? []);
      setUserLookup((prev) => {
        const merged = { ...prev };
        data.users?.forEach((entry) => {
          merged[entry.id] = entry;
        });
        return merged;
      });
    };
    void loadMine();
    void loadPending();
  }, [user, canApprove]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      await apiRequest("/leave", {
        method: "POST",
        body: JSON.stringify({
          date: form.date,
          reason: form.reason || undefined,
          leaveType: "ANNUAL",
          isPartialDay: false
        })
      });
      setForm({ date: "", reason: "" });
      setStatus("Request submitted.");
      const data = await apiRequest<DayOffResponse>("/leave?scope=mine");
      setMyRequests(data.dayOffs ?? []);
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (id: string, action: "APPROVE" | "REJECT") => {
    try {
      const endpoint = action === "APPROVE" ? "approve" : "reject";
      await apiRequest(`/leave/${id}/${endpoint}`, {
        method: "POST",
        body: JSON.stringify({})
      });
      const mine = await apiRequest<DayOffResponse>("/leave?scope=mine");
      setMyRequests(mine.dayOffs ?? []);
      if (canApprove) {
        const scopeParam = user?.role === "PROJECT_MANAGER" ? "vendor" : "team";
        const pending = await apiRequest<DayOffResponse>(`/leave?scope=${scopeParam}`);
        setPendingRequests(pending.dayOffs ?? []);
        setUserLookup((prev) => {
          const merged = { ...prev };
          pending.users?.forEach((entry) => {
            merged[entry.id] = entry;
          });
          return merged;
        });
      }
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to update request.");
    }
  };

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading...</div>;
  }

  const resolveUserName = (userId: string) => {
    const entry = userLookup[userId];
    if (!entry) return "Unknown user";
    return `${entry.profile.firstName} ${entry.profile.lastName}`;
  };

  return (
    <PageShell
      title="Day Offs"
      subtitle="Request time away and approve submissions"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Request day off">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-sm font-medium text-ink-700">Date</label>
              <Input type="date" value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Reason</label>
              <Input value={form.reason} onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))} placeholder="Optional" />
            </div>
            {status && <p className="text-sm text-ink-500">{status}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit request"}
            </Button>
          </form>
        </Card>
        <Card title="My requests">
          {myRequests.length === 0 ? (
            <p className="text-sm text-ink-500">No requests yet.</p>
          ) : (
            <ul className="space-y-3">
              {myRequests.map((request) => (
                <li key={request.id} className="rounded-xl border border-ink-100 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{new Date(request.date).toLocaleDateString()}</p>
                      <p className="text-xs text-ink-500">
                        {request.leaveType} · {request.reason || "No reason provided"}
                      </p>
                    </div>
                    <Badge label={request.status} tone={statusTone[request.status]} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {canApprove && (
        <Card title="Pending approvals" className="mt-6">
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-ink-500">No pending requests.</p>
          ) : (
            <ul className="space-y-3">
              {pendingRequests.map((request) => (
                <li key={request.id} className="rounded-xl border border-ink-100 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{resolveUserName(request.userId)}</p>
                      <p className="text-xs text-ink-500">
                        {new Date(request.date).toLocaleDateString()} · {request.leaveType}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        className="px-3 py-1 text-xs"
                        onClick={() => handleDecision(request.id, "APPROVE")}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-3 py-1 text-xs"
                        onClick={() => handleDecision(request.id, "REJECT")}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </PageShell>
  );
}
