"use client";

import Link from "next/link";
import { DashboardAlertsSummary } from "../../lib/types";
import { Card } from "../ui/Card";

interface AlertsPanelProps {
  summary: DashboardAlertsSummary | null;
  alertsLink: string;
}

export function AlertsPanel({ summary, alertsLink }: AlertsPanelProps) {
  if (!summary) {
    return null;
  }

  const rows = summary.rows.slice(0, 6);

  return (
    <Card
      title="Alerts"
      helperText={
        <Link href={alertsLink} className="text-sm font-semibold text-brand-600 hover:underline">
          View all alerts
        </Link>
      }
    >
      <div className="mb-4 flex items-center gap-6 text-sm">
        <div>
          <p className="text-xs uppercase text-ink-500">Open</p>
          <p className="text-2xl font-semibold text-rose-600">{summary.openCount}</p>
        </div>
        <div className="flex-1">
          <p className="text-xs uppercase text-ink-500">Top Types</p>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            {Object.entries(summary.byType)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([type, count]) => (
                <span key={type} className="rounded-full bg-brand-gradient-subtle px-3 py-1 font-semibold text-ink-700">
                  {type} ({count})
                </span>
              ))}
          </div>
        </div>
      </div>

      <ul className="divide-y divide-ink-100">
        {rows.map((alert) => (
          <li key={alert.id} className="py-3">
            <p className="text-sm font-semibold text-ink-900">{alert.message}</p>
            <p className="text-xs text-ink-500">
              {alert.projectName ?? "Portfolio"} · {alert.type}
              {alert.severity ? ` · ${alert.severity}` : null}
            </p>
          </li>
        ))}
        {!rows.length && <p className="py-4 text-sm text-ink-500">No alerts in scope.</p>}
      </ul>
    </Card>
  );
}
