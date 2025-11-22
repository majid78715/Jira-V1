"use client";

import { DashboardProjectRow } from "../../lib/types";
import { Table } from "../ui/Table";

interface ProjectsTableProps {
  rows: DashboardProjectRow[];
  onSelect?: (row: DashboardProjectRow) => void;
}

export function ProjectsTable({ rows, onSelect }: ProjectsTableProps) {
  return (
    <Table<DashboardProjectRow & Record<string, unknown>>
      className="mb-6"
      rows={rows as (DashboardProjectRow & Record<string, unknown>)[]}
      rowKey={(row) => row.projectId}
      columns={[
        {
          header: "Project",
          render: (row) => (
            <button
              type="button"
              className="flex w-full flex-col text-left"
              onClick={() => onSelect?.(row as DashboardProjectRow)}
            >
              <span className="font-semibold text-ink-900">{row.name}</span>
              <span className="text-xs text-ink-500">{row.code}</span>
            </button>
          )
        },
        {
          header: "Status",
          render: (row) => (
            <div className="text-sm">
              <p className="font-semibold text-ink-900">{row.status}</p>
              <p className="text-xs text-ink-500">
                Health: <span className="font-semibold">{row.health}</span>
              </p>
            </div>
          )
        },
        {
          header: "Progress",
          render: (row) => (
            <div className="text-sm text-ink-700">
              {row.progressPercent}% - Plan {row.plannedPercent}%
            </div>
          )
        },
        {
          header: "Hours",
          render: (row) => {
            const hoursLogged = typeof row.hoursLogged === 'number' ? row.hoursLogged : 0;
            const budgetHours = typeof row.budgetHours === 'number' ? row.budgetHours : 0;
            return (
              <div className="text-sm text-ink-700">
                {hoursLogged.toFixed(1)}h / {budgetHours.toFixed(1)}h
              </div>
            );
          }
        },
        {
          header: "Alerts",
          render: (row) => <span className="text-sm font-semibold text-rose-600">{row.openAlerts}</span>
        }
      ]}
      emptyState={<p className="p-4 text-sm text-ink-500">No projects match these filters.</p>}
    />
  );
}

