"use client";

import { FormEvent, useMemo, useState } from "react";
import { DashboardFilterParams, DashboardSavedView } from "../../lib/types";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";

type ArrayFilterKey =
  | "businessUnitIds"
  | "productModuleIds"
  | "projectIds"
  | "vendorIds"
  | "productManagerIds"
  | "statusList"
  | "riskLevels"
  | "healthList";

interface FilterBarProps {
  filters: DashboardFilterParams;
  onChange: (next: DashboardFilterParams) => void;
  onRefresh: () => void;
  onReset: () => void;
  savedViews: DashboardSavedView[];
  onApplySavedView: (viewId: string) => void;
  onSaveView: (name: string) => void;
  selectedViewId?: string;
  loading?: boolean;
  savingView?: boolean;
}

const granularityOptions = [
  { label: "Daily", value: "day" },
  { label: "Weekly", value: "week" },
  { label: "Monthly", value: "month" },
  { label: "Quarterly", value: "quarter" }
];

const arrayFields: Array<{ key: ArrayFilterKey; label: string; placeholder?: string }> = [
  { key: "businessUnitIds", label: "Business Units" },
  { key: "productModuleIds", label: "Product Modules" },
  { key: "projectIds", label: "Project IDs" },
  { key: "vendorIds", label: "Vendor IDs" },
  { key: "productManagerIds", label: "Product Manager IDs" },
  { key: "statusList", label: "Statuses" },
  { key: "riskLevels", label: "Risk Levels" },
  { key: "healthList", label: "Health" }
];

export function FilterBar({
  filters,
  onChange,
  onRefresh,
  onReset,
  savedViews,
  onApplySavedView,
  onSaveView,
  selectedViewId,
  loading,
  savingView
}: FilterBarProps) {
  const [viewName, setViewName] = useState("");

  const formattedArrays = useMemo(() => {
    const entries: Record<ArrayFilterKey, string> = {
      businessUnitIds: "",
      productModuleIds: "",
      projectIds: "",
      vendorIds: "",
      productManagerIds: "",
      statusList: "",
      riskLevels: "",
      healthList: ""
    };
    (Object.keys(entries) as ArrayFilterKey[]).forEach((key) => {
      const value = filters[key];
      entries[key] = Array.isArray(value) ? value.join(", ") : "";
    });
    return entries;
  }, [filters]);

  const handleDateChange = (key: "dateFrom" | "dateTo", value: string) => {
    onChange({
      ...filters,
      [key]: value ? new Date(value).toISOString() : undefined
    });
  };

  const handleGranularityChange = (value: string) => {
    onChange({
      ...filters,
      timeGranularity: value as DashboardFilterParams["timeGranularity"]
    });
  };

  const handleArrayChange = (key: ArrayFilterKey, value: string) => {
    const tokens = value
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);
    onChange({
      ...filters,
      [key]: tokens.length ? tokens : undefined
    });
  };

  const handleSaveView = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!viewName.trim()) {
      return;
    }
    onSaveView(viewName.trim());
    setViewName("");
  };

  return (
    <Card className="mb-6" title="Filters">
      <div className="grid gap-4 lg:grid-cols-4">
        <div>
          <label className="text-xs font-semibold uppercase text-ink-500">Date From</label>
          <Input
            type="date"
            value={filters.dateFrom ? filters.dateFrom.slice(0, 10) : ""}
            onChange={(event) => handleDateChange("dateFrom", event.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase text-ink-500">Date To</label>
          <Input
            type="date"
            value={filters.dateTo ? filters.dateTo.slice(0, 10) : ""}
            onChange={(event) => handleDateChange("dateTo", event.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase text-ink-500">Time Granularity</label>
          <Select
            value={filters.timeGranularity ?? "week"}
            onChange={(event) => handleGranularityChange(event.target.value)}
          >
            {granularityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase text-ink-500">Saved Views</label>
          <Select
            value={selectedViewId ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) {
                return;
              }
              onApplySavedView(value);
            }}
          >
            <option value="">Select view...</option>
            {savedViews.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {arrayFields.map((field) => (
          <div key={field.key}>
            <label className="text-xs font-semibold uppercase text-ink-500">{field.label}</label>
            <Input
              placeholder={field.placeholder ?? "Comma separated"}
              value={formattedArrays[field.key]}
              onChange={(event) => handleArrayChange(field.key, event.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="button" variant="primary" onClick={onRefresh} disabled={loading}>
          Refresh Data
        </Button>
        <Button type="button" variant="secondary" onClick={onReset}>
          Reset Filters
        </Button>

        <form className="flex flex-1 items-center gap-2" onSubmit={handleSaveView}>
          <Input
            value={viewName}
            onChange={(event) => setViewName(event.target.value)}
            placeholder="Save filters as view"
          />
          <Button type="submit" variant="secondary" disabled={savingView || !viewName.trim()}>
            Save View
          </Button>
        </form>
      </div>
    </Card>
  );
}
