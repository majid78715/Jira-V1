"use client";

import { DashboardTaskExceptionRow } from "../../lib/types";
import { Table } from "../ui/Table";

interface TaskExceptionsTableProps {
  rows: DashboardTaskExceptionRow[];
}

export function TaskExceptionsTable({ rows }: TaskExceptionsTableProps) {
  return (
    <Table
      className="mb-6"
      rows={rows}
      rowKey={(row) => row.taskId}
      columns={[
        {
          header: "Task",
          render: (row) => (
            <div>
              <p className="font-semibold text-ink-900">{row.title}</p>
              <p className="text-xs text-ink-500">{row.projectName}</p>
            </div>
          )
        },
        {
          header: "Status",
          render: (row) => (
            <div className="text-sm text-ink-700">
              {row.status}
              <p className="text-xs text-ink-500">{row.priority}</p>
            </div>
          )
        },
        {
          header: "Exception",
          render: (row) => (
            <div className="text-sm font-semibold text-rose-600">
              {row.exceptionType}
              {row.daysOverdue ? <span className="ml-1 text-xs text-ink-500">({row.daysOverdue}d)</span> : null}
            </div>
          )
        },
        {
          header: "Assignee",
          render: (row) => (
            <div className="text-sm text-ink-700">
              {row.assigneeName ?? "Unassigned"}
              {row.vendorName ? <p className="text-xs text-ink-500">{row.vendorName}</p> : null}
            </div>
          )
        }
      ]}
      emptyState={<p className="p-4 text-sm text-ink-500">No exception tasks.</p>}
    />
  );
}
