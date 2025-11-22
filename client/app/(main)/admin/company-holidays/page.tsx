"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "../../../../components/layout/PageShell";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/Input";
import { Button } from "../../../../components/ui/Button";
import { Table } from "../../../../components/ui/Table";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../../lib/apiClient";
import { CompanyHoliday } from "../../../../lib/types";

type HolidayRow = {
  id: string;
  name: string;
  dateLabel: string;
};

export default function CompanyHolidaysPage() {
  const { user, loading } = useCurrentUser({ redirectTo: "/login", requiredRoles: ["PM", "SUPER_ADMIN"] });
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", date: "" });
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const query = user.companyId ? `?companyId=${user.companyId}` : "";
        const data = await apiRequest<{ holidays: CompanyHoliday[] }>(`/company-holidays${query}`);
        setHolidays(data.holidays ?? []);
      } catch (error) {
        const apiError = error as ApiError;
        setStatus(apiError?.message ?? "Unable to load holidays.");
      }
    };
    void load();
  }, [user]);

  const resetForm = () => {
    setForm({ name: "", date: "" });
    setEditingId(null);
  };

  const beginEditHoliday = (holidayId: string) => {
    const match = holidays.find((holiday) => holiday.id === holidayId);
    if (!match) return;
    setForm({ name: match.name, date: match.date });
    setEditingId(holidayId);
    setStatus(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setStatus(null);
    try {
      if (editingId) {
        const payload = await apiRequest<{ holiday: CompanyHoliday }>(`/company-holidays/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name,
            date: form.date
          })
        });
        setHolidays((prev) => prev.map((holiday) => (holiday.id === payload.holiday.id ? payload.holiday : holiday)));
        resetForm();
        setStatus("Holiday updated.");
      } else {
        const payload = await apiRequest<{ holiday: CompanyHoliday }>("/company-holidays", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            date: form.date,
            companyId: user.companyId
          })
        });
        setHolidays((prev) => [...prev, payload.holiday]);
        resetForm();
        setStatus("Holiday added.");
      }
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? (editingId ? "Unable to update holiday." : "Unable to add holiday."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (holidayId: string) => {
    if (!user) return;
    setStatus(null);
    setDeletingId(holidayId);
    try {
      await apiRequest<null>(`/company-holidays/${holidayId}`, { method: "DELETE" });
      setHolidays((prev) => prev.filter((holiday) => holiday.id !== holidayId));
      if (editingId === holidayId) {
        resetForm();
      }
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to delete holiday.");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading...</div>;
  }

  const rows: HolidayRow[] = holidays.map((holiday) => ({
    id: holiday.id,
    name: holiday.name,
    dateLabel: new Date(holiday.date).toLocaleDateString()
  }));

  const isEditing = Boolean(editingId);

  return (
    <PageShell
      title="Company Holidays"
      subtitle="Manage schedules for your organization"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Holiday List">
          {holidays.length === 0 ? (
            <p className="text-sm text-ink-500">No holidays configured.</p>
          ) : (
            <Table<HolidayRow>
              columns={[
                { header: "Name", accessor: "name" },
                { header: "Date", accessor: "dateLabel" },
                {
                  id: "actions",
                  header: "",
                  headerClassName: "w-px",
                  cellClassName: "text-right",
                  render: (row) => (
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-3 py-1 text-xs font-medium"
                        onClick={() => beginEditHoliday(row.id)}
                      >
                        {editingId === row.id ? "Editing" : "Edit"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-3 py-1 text-xs font-medium text-red-600 hover:text-red-700"
                        disabled={deletingId === row.id}
                        onClick={() => handleDelete(row.id)}
                      >
                        {deletingId === row.id ? "Removing..." : "Delete"}
                      </Button>
                    </div>
                  )
                }
              ]}
              rows={rows}
              rowKey={(row) => row.id}
            />
          )}
        </Card>
        <Card title={isEditing ? "Edit Holiday" : "Add Holiday"}>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-sm font-medium text-ink-700">Holiday name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Date</label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                required
              />
            </div>
            {status && <p className="text-sm text-ink-500">{status}</p>}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? (isEditing ? "Saving..." : "Saving...") : isEditing ? "Update holiday" : "Save holiday"}
              </Button>
              {isEditing && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-sm text-ink-500"
                  onClick={() => {
                    resetForm();
                    setStatus(null);
                  }}
                >
                  Cancel edit
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </PageShell>
  );
}
