"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "../../../components/layout/PageShell";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { apiRequest, ApiError } from "../../../lib/apiClient";
import {
  Company,
  Role,
  TimesheetSummaryGroup,
  TimesheetSummaryReport,
  UserDirectoryEntry,
  VendorPerformanceReport
} from "../../../lib/types";
import {
  downloadReportCsv,
  fetchTimesheetSummaryReport,
  fetchVendorPerformanceReport
} from "../../../lib/reports";
import { fetchUserDirectory } from "../../../lib/users";

const ROLE_OPTIONS: Role[] = ["SUPER_ADMIN", "VP", "PM", "ENGINEER", "PROJECT_MANAGER", "DEVELOPER", "VIEWER"];

const defaultDates = getDefaultDateRange();

export default function ReportsPage() {
  const { user, loading } = useCurrentUser({ redirectTo: "/login" });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyError, setCompanyError] = useState<string | null>(null);

  const [vendorId, setVendorId] = useState<string>("");
  const [vendorFrom, setVendorFrom] = useState(defaultDates.from);
  const [vendorTo, setVendorTo] = useState(defaultDates.to);
  const [vendorReport, setVendorReport] = useState<VendorPerformanceReport | null>(null);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [vendorError, setVendorError] = useState<string | null>(null);

  const [timesheetFrom, setTimesheetFrom] = useState(defaultDates.from);
  const [timesheetTo, setTimesheetTo] = useState(defaultDates.to);
  const [timesheetGroupBy, setTimesheetGroupBy] = useState<TimesheetSummaryGroup>("user");
  const [timesheetReport, setTimesheetReport] = useState<TimesheetSummaryReport | null>(null);
  const [timesheetLoading, setTimesheetLoading] = useState(false);
  const [timesheetError, setTimesheetError] = useState<string | null>(null);

  const [directoryFilters, setDirectoryFilters] = useState({
    role: "" as Role | "",
    country: "",
    city: "",
    timeZone: "",
    query: ""
  });
  const [directoryResults, setDirectoryResults] = useState<UserDirectoryEntry[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }
    const loadCompanies = async () => {
      try {
        const response = await apiRequest<{ companies: Company[] }>("/companies");
        const vendors = response.companies.filter((company) => company.type === "VENDOR");
        setCompanies(vendors);
        if (!vendorId && vendors.length) {
          setVendorId(vendors[0].id);
        }
      } catch (err) {
        const apiErr = err as ApiError;
        setCompanyError(apiErr?.message ?? "Unable to load companies.");
      }
    };
    loadCompanies();
  }, [user, vendorId]);

  const handleVendorReport = useCallback(async () => {
    if (!vendorId) {
      return;
    }
    setVendorLoading(true);
    setVendorError(null);
    try {
      const report = await fetchVendorPerformanceReport({
        companyId: vendorId,
        from: vendorFrom,
        to: vendorTo
      });
      setVendorReport(report);
    } catch (err) {
      const apiErr = err as ApiError;
      setVendorError(apiErr?.message ?? "Unable to load vendor performance.");
      setVendorReport(null);
    } finally {
      setVendorLoading(false);
    }
  }, [vendorFrom, vendorId, vendorTo]);

  const handleTimesheetReport = useCallback(async () => {
    setTimesheetLoading(true);
    setTimesheetError(null);
    try {
      const report = await fetchTimesheetSummaryReport({
        from: timesheetFrom,
        to: timesheetTo,
        groupBy: timesheetGroupBy
      });
      setTimesheetReport(report);
    } catch (err) {
      const apiErr = err as ApiError;
      setTimesheetError(apiErr?.message ?? "Unable to load timesheet summary.");
      setTimesheetReport(null);
    } finally {
      setTimesheetLoading(false);
    }
  }, [timesheetFrom, timesheetGroupBy, timesheetTo]);

  const handleDirectorySearch = useCallback(async () => {
    setDirectoryLoading(true);
    setDirectoryError(null);
    try {
      const users = await fetchUserDirectory({
        role: directoryFilters.role,
        country: directoryFilters.country,
        city: directoryFilters.city,
        timeZone: directoryFilters.timeZone,
        query: directoryFilters.query
      });
      setDirectoryResults(users);
    } catch (err) {
      const apiErr = err as ApiError;
      setDirectoryError(apiErr?.message ?? "Unable to search users.");
      setDirectoryResults([]);
    } finally {
      setDirectoryLoading(false);
    }
  }, [directoryFilters]);

  const handleClearDirectoryFilters = useCallback(() => {
    setDirectoryFilters({ role: "", country: "", city: "", timeZone: "", query: "" });
    setDirectoryResults([]);
    setDirectoryError(null);
  }, []);

  const handleVendorCsv = useCallback(async () => {
    if (!vendorId) {
      return;
    }
    try {
      await downloadReportCsv(
        "/reports/vendor-performance",
        { companyId: vendorId, from: vendorFrom, to: vendorTo },
        `vendor-performance-${vendorId || "vendor"}.csv`
      );
    } catch (err) {
      const apiErr = err as ApiError;
      setVendorError(apiErr?.message ?? "Unable to export vendor report.");
    }
  }, [vendorFrom, vendorId, vendorTo]);

  const handleTimesheetCsv = useCallback(async () => {
    try {
      await downloadReportCsv(
        "/reports/timesheet-summary",
        { from: timesheetFrom, to: timesheetTo, groupBy: timesheetGroupBy },
        `timesheet-summary-${timesheetGroupBy}.csv`
      );
    } catch (err) {
      const apiErr = err as ApiError;
      setTimesheetError(apiErr?.message ?? "Unable to export timesheet report.");
    }
  }, [timesheetFrom, timesheetGroupBy, timesheetTo]);

  useEffect(() => {
    if (vendorId) {
      handleVendorReport();
      handleTimesheetReport();
      handleDirectorySearch();
    }
  }, [vendorId, handleVendorReport, handleTimesheetReport, handleDirectorySearch]);

  const vendorSummary = useMemo(() => {
    if (!vendorReport) {
      return null;
    }
    return [
      { label: "Hours logged", value: vendorReport.totals.hoursLogged.toFixed(1) },
      { label: "Tasks touched", value: vendorReport.totals.tasksTouched.toString() },
      { label: "Blocked tasks", value: vendorReport.totals.blockedTasks.toString() },
      {
        label: "Avg hrs per task",
        value: vendorReport.totals.averageHoursPerTask.toFixed(1)
      }
    ];
  }, [vendorReport]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading reports…</div>;
  }

  return (
    <PageShell
      title="Reporting & Search"
      subtitle="Vendor health, time usage, and user directory filters"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUserId={user.id}
      currentUser={user}
    >
      <div className="space-y-10">
        <section className="space-y-4">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink-900">Vendor performance</h2>
              <p className="text-sm text-ink-500">Track hours, contributors, and blocked work by vendor.</p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={!vendorId}
                onClick={handleVendorCsv}
              >
                Export CSV
              </Button>
              <Button type="button" onClick={handleVendorReport} disabled={vendorLoading}>
                {vendorLoading ? "Refreshing…" : "Run report"}
              </Button>
            </div>
          </header>
          {companyError ? <p className="text-sm text-red-600">{companyError}</p> : null}
          <div className="grid gap-4 lg:grid-cols-4">
            <div>
              <label className="text-xs font-semibold uppercase text-ink-500">Vendor</label>
              <select
                className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
                value={vendorId}
                onChange={(event) => setVendorId(event.target.value)}
              >
                <option value="">Select vendor</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-ink-500">From</label>
              <Input
                className="mt-1"
                type="date"
                value={vendorFrom}
                onChange={(event) => setVendorFrom(event.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-ink-500">To</label>
              <Input
                className="mt-1"
                type="date"
                value={vendorTo}
                onChange={(event) => setVendorTo(event.target.value)}
              />
            </div>
          </div>
          {vendorError ? <p className="text-sm text-red-600">{vendorError}</p> : null}
          {vendorReport ? (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                {vendorSummary?.map((stat) => (
                  <Card key={stat.label} title={stat.label}>
                    <p className="text-2xl font-semibold text-ink-900">{stat.value}</p>
                  </Card>
                ))}
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-ink-100 bg-white">
                  <div className="border-b border-ink-100 px-4 py-3">
                    <p className="text-sm font-semibold text-ink-700">Top tasks</p>
                  </div>
                  <div className="divide-y divide-ink-100">
                    {vendorReport.tasks.slice(0, 5).map((task) => (
                      <div key={task.taskId} className="px-4 py-3">
                        <p className="text-sm font-semibold text-ink-900">{task.title}</p>
                        <p className="text-xs text-ink-500">{task.projectName}</p>
                        <div className="mt-1 flex items-center justify-between text-xs text-ink-500">
                          <span>Status: {task.status}</span>
                          <span>{formatHours(task.minutesLogged)}</span>
                        </div>
                      </div>
                    ))}
                    {!vendorReport.tasks.length && <p className="px-4 py-3 text-sm text-ink-400">No tasks yet.</p>}
                  </div>
                </div>
                <div className="rounded-2xl border border-ink-100 bg-white">
                  <div className="border-b border-ink-100 px-4 py-3">
                    <p className="text-sm font-semibold text-ink-700">Contributors</p>
                  </div>
                  <div className="divide-y divide-ink-100">
                    {vendorReport.contributors.map((contributor) => (
                      <div key={contributor.userId} className="px-4 py-3">
                        <p className="text-sm font-semibold text-ink-900">{contributor.name}</p>
                        <p className="text-xs text-ink-500">{contributor.role}</p>
                        <div className="mt-1 flex items-center justify-between text-xs text-ink-500">
                          <span>Entries: {contributor.entryCount}</span>
                          <span>{formatHours(contributor.totalMinutes)}</span>
                        </div>
                      </div>
                    ))}
                    {!vendorReport.contributors.length && (
                      <p className="px-4 py-3 text-sm text-ink-400">No contributors yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-ink-200 p-6 text-sm text-ink-400">
              Select a vendor to view performance data.
            </div>
          )}
        </section>

        <section className="space-y-4">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink-900">Timesheet summary</h2>
              <p className="text-sm text-ink-500">Group logged time by user or project.</p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleTimesheetCsv}
              >
                Export CSV
              </Button>
              <Button type="button" onClick={handleTimesheetReport} disabled={timesheetLoading}>
                {timesheetLoading ? "Refreshing…" : "Run report"}
              </Button>
            </div>
          </header>
          <div className="grid gap-4 lg:grid-cols-4">
            <div>
              <label className="text-xs font-semibold uppercase text-ink-500">From</label>
              <Input
                className="mt-1"
                type="date"
                value={timesheetFrom}
                onChange={(event) => setTimesheetFrom(event.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-ink-500">To</label>
              <Input
                className="mt-1"
                type="date"
                value={timesheetTo}
                onChange={(event) => setTimesheetTo(event.target.value)}
              />
            </div>
            <div className="lg:col-span-2">
              <label className="text-xs font-semibold uppercase text-ink-500">Group by</label>
              <select
                className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
                value={timesheetGroupBy}
                onChange={(event) => setTimesheetGroupBy(event.target.value as TimesheetSummaryGroup)}
              >
                <option value="user">User</option>
                <option value="project">Project</option>
              </select>
            </div>
          </div>
          {timesheetError ? <p className="text-sm text-red-600">{timesheetError}</p> : null}
          <div className="rounded-2xl border border-ink-100 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink-100 text-sm">
                <thead className="bg-ink-25 text-left text-xs font-semibold uppercase text-ink-500">
                  <tr>
                    <th className="px-4 py-3">Label</th>
                    <th className="px-4 py-3">Minutes</th>
                    <th className="px-4 py-3">Hours</th>
                    <th className="px-4 py-3">Entries</th>
                    {timesheetGroupBy === "user" && (
                      <>
                        <th className="px-4 py-3">Draft</th>
                        <th className="px-4 py-3">Submitted</th>
                        <th className="px-4 py-3">Approved</th>
                        <th className="px-4 py-3">Rejected</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 text-ink-700">
                  {timesheetReport?.rows?.length ? (
                    timesheetReport.rows.map((row) => (
                      <tr key={row.key}>
                        <td className="px-4 py-3">{row.label}</td>
                        <td className="px-4 py-3">{row.totalMinutes}</td>
                        <td className="px-4 py-3">{formatHours(row.totalMinutes)}</td>
                        <td className="px-4 py-3">{row.entryCount}</td>
                        {timesheetGroupBy === "user" && (
                          <>
                            <td className="px-4 py-3">{row.timesheetStatusCounts?.DRAFT ?? 0}</td>
                            <td className="px-4 py-3">{row.timesheetStatusCounts?.SUBMITTED ?? 0}</td>
                            <td className="px-4 py-3">{row.timesheetStatusCounts?.APPROVED ?? 0}</td>
                            <td className="px-4 py-3">{row.timesheetStatusCounts?.REJECTED ?? 0}</td>
                          </>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-center text-sm text-ink-400" colSpan={timesheetGroupBy === "user" ? 8 : 4}>
                        No time entries in this range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink-900">User directory filters</h2>
              <p className="text-sm text-ink-500">Slice the org by geography and role.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={handleClearDirectoryFilters}>
                Clear filters
              </Button>
              <Button type="button" onClick={handleDirectorySearch} disabled={directoryLoading}>
                {directoryLoading ? "Searching…" : "Search"}
              </Button>
            </div>
          </header>
          {directoryError ? <p className="text-sm text-red-600">{directoryError}</p> : null}
          <div className="grid gap-4 lg:grid-cols-5">
            <div>
              <label className="text-xs font-semibold uppercase text-ink-500">Role</label>
              <select
                className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
                value={directoryFilters.role}
                onChange={(event) =>
                  setDirectoryFilters((prev) => ({ ...prev, role: event.target.value as Role | "" }))
                }
              >
                <option value="">Any</option>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-ink-500">Country code</label>
              <Input
                className="mt-1"
                value={directoryFilters.country}
                onChange={(event) => setDirectoryFilters((prev) => ({ ...prev, country: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-ink-500">City</label>
              <Input
                className="mt-1"
                value={directoryFilters.city}
                onChange={(event) => setDirectoryFilters((prev) => ({ ...prev, city: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-ink-500">Time zone</label>
              <Input
                className="mt-1"
                value={directoryFilters.timeZone}
                onChange={(event) => setDirectoryFilters((prev) => ({ ...prev, timeZone: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-ink-500">Mobile contains</label>
              <Input
                className="mt-1"
                value={directoryFilters.query}
                onChange={(event) => setDirectoryFilters((prev) => ({ ...prev, query: event.target.value }))}
              />
            </div>
          </div>
          <div className="rounded-2xl border border-ink-100 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink-100 text-sm">
                <thead className="bg-ink-25 text-left text-xs font-semibold uppercase text-ink-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Time zone</th>
                    <th className="px-4 py-3">Mobile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 text-ink-700">
                  {directoryResults.length ? (
                    directoryResults.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold">{entry.name}</p>
                          <p className="text-xs text-ink-500">{entry.email}</p>
                        </td>
                        <td className="px-4 py-3">{entry.role}</td>
                        <td className="px-4 py-3">{entry.companyName ?? "—"}</td>
                        <td className="px-4 py-3">
                          {entry.city}, {entry.country}
                        </td>
                        <td className="px-4 py-3">{entry.timeZone}</td>
                        <td className="px-4 py-3">{entry.mobileNumber}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-center text-sm text-ink-400" colSpan={6}>
                        No users match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function getDefaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return {
    from: toInputValue(from),
    to: toInputValue(to)
  };
}

function toInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatHours(minutes: number) {
  return `${(minutes / 60).toFixed(1)}h`;
}
