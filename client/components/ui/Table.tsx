"use client";

import { PropsWithChildren, ReactNode } from "react";
import clsx from "clsx";

type TableColumn<Row extends Record<string, unknown>> = {
  id?: string;
  header: ReactNode;
  accessor?: keyof Row;
  render?: (row: Row, index: number) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
};

type TableProps<Row extends Record<string, unknown> = Record<string, ReactNode>> = PropsWithChildren<{
  className?: string;
  columns?: TableColumn<Row>[];
  rows?: Row[];
  rowKey?: (row: Row, index: number) => string | number;
  emptyState?: ReactNode;
}>;

export function Table<Row extends Record<string, unknown> = Record<string, ReactNode>>({
  className,
  columns,
  rows,
  children,
  rowKey,
  emptyState
}: TableProps<Row>) {
  const hasStructuredData = Array.isArray(columns) && columns.length > 0 && Array.isArray(rows);
  const resolvedRows = rows ?? [];

  return (
    <div className={clsx("overflow-hidden rounded-2xl border border-ink-100 bg-white", className)}>
      <table className="min-w-full divide-y divide-ink-100 text-sm">
        {hasStructuredData ? (
          <>
            <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
              <tr>
                {columns!.map((column) => (
                  <th key={column.id ?? String(column.header)} className={clsx("px-4 py-3", column.headerClassName)}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 text-sm text-ink-700">
              {resolvedRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-ink-400" colSpan={columns!.length}>
                    {emptyState ?? "No records to display."}
                  </td>
                </tr>
              ) : (
                resolvedRows.map((row, index) => (
                  <tr key={rowKey ? rowKey(row, index) : index}>
                    {columns!.map((column) => (
                      <td key={column.id ?? String(column.header)} className={clsx("px-4 py-3", column.cellClassName)}>
                        {column.render
                          ? column.render(row as Row, index)
                          : column.accessor
                          ? (row[column.accessor] as ReactNode)
                          : null}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </>
        ) : (
          children
        )}
      </table>
    </div>
  );
}
