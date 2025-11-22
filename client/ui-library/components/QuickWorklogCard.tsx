"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

export type QuickWorklogOption = {
  taskId: string;
  projectId: string;
  taskTitle: string;
  projectLabel?: string;
};

export interface QuickWorklogCardProps {
  options: QuickWorklogOption[];
  defaultDate: string;
  submitting: boolean;
  statusMessage?: string | null;
  errorMessage?: string | null;
  onSubmit: (payload: { taskId: string; projectId: string; date: string; hours: number; note: string }) => Promise<void> | void;
}

export function QuickWorklogCard({
  options,
  defaultDate,
  submitting,
  statusMessage,
  errorMessage,
  onSubmit
}: QuickWorklogCardProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string>(options[0]?.taskId ?? "");
  const [date, setDate] = useState(defaultDate);
  const [hours, setHours] = useState("1");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!options.length) {
      setSelectedTaskId("");
      return;
    }
    if (!options.some((option) => option.taskId === selectedTaskId)) {
      setSelectedTaskId(options[0].taskId);
    }
  }, [options, selectedTaskId]);

  useEffect(() => {
    setDate(defaultDate);
  }, [defaultDate]);

  const selectedOption = useMemo(() => options.find((option) => option.taskId === selectedTaskId), [options, selectedTaskId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    if (!selectedOption) {
      setLocalError("Select an active task.");
      return;
    }
    const parsedHours = Number.parseFloat(hours);
    if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
      setLocalError("Enter hours greater than zero.");
      return;
    }
    if (!note.trim()) {
      setLocalError("Add a quick summary note.");
      return;
    }
    await onSubmit({
      taskId: selectedOption.taskId,
      projectId: selectedOption.projectId,
      date,
      hours: parsedHours,
      note: note.trim()
    });
    setNote("");
  };

  if (!options.length) {
    return (
      <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-ink-900">Quick work log</p>
          <p className="text-xs text-ink-500">No in-progress assignments available for logging right now.</p>
          {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1 pb-4">
        <p className="text-sm font-semibold text-ink-900">Quick work log</p>
        <p className="text-xs text-ink-500">Capture today&apos;s hours with a short note for your project lead.</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-400" htmlFor="quick-log-task">
            Task
          </label>
          <select
            id="quick-log-task"
            className="rounded-xl border border-ink-100 bg-ink-25 px-3 py-2 text-sm text-ink-900 outline-none focus:border-ink-300"
            value={selectedTaskId}
            onChange={(event) => setSelectedTaskId(event.target.value)}
            disabled={submitting}
          >
            {options.map((option) => (
              <option key={option.taskId} value={option.taskId}>
                {option.taskTitle}
                {option.projectLabel ? ` - ${option.projectLabel}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-400" htmlFor="quick-log-date">
              Date
            </label>
            <input
              id="quick-log-date"
              type="date"
              className="rounded-xl border border-ink-100 bg-ink-25 px-3 py-2 text-sm text-ink-900 outline-none focus:border-ink-300"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-400" htmlFor="quick-log-hours">
              Hours
            </label>
            <input
              id="quick-log-hours"
              type="number"
              min={0.25}
              step={0.25}
              className="rounded-xl border border-ink-100 bg-ink-25 px-3 py-2 text-sm text-ink-900 outline-none focus:border-ink-300"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-400" htmlFor="quick-log-note">
            Note
          </label>
          <textarea
            id="quick-log-note"
            className="min-h-[72px] rounded-xl border border-ink-100 bg-ink-25 px-3 py-2 text-sm text-ink-900 outline-none focus:border-ink-300"
            placeholder="What did you move forward?"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={submitting}
          />
        </div>
        {localError ? <p className="text-sm text-red-600">{localError}</p> : null}
        {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
        {statusMessage ? <p className="text-sm text-emerald-600">{statusMessage}</p> : null}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? "Logging..." : "Log work"}
          </button>
        </div>
      </form>
    </section>
  );
}
