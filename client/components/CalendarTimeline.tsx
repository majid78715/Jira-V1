"use client";

import { CalendarEvent } from "../lib/types";
import { Badge } from "./ui/Badge";

interface CalendarTimelineProps {
  events: CalendarEvent[];
  loading?: boolean;
  emptyState?: string;
}

const typeLabels: Record<CalendarEvent["type"], string> = {
  ASSIGNMENT: "Assignment",
  MILESTONE: "Milestone",
  DAY_OFF: "Day off",
  HOLIDAY: "Holiday"
};

const toneMap: Record<CalendarEvent["type"], "success" | "neutral" | "warning"> = {
  ASSIGNMENT: "success",
  MILESTONE: "neutral",
  DAY_OFF: "warning",
  HOLIDAY: "neutral"
};

export function CalendarTimeline({ events, loading, emptyState = "No calendar entries." }: CalendarTimelineProps) {
  if (loading) {
    return <p className="text-sm text-ink-500">Loading calendar...</p>;
  }

  if (!events?.length) {
    return <p className="text-sm text-ink-500">{emptyState}</p>;
  }

  const sorted = [...events].sort((a, b) =>
    a.startDate === b.startDate ? a.title.localeCompare(b.title) : a.startDate.localeCompare(b.startDate)
  );
  const grouped = sorted.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
    acc[event.startDate] = acc[event.startDate] ?? [];
    acc[event.startDate].push(event);
    return acc;
  }, {});
  const days = Object.keys(grouped).sort();

  return (
    <div className="space-y-6">
      {days.map((day) => (
        <div key={day}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{formatDateLabel(day)}</p>
          <div className="space-y-2">
            {grouped[day].map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-2xl border border-ink-100 bg-white/70 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-ink-900">{event.title}</p>
                  {event.subtitle && <p className="text-xs text-ink-500">{event.subtitle}</p>}
                  <p className="text-xs text-ink-400">{formatEventRange(event)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge label={typeLabels[event.type]} tone={toneMap[event.type]} />
                  {event.status && (
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{event.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(
    new Date(`${value}T00:00:00Z`)
  );
}

function formatEventRange(event: CalendarEvent) {
  const start = formatShortDate(event.startDate);
  const end = formatShortDate(event.endDate);
  if (event.startDate === event.endDate) {
    return start;
  }
  return `${start} → ${end}`;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}
