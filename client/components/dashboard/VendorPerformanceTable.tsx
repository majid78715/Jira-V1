"use client";

import { DashboardVendorRow } from "../../lib/types";
import { Table } from "../ui/Table";

interface VendorPerformanceTableProps {
  rows: DashboardVendorRow[];
  onSelect?: (row: DashboardVendorRow) => void;
}

export function VendorPerformanceTable({ rows, onSelect }: VendorPerformanceTableProps) {
  return (
    <Table
      className="mb-6"
      rows={rows}
      rowKey={(row) => row.vendorId}
      columns={[
        {
          header: "Vendor",
          render: (row) => (
            <button className="text-left font-semibold text-ink-900" onClick={() => onSelect?.(row)}>
              {row.vendorName}
            </button>
          )
        },
        {
          header: "Hours",
          render: (row) => <span className="text-sm text-ink-700">{row.hoursLogged.toFixed(1)}h</span>
        },
        {
          header: "Utilisation",
          render: (row) => <span className="text-sm text-ink-700">{row.utilisationPercent}%</span>
        },
        {
          header: "SLA",
          render: (row) => <span className="text-sm text-ink-700">{row.slaAdherencePercent}%</span>
        },
        {
          header: "Risks",
          render: (row) => (
            <div className="text-sm text-ink-700">
              <p>Overdue: {row.overdueTasks}</p>
              <p>Blocked: {row.blockedTasks}</p>
            </div>
          )
        }
      ]}
      emptyState={<p className="p-4 text-sm text-ink-500">No vendor metrics available.</p>}
    />
  );
}
