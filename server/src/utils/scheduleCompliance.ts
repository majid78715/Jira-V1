import { DateTime } from "luxon";
import { WorkScheduleSlot } from "../models/_types";

export const DEFAULT_SCHEDULE_SLOTS: WorkScheduleSlot[] = [
  { day: 1, start: "09:00", end: "17:00" },
  { day: 2, start: "09:00", end: "17:00" },
  { day: 3, start: "09:00", end: "17:00" },
  { day: 4, start: "09:00", end: "17:00" },
  { day: 5, start: "09:00", end: "17:00" }
];

type NormalizedSlot = WorkScheduleSlot & {
  startMinutes: number;
  endMinutes: number;
};

function parseMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    throw new Error(`Invalid schedule time: ${value}`);
  }
  return hours * 60 + minutes;
}

function normalizeSlots(slots?: WorkScheduleSlot[]): NormalizedSlot[] {
  return (slots?.length ? slots : DEFAULT_SCHEDULE_SLOTS).map((slot) => ({
    ...slot,
    startMinutes: parseMinutes(slot.start),
    endMinutes: parseMinutes(slot.end)
  }));
}

function toScheduleDay(date: DateTime): number {
  return date.weekday % 7;
}

function slotContains(date: DateTime, slot: NormalizedSlot): boolean {
  const day = toScheduleDay(date);
  if (day !== slot.day) {
    return false;
  }
  const minutes = date.hour * 60 + date.minute;
  return minutes >= slot.startMinutes && minutes <= slot.endMinutes;
}

export function resolveScheduleSlots(slots?: WorkScheduleSlot[]): WorkScheduleSlot[] {
  return normalizeSlots(slots)
    .map((slot) => ({
      day: slot.day,
      start: slot.start,
      end: slot.end
    }))
    .sort((a, b) => (a.day === b.day ? a.start.localeCompare(b.start) : a.day - b.day));
}

export function isTimestampWithinSchedule(timestamp: string, slots: WorkScheduleSlot[], timeZone: string): boolean {
  const date = DateTime.fromISO(timestamp, { zone: timeZone });
  if (!date.isValid) {
    return false;
  }
  const normalized = normalizeSlots(slots);
  return normalized.some((slot) => slotContains(date, slot));
}

export function isRangeWithinSchedule(
  start: string,
  end: string,
  slots: WorkScheduleSlot[],
  timeZone: string
): boolean {
  const startDate = DateTime.fromISO(start, { zone: timeZone });
  const endDate = DateTime.fromISO(end, { zone: timeZone });
  if (!startDate.isValid || !endDate.isValid || endDate <= startDate) {
    return false;
  }
  if (startDate.toISODate() !== endDate.toISODate()) {
    return false;
  }
  const normalized = normalizeSlots(slots);
  return normalized.some((slot) => slotContains(startDate, slot) && slotContains(endDate, slot));
}
