"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "../../../components/layout/PageShell";
import { Card } from "../../../components/ui/Card";
import { Table } from "../../../components/ui/Table";
import { Badge } from "../../../components/ui/Badge";
import { Select } from "../../../components/ui/Select";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../lib/apiClient";
import { Alert, AlertSummary } from "../../../lib/types";
import { ALERT_TYPE_META, ALERT_STATUS_META, formatAlertType } from "../../../lib/alerts";

const statusFilterOptions = [
  { label: "Open", value: "OPEN" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "All statuses", value: "" }
];

const alertTypeOptions = [{ label: "All alert types", value: "" }].concat(
  Object.entries(ALERT_TYPE_META).map(([value, meta]) => ({
    value,
    label: meta.label
  }))
);

export default function AlertsPage() {
  const { user, loading: sessionLoading } = useCurrentUser({ redirectTo: "/login" });
  const [filters, setFilters] = useState({ status: "OPEN", type: "", search: "" });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    if (!user) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status) {
        params.set("status", filters.status);
      }
      if (filters.type) {
        params.set("type", filters.type);
      }
      if (filters.search.trim()) {
        params.set("search", filters.search.trim());
      }
      const query = params.toString();
      const response = await apiRequest<{ alerts: Alert[]; summary: AlertSummary }>(
        `/alerts${query ? `?${query}` : ""}`
      );
      setAlerts(response.alerts);
      setSummary(response.summary);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError?.message ?? "Unable to load alerts.");
    } finally {
      setLoading(false);
    }
  }, [filters, user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    loadAlerts();
  }, [user, loadAlerts]);

  const handleResolve = useCallback(
    async (alertId: string) => {
      try {
        setResolvingId(alertId);
        await apiRequest(`/alerts/${alertId}/resolve`, { method: "POST" });
        await loadAlerts();
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError?.message ?? "Unable to resolve alert.");
      } finally {
        setResolvingId(null);
      }
    },
    [loadAlerts]
  );

  const summaryByType = useMemo(() => {
    const defaults: Record<string, number> = {};
    Object.keys(ALERT_TYPE_META).forEach((key) => {
      defaults[key] = summary?.byType?.[key as keyof typeof ALERT_TYPE_META] ?? 0;
    });
    return defaults;
  }, [summary]);

  const handleFilterChange = (field: "status" | "type" | "search", value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  if (sessionLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading alerts…</div>;
  }

  return (
    <PageShell
      title="Automation Alerts"
      subtitle="Rules engine notifications for compliance and budgets"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Open alerts" helperText="Realtime from automation service">
          {loading && !summary ? (
            <p className="text-sm text-ink-500">Checking rules…</p>
          ) : (
            <>
              <p className="text-3xl font-semibold text-brand-700">{summary?.open ?? 0}</p>
              <ul className="mt-4 space-y-2 text-sm text-ink-600">
                {Object.entries(ALERT_TYPE_META).map(([type, meta]) => (
                  <li key={type} className="flex items-center justify-between">
                    <span>{meta.label}</span>
                    <span className="font-semibold text-ink-900">{summaryByType[type]}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card className="lg:col-span-2" title="Filters" helperText="Refine by status or type">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-ink-500">Status</label>
              <Select value={filters.status} onChange={(event) => handleFilterChange("status", event.target.value)}>
                {statusFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-ink-500">Alert Type</label>
              <Select value={filters.type} onChange={(event) => handleFilterChange("type", event.target.value)}>
                {alertTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-ink-500">Search</label>
              <Input
                placeholder="Search message…"
                value={filters.search}
                onChange={(event) => handleFilterChange("search", event.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <Button type="button" onClick={() => loadAlerts()} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFilters({ status: "OPEN", type: "", search: "" })}
              disabled={loading}
            >
              Reset filters
            </Button>
          </div>
        </Card>
      </div>

      <Card className="mt-8" title="Alert queue" helperText={loading ? "Loading…" : `${alerts.length} alerts`}>
        {loading ? (
          <p className="text-sm text-ink-500">Scanning run history…</p>
        ) : alerts.length === 0 ? (
          <p className="text-sm text-ink-500">No alerts match the selected filters.</p>
        ) : (
          <Table>
            <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Alert</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-sm text-ink-900">
              {alerts.map((alert) => (
                <tr key={alert.id} className="hover:bg-ink-50/50">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{alert.message}</p>
                    <p className="text-xs text-ink-500">
                      Fingerprint: <span className="font-mono text-ink-600">{alert.fingerprint}</span>
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={formatAlertType(alert.type)} tone={ALERT_TYPE_META[alert.type]?.tone ?? "neutral"} />
                    <p className="mt-1 text-xs text-ink-500">{ALERT_TYPE_META[alert.type]?.helper}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      label={ALERT_STATUS_META[alert.status].label}
                      tone={ALERT_STATUS_META[alert.status].tone}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-600">{formatDateTime(alert.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={alert.status === "RESOLVED" || resolvingId === alert.id}
                      onClick={() => handleResolve(alert.id)}
                    >
                      {alert.status === "RESOLVED"
                        ? "Resolved"
                        : resolvingId === alert.id
                        ? "Resolving…"
                        : "Resolve"}
                    </Button>
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

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
