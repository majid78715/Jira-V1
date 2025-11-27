"use client";

import { MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Button } from "../../components/ui/Button";
import { apiRequest } from "../../lib/apiClient";
import { CalendarEvent, CalendarEventType, CalendarScope, User, UserCalendarResponse } from "../../lib/types";
import { CreateMeetingModal } from "./CreateMeetingModal";
import { MeetingDetailsPanel } from "./MeetingDetailsPanel";

type ViewType = "month" | "week" | "day" | "agenda";

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const eventTone: Record<
  CalendarEventType | "DEFAULT",
  { bg: string; border: string; text: string; dot: string }
> = {
  MEETING: {
    bg: "bg-[#e6f4ea]",
    border: "border-[#16a34a]",
    text: "text-[#166534]",
    dot: "bg-[#16a34a]"
  },
  HOLIDAY: {
    bg: "bg-[#e6f4ea]",
    border: "border-[#137333]",
    text: "text-[#137333]",
    dot: "bg-[#137333]"
  },
  DAY_OFF: {
    bg: "bg-[#fef3e6]",
    border: "border-[#c26402]",
    text: "text-[#c26402]",
    dot: "bg-[#c26402]"
  },
  ASSIGNMENT: {
    bg: "bg-[#f3e8ff]",
    border: "border-[#8f3ec4]",
    text: "text-[#6b21a8]",
    dot: "bg-[#8f3ec4]"
  },
  MILESTONE: {
    bg: "bg-[#e8eaed]",
    border: "border-[#3c4043]",
    text: "text-[#3c4043]",
    dot: "bg-[#3c4043]"
  },
  DEFAULT: {
    bg: "bg-[#e8eaed]",
    border: "border-[#3c4043]",
    text: "text-[#3c4043]",
    dot: "bg-[#3c4043]"
  }
};

export function CalendarView({ currentUser }: { currentUser: User }) {
  const [view, setView] = useState<ViewType>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [draftStartTime, setDraftStartTime] = useState<Date | null>(null);
  const [draftEndTime, setDraftEndTime] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [scope, setScope] = useState<CalendarScope>("user");
  const [searchTerm, setSearchTerm] = useState("");
  const [visibleTypes, setVisibleTypes] = useState<Record<CalendarEventType, boolean>>({
    MEETING: true,
    ASSIGNMENT: true,
    HOLIDAY: true,
    DAY_OFF: true,
    MILESTONE: true
  });

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const query = scope === "team" ? "?scope=team" : "";
      const data = await apiRequest<UserCalendarResponse>(`/calendar/user/${currentUser.id}${query}`);
      setEvents(data.events);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load calendar", error);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id, scope]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const handlePrev = () => {
    const nextDate = new Date(currentDate);
    if (view === "month") {
      nextDate.setMonth(nextDate.getMonth() - 1);
    } else if (view === "week") {
      nextDate.setDate(nextDate.getDate() - 7);
    } else {
      nextDate.setDate(nextDate.getDate() - 1);
    }
    setCurrentDate(nextDate);
  };

  const handleNext = () => {
    const nextDate = new Date(currentDate);
    if (view === "month") {
      nextDate.setMonth(nextDate.getMonth() + 1);
    } else if (view === "week") {
      nextDate.setDate(nextDate.getDate() + 7);
    } else {
      nextDate.setDate(nextDate.getDate() + 1);
    }
    setCurrentDate(nextDate);
  };

  const handleToday = () => setCurrentDate(new Date());

  const openCreateModalAt = useCallback((start: Date, end?: Date) => {
    setDraftStartTime(start);
    setDraftEndTime(end ?? new Date(start.getTime() + 30 * 60000));
    setCreateModalOpen(true);
  }, []);

  const defaultSlotForDay = useCallback(
    (day: Date) => {
      const now = new Date();
      const base = new Date(day);
      if (isSameDay(base, now)) {
        const rounded = new Date(now);
        rounded.setSeconds(0, 0);
        const minutes = rounded.getMinutes();
        const remainder = minutes % 30;
        if (remainder !== 0) {
          rounded.setMinutes(minutes + (30 - remainder));
        }
        return {
          start: rounded,
          end: new Date(rounded.getTime() + 30 * 60000)
        };
      }
      base.setHours(10, 0, 0, 0);
      return { start: base, end: new Date(base.getTime() + 30 * 60000) };
    },
    []
  );

  const handleDayBoxCreate = useCallback(
    (day: Date) => {
      const { start, end } = defaultSlotForDay(day);
      openCreateModalAt(start, end);
    },
    [defaultSlotForDay, openCreateModalAt]
  );

  const handleTimeSlotCreate = useCallback(
    (day: Date, minutesFromStart: number) => {
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      start.setMinutes(minutesFromStart);
      const end = new Date(start.getTime() + 30 * 60000);
      openCreateModalAt(start, end);
    },
    [openCreateModalAt]
  );

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (!visibleTypes[event.type]) {
        return false;
      }
      if (!searchTerm.trim()) {
        return true;
      }
      const haystack = `${event.title} ${event.subtitle ?? ""} ${event.description ?? ""}`.toLowerCase();
      return haystack.includes(searchTerm.trim().toLowerCase());
    });
  }, [events, searchTerm, visibleTypes]);

  const toggleType = (type: CalendarEventType) => {
    setVisibleTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  return (
    <div className="flex h-full gap-4 text-ink-900">
      <aside className="w-72 shrink-0 space-y-6 rounded-3xl border border-ink-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink-900">Planner</p>
            <p className="text-xs text-ink-500">Match Google Calendar layout</p>
          </div>
          <button
            type="button"
            onClick={() => { const { start, end } = defaultSlotForDay(currentDate); openCreateModalAt(start, end); }}
            className="inline-flex items-center gap-2 rounded-full bg-[#16a34a] px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-[#15803d]"
          >
            <span className="text-lg leading-none">+</span>
            Create
          </button>
        </div>

        <MiniMonth
          monthDate={currentDate}
          selectedDate={currentDate}
          onSelect={(day) => setCurrentDate(day)}
          onMonthChange={(offset) => {
            const next = new Date(currentDate);
            next.setMonth(next.getMonth() + offset);
            setCurrentDate(next);
          }}
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-ink-400">
            <span>Calendars</span>
            <div className="flex rounded-full border border-ink-100 bg-ink-25 text-[11px]">
              {(["user", "team"] as CalendarScope[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value)}
                  className={clsx(
                    "px-3 py-1 font-semibold capitalize transition",
                    scope === value ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-900"
                  )}
                >
                  {value === "user" ? "My calendar" : "Team"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {(
              [
                { key: "MEETING", label: "Meetings" },
                { key: "ASSIGNMENT", label: "Assignments" },
                { key: "HOLIDAY", label: "Holidays" },
                { key: "DAY_OFF", label: "Day off" },
                { key: "MILESTONE", label: "Milestones" }
              ] as { key: CalendarEventType; label: string }[]
            ).map((entry) => {
              const tone = eventTone[entry.key] ?? eventTone.DEFAULT;
              return (
                <label
                  key={entry.key}
                  className="flex cursor-pointer items-center justify-between rounded-xl px-2 py-1.5 hover:bg-ink-25"
                >
                  <div className="flex items-center gap-2">
                    <span className={clsx("h-2.5 w-2.5 rounded-full", tone.dot)} />
                    <span className="text-ink-800">{entry.label}</span>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-ink-300 text-[#16a34a] focus:ring-[#16a34a]"
                    checked={visibleTypes[entry.key]}
                    onChange={() => toggleType(entry.key)}
                  />
                </label>
              );
            })}
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-ink-100 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToday}
              className="rounded-full border border-ink-200 px-3 py-1.5 text-sm font-semibold text-ink-800 hover:bg-ink-50"
            >
              Today
            </button>
            <div className="flex items-center gap-1">
              <IconButton direction="prev" onClick={handlePrev} />
              <IconButton direction="next" onClick={handleNext} />
            </div>
            <h2 className="text-xl font-semibold text-ink-900">
              {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-ink-100 bg-ink-25 px-3">
              <svg
                aria-hidden
                className="h-4 w-4 text-ink-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
                <circle cx="11" cy="11" r="7" />
              </svg>
              <input
                type="search"
                placeholder="Search events"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-48 bg-transparent text-sm text-ink-800 outline-none placeholder:text-ink-400"
              />
            </div>
            <div className="flex rounded-full border border-ink-100 bg-ink-25 p-1">
              {(["month", "week", "day", "agenda"] as ViewType[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setView(value)}
                  className={clsx(
                    "rounded-full px-3 py-1.5 text-sm font-semibold capitalize transition",
                    view === value ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-900"
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={() => { const { start, end } = defaultSlotForDay(currentDate); openCreateModalAt(start, end); }}>
              + Create Meeting
            </Button>
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-sm">
          {view === "month" && (
            <MonthView date={currentDate} events={filteredEvents} onEventClick={setSelectedEvent} onDayCreate={handleDayBoxCreate} />
          )}
          {view === "week" && (
            <WeekView date={currentDate} events={filteredEvents} onEventClick={setSelectedEvent} onSlotSelect={handleTimeSlotCreate} />
          )}
          {view === "day" && (
            <DayView date={currentDate} events={filteredEvents} onEventClick={setSelectedEvent} onSlotSelect={handleTimeSlotCreate} />
          )}
          {view === "agenda" && (
            <AgendaView date={currentDate} events={filteredEvents} onEventClick={setSelectedEvent} />
          )}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
              <span className="text-sm font-semibold text-ink-500">Loading calendar...</span>
            </div>
          )}
        </div>
      </div>

      <CreateMeetingModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setDraftStartTime(null);
          setDraftEndTime(null);
        }}
        currentUser={currentUser}
        onSuccess={() => {
          setCreateModalOpen(false);
          setDraftStartTime(null);
          setDraftEndTime(null);
          void loadEvents();
        }}
        initialStartTime={draftStartTime ?? undefined}
        initialEndTime={draftEndTime ?? undefined}
      />

      <MeetingDetailsPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} currentUser={currentUser} />
    </div>
  );
}

function MonthView({
  date,
  events,
  onEventClick,
  onDayCreate
}: {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDayCreate: (day: Date) => void;
}) {
  const month = date.getMonth();
  const year = date.getFullYear();
  const today = new Date();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - startOffset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });

  const getEventsForDay = useCallback(
    (day: Date) =>
      events.filter((event) => occursOnDay(event, day)).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [events]
  );

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="grid grid-cols-7 border-b border-ink-100 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        {dayLabels.map((label) => (
          <div key={label} className="py-2">
            {label}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6 divide-x divide-y divide-ink-100">
        {days.map((day) => {
          const isCurrentMonth = day.getMonth() === month;
          const isToday = isSameDay(day, today);
          const dayEvents = getEventsForDay(day);
          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayCreate(day)}
              className={clsx(
                "min-h-[120px] p-2 transition-colors",
                !isCurrentMonth && "bg-ink-25 text-ink-400",
                isToday && "bg-[#e6f4ea]"
              )}
            >
              <div className="flex items-center justify-end">
                <span
                  className={clsx(
                    "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                    isToday ? "bg-[#16a34a] text-white" : "text-ink-700"
                  )}
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="mt-1 flex flex-col gap-1">
                {dayEvents.slice(0, 4).map((event) => {
                  const tone = eventTone[event.type] ?? eventTone.DEFAULT;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                      className={clsx(
                        "flex items-center gap-2 truncate rounded-md px-2 py-1 text-left text-xs font-semibold transition hover:brightness-95",
                        tone.bg,
                        tone.border,
                        tone.text,
                        "border"
                      )}
                    >
                      <span className={clsx("h-2 w-2 rounded-full", tone.dot)} />
                      <span className="line-clamp-1">{event.title}</span>
                    </button>
                  );
                })}
                {dayEvents.length > 4 ? (
                  <span className="text-[11px] font-semibold text-ink-400">{dayEvents.length - 4} more</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  date,
  events,
  onEventClick,
  onSlotSelect
}: {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onSlotSelect?: (day: Date, minutesFromStart: number) => void;
}) {
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - date.getDay());
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(startOfWeek);
    day.setDate(startOfWeek.getDate() + index);
    return day;
  });
  return <TimeGrid days={days} events={events} onEventClick={onEventClick} onSlotSelect={onSlotSelect} />;
}

function DayView({
  date,
  events,
  onEventClick,
  onSlotSelect
}: {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onSlotSelect?: (day: Date, minutesFromStart: number) => void;
}) {
  return <TimeGrid days={[date]} events={events} onEventClick={onEventClick} onSlotSelect={onSlotSelect} />;
}

function TimeGrid({
  days,
  events,
  onEventClick,
  onSlotSelect
}: {
  days: Date[];
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onSlotSelect?: (day: Date, minutesFromStart: number) => void;
}) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const hours = Array.from({ length: 24 }, (_, index) => index);
  const hourHeight = 56; // px
  const today = new Date();

  const eventsByDay = useMemo(() => {
    return days.map((day) => ({
      day,
      allDay: events.filter((event) => isAllDayOnDay(event, day)),
      timed: events
        .filter((event) => occursOnDay(event, day) && !isAllDayOnDay(event, day))
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
    }));
  }, [days, events]);

  const handleColumnClick = (event: MouseEvent<HTMLDivElement>, day: Date) => {
    if (!onSlotSelect) return;
    const target = event.currentTarget;
    const scroller = target.closest('[data-timegrid-scroll]') as HTMLElement | null;
    const scrollTop = scroller?.scrollTop ?? 0;
    const rect = target.getBoundingClientRect();
    const y = event.clientY - rect.top + scrollTop;
    const minutesFromStart = Math.min(24 * 60 - 30, Math.max(0, Math.round(((y / hourHeight) * 60) / 30) * 30));
    onSlotSelect(day, minutesFromStart);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex border-b border-ink-100 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
        <div className="w-16" />
        <div className="flex flex-1 divide-x divide-ink-100">
          {days.map((day) => {
            const isToday = isSameDay(day, today);
            return (
              <div key={day.toISOString()} className="flex-1 px-3">
                <div className={clsx("text-[11px] font-semibold", isToday ? "text-[#166534]" : "text-ink-500")}>{
                  day.toLocaleDateString("en-US", { weekday: "short" })
                }</div>
                <div
                  className={clsx(
                    "mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-base font-semibold",
                    isToday ? "bg-[#16a34a] text-white" : "text-ink-800"
                  )}
                >
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex border-b border-ink-100 bg-ink-25/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
        <div className="w-16">All-day</div>
        <div className="flex flex-1 divide-x divide-ink-100">
          {eventsByDay.map(({ day, allDay }) => (
            <div key={`all-${day.toISOString()}`} className="flex min-h-[52px] flex-1 flex-wrap gap-1 px-2 py-1">
              {allDay.map((event) => {
                const tone = eventTone[event.type] ?? eventTone.DEFAULT;
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onEventClick(event)}
                    className={clsx(
                      "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition hover:brightness-95",
                      tone.bg,
                      tone.text,
                      tone.border,
                      "border"
                    )}
                  >
                    <span className={clsx("h-2 w-2 rounded-full", tone.dot)} />
                    <span className="line-clamp-1">{event.title}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="custom-scrollbar relative flex flex-1 overflow-y-auto bg-white">
        <div className="w-16 border-r border-ink-100 bg-white">
          {hours.map((hour) => (
            <div
              key={hour}
              className="relative"
              style={{
                height: hourHeight
              }}
            >
              <span className="absolute -top-2 right-2 text-[11px] font-semibold text-ink-400">
                {hour === 0 ? "" : new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" })}
              </span>
            </div>
          ))}
        </div>
        <div className="relative flex flex-1 divide-x divide-ink-100">
          <div className="pointer-events-none absolute inset-0">
            {hours.map((hour) => (
              <div
                key={hour}
                className="border-b border-ink-50"
                style={{
                  height: hourHeight
                }}
              />
            ))}
          </div>
          {eventsByDay.map(({ day, timed }) => {
            const isToday = isSameDay(day, today);
            return (
              <div key={`timed-${day.toISOString()}`} className="relative flex-1 px-1" onClick={(event) => handleColumnClick(event, day)}>
                {timed.map((event) => {
                  const { startMinutes, durationMinutes } = computeEventPosition(event, day);
                  const tone = eventTone[event.type] ?? eventTone.DEFAULT;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                      className={clsx(
                        "absolute left-1 right-1 overflow-hidden rounded-md border px-2 py-1 text-left text-xs font-semibold shadow-sm transition hover:z-10 hover:shadow-md",
                        tone.bg,
                        tone.text,
                        tone.border,
                        "border-l-4"
                      )}
                      style={{
                        top: `${(startMinutes / 60) * hourHeight}px`,
                        height: `${(durationMinutes / 60) * hourHeight}px`
                      }}
                    >
                      <div className="line-clamp-1">{event.title}</div>
                      <div className="text-[11px] font-normal opacity-80">{formatTimeRange(event, day)}</div>
                    </button>
                  );
                })}

                {isToday && isSameDay(day, now) ? (
                  <div
                    className="pointer-events-none absolute left-0 right-0 border-t-2 border-[#d93025]"
                    style={{
                      top: `${((now.getHours() * 60 + now.getMinutes()) / 60) * hourHeight}px`
                    }}
                  >
                    <span className="absolute -left-2 -top-1 h-3 w-3 rounded-full bg-[#d93025]" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AgendaView({
  events,
  onEventClick
}: {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}) {
  const sorted = [...events].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    <div className="h-full overflow-y-auto p-4">
      {sorted.length === 0 ? (
        <div className="flex h-full items-center justify-center text-ink-500">No events for this range.</div>
      ) : (
        sorted.map((event) => {
          const tone = eventTone[event.type] ?? eventTone.DEFAULT;
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onEventClick(event)}
              className="mb-3 flex w-full items-start gap-3 rounded-2xl border border-ink-100 bg-white px-4 py-3 text-left shadow-sm transition hover:border-ink-200 hover:shadow-md"
            >
              <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-ink-25 text-xs font-semibold uppercase text-ink-500">
                <span>{new Date(event.startDate).toLocaleDateString("en-US", { month: "short" })}</span>
                <span className="text-lg text-ink-900">{new Date(event.startDate).getDate()}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <span>{event.title}</span>
                  <span
                    className={clsx(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase",
                      tone.bg,
                      tone.text,
                      tone.border,
                      "border"
                    )}
                  >
                    {event.type}
                  </span>
                </div>
                {event.subtitle ? <p className="text-xs text-ink-500">{event.subtitle}</p> : null}
                <p className="text-xs text-ink-400">{formatTimeRange(event)}</p>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

function MiniMonth({
  monthDate,
  selectedDate,
  onSelect,
  onMonthChange
}: {
  monthDate: Date;
  selectedDate: Date;
  onSelect: (date: Date) => void;
  onMonthChange: (offset: number) => void;
}) {
  const month = monthDate.getMonth();
  const year = monthDate.getFullYear();
  const firstOfMonth = new Date(year, month, 1);
  const offset = firstOfMonth.getDay();
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - offset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
  const today = new Date();

  return (
    <div className="rounded-2xl border border-ink-100 bg-ink-25/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-ink-800">
          {monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
        <div className="flex gap-1">
          <IconButton direction="prev" onClick={() => onMonthChange(-1)} size="sm" />
          <IconButton direction="next" onClick={() => onMonthChange(1)} size="sm" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-ink-400">
        {dayLabels.map((day) => (
          <div key={`mini-${day}`} className="py-1">
            {day.slice(0, 2)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isCurrentMonth = day.getMonth() === month;
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDate);
          return (
            <button
              key={`mini-day-${day.toISOString()}`}
              type="button"
              onClick={() => onSelect(day)}
              className={clsx(
                "flex h-9 w-full items-center justify-center rounded-full text-sm font-semibold transition",
                isSelected
                  ? "bg-[#16a34a] text-white"
                  : isToday
                    ? "border border-[#16a34a] text-[#166534]"
                    : isCurrentMonth
                      ? "text-ink-800 hover:bg-white"
                      : "text-ink-400 hover:bg-white/80"
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IconButton({
  direction,
  onClick,
  size = "md"
}: {
  direction: "prev" | "next";
  onClick: () => void;
  size?: "sm" | "md";
}) {
  const dimension = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center justify-center rounded-full border border-ink-200 bg-white text-ink-600 transition hover:bg-ink-50",
        dimension
      )}
    >
      <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        {direction === "prev" ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19 8 12l7-7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
        )}
      </svg>
    </button>
  );
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function stripTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function eventWindow(event: CalendarEvent) {
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : start;
  return { start, end };
}

function occursOnDay(event: CalendarEvent, day: Date) {
  const { start, end } = eventWindow(event);
  const target = stripTime(day).getTime();
  const startDay = stripTime(start).getTime();
  const endDay = stripTime(end).getTime();
  return target >= startDay && target <= endDay;
}

function isAllDayOnDay(event: CalendarEvent, day: Date) {
  if (event.allDay) return true;
  const { start, end } = eventWindow(event);
  const hasExplicitTime =
    event.startDate.includes("T") ||
    event.endDate?.includes("T") ||
    start.getHours() !== 0 ||
    start.getMinutes() !== 0 ||
    end.getHours() !== 0 ||
    end.getMinutes() !== 0;
  if (hasExplicitTime) {
    return false;
  }
  return occursOnDay(event, day);
}

function computeEventPosition(event: CalendarEvent, day: Date) {
  const { start, end } = eventWindow(event);
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);
  const clampedStart = Math.max(start.getTime(), dayStart.getTime());
  const clampedEnd = Math.max(clampedStart, Math.min(end.getTime(), dayEnd.getTime()));
  const startMinutes = (clampedStart - dayStart.getTime()) / 60000;
  const endMinutes = (clampedEnd - dayStart.getTime()) / 60000;
  return {
    startMinutes,
    durationMinutes: Math.max(endMinutes - startMinutes, 30)
  };
}

function formatTimeRange(event: CalendarEvent, dayOverride?: Date) {
  const { start, end } = eventWindow(event);
  const allDay = isAllDayOnDay(event, dayOverride ?? start);
  if (allDay) {
    return "All day";
  }
  const sameDay = !dayOverride || isSameDay(start, dayOverride);
  const base = `${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString(
    [],
    { hour: "numeric", minute: "2-digit" }
  )}`;
  if (sameDay) {
    return base;
  }
  return `${start.toLocaleDateString()} ${base}`;
}
