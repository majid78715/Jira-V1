"use client";

import { Fragment } from "react";
import { DashboardChartPayload } from "../../lib/types";
import { Card } from "../ui/Card";

interface ChartGridProps {
  charts?: Record<string, DashboardChartPayload>;
  onSelect?: (chartId: string, label: string) => void;
}

export function ChartGrid({ charts, onSelect }: ChartGridProps) {
  const entries = charts ? Object.values(charts) : [];
  if (!entries.length) {
    return null;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {entries.map((chart) => {
        const rows = resolveRows(chart);
        return (
          <Card key={chart.id} title={chart.title}>
            <div className="space-y-2">
              {rows.map((row) => (
                <button
                  key={row.label}
                  className="w-full rounded-xl border border-transparent px-3 py-2 text-left transition hover:border-brand-200 hover:bg-brand-gradient-subtle"
                  onClick={() => onSelect?.(chart.id, row.label)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-ink-800">{row.label}</span>
                    <span className="text-sm text-ink-500">{row.total}</span>
                  </div>
                  <div className="mt-1 flex gap-2 text-xs text-ink-500">
                    {row.series.map((value, index) => (
                      <Fragment key={`${row.label}-${index}`}>
                        {index > 0 && <span className="text-ink-300">•</span>}
                        <span>
                          {value.label}: <span className="font-semibold text-ink-800">{value.value}</span>
                        </span>
                      </Fragment>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function resolveRows(chart: DashboardChartPayload): Array<{
  label: string;
  total: number;
  series: Array<{ label: string; value: number }>;
}> {
  if (chart.categories?.length) {
    return chart.categories.map((category, index) => {
      const seriesValues = chart.series.map((series) => ({
        label: series.label,
        value: Number(series.values[index] ?? 0)
      }));
      return {
        label: category,
        total: seriesValues.reduce((sum, item) => sum + item.value, 0),
        series: seriesValues
      };
    });
  }
  return chart.series.map((series) => {
    const value = Number(series.values[0] ?? 0);
    return {
      label: series.label,
      total: value,
      series: [{ label: series.label, value }]
    };
  });
}
