import { DateTime } from "luxon";
import { TaskEstimationUnit, WorkScheduleSlot } from "../models/_types";

type CalendarEntry = { date: string };

const defaultSchedule: WorkScheduleSlot[] = [
  { day: 1, start: "09:00", end: "17:00" },
  { day: 2, start: "09:00", end: "17:00" },
  { day: 3, start: "09:00", end: "17:00" },
  { day: 4, start: "09:00", end: "17:00" },
  { day: 5, start: "09:00", end: "17:00" }
];

function parseTime(value: string): { hours: number; minutes: number } {
  const [hours, minutes] = value.split(":").map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    throw new Error(`Invalid schedule time: ${value}`);
  }
  return { hours, minutes };
}

function toScheduleDay(date: DateTime): number {
  return date.weekday % 7;
}

function buildScheduleMap(slots: WorkScheduleSlot[]): Map<number, WorkScheduleSlot[]> {
  if (!slots.length) {
    throw new Error("Working schedule is required.");
  }
  const map = new Map<number, WorkScheduleSlot[]>();
  slots.forEach((slot) => {
    const day = slot.day;
    if (!map.has(day)) {
      map.set(day, []);
    }
    map.get(day)!.push(slot);
  });
  map.forEach((daySlots, day) => {
    const sorted = daySlots
      .map((slot) => ({ ...slot }))
      .sort((a, b) => {
        const aTime = parseTime(a.start);
        const bTime = parseTime(b.start);
        return aTime.hours === bTime.hours ? aTime.minutes - bTime.minutes : aTime.hours - bTime.hours;
      });
    map.set(day, sorted);
  });
  return map;
}

function computeDailyMinutes(scheduleMap: Map<number, WorkScheduleSlot[]>): number {
  let totalMinutes = 0;
  let workingDays = 0;
  scheduleMap.forEach((slots) => {
    if (!slots.length) {
      return;
    }
    workingDays += 1;
    slots.forEach((slot) => {
      const start = parseTime(slot.start);
      const end = parseTime(slot.end);
      const duration = (end.hours * 60 + end.minutes) - (start.hours * 60 + start.minutes);
      if (duration > 0) {
        totalMinutes += duration;
      }
    });
  });
  if (!workingDays) {
    return 480;
  }
  return Math.max(60, Math.round(totalMinutes / workingDays));
}

function normalizeDateSet(entries?: CalendarEntry[]): Set<string> {
  const set = new Set<string>();
  (entries ?? []).forEach((entry) => {
    if (entry?.date) {
      const iso = DateTime.fromISO(entry.date).toISODate();
      if (iso) {
        set.add(iso);
      }
    }
  });
  return set;
}

export function addWorkingDuration(
  start: string,
  quantity: number,
  unit: TaskEstimationUnit,
  userTimeZone: string,
  schedule?: WorkScheduleSlot[],
  holidays?: CalendarEntry[],
  dayOffs?: CalendarEntry[]
): string {
  if (!start) {
    throw new Error("Start date is required.");
  }
  if (Number.isNaN(quantity) || quantity <= 0) {
    throw new Error("Quantity must be greater than zero.");
  }
  const normalizedSchedule = (schedule?.length ? schedule : defaultSchedule).map((slot) => ({ ...slot }));
  const scheduleMap = buildScheduleMap(normalizedSchedule);
  const minutesPerDay = computeDailyMinutes(scheduleMap);
  let remainingMinutes = unit === "HOURS" ? quantity * 60 : quantity * minutesPerDay;
  let cursor = DateTime.fromISO(start, { zone: userTimeZone });
  if (!cursor.isValid) {
    throw new Error("Invalid start date.");
  }
  const nonWorkingDates = new Set<string>([
    ...normalizeDateSet(holidays),
    ...normalizeDateSet(dayOffs)
  ]);
  let safety = 0;
  while (remainingMinutes > 0) {
    if (safety++ > 10000) {
      throw new Error("Unable to compute expected date with the provided schedule.");
    }
    const dayKey = cursor.toISODate();
    const daySlots = nonWorkingDates.has(dayKey) ? [] : scheduleMap.get(toScheduleDay(cursor)) ?? [];
    if (!daySlots.length) {
      cursor = cursor.plus({ days: 1 }).startOf("day");
      continue;
    }

    let advanced = false;
    for (const slot of daySlots) {
      const { hours: startHour, minutes: startMinute } = parseTime(slot.start);
      const { hours: endHour, minutes: endMinute } = parseTime(slot.end);
      let slotStart = cursor.set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
      let slotEnd = cursor.set({ hour: endHour, minute: endMinute, second: 0, millisecond: 0 });
      if (slotEnd <= slotStart) {
        continue;
      }
      if (cursor > slotEnd) {
        continue;
      }
      if (cursor > slotStart) {
        slotStart = cursor;
      }
      const available = slotEnd.diff(slotStart, "minutes").minutes;
      if (available <= 0) {
        continue;
      }
      const utilized = Math.min(available, remainingMinutes);
      cursor = slotStart.plus({ minutes: utilized });
      remainingMinutes -= utilized;
      advanced = true;
      if (remainingMinutes <= 0) {
        break;
      }
    }

    if (remainingMinutes <= 0) {
      break;
    }

    if (!advanced) {
      cursor = cursor.plus({ days: 1 }).startOf("day");
    }
  }

  return cursor.toUTC().toISO();
}
