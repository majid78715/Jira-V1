import { DateTime } from "luxon";
import { AttendanceRecord, PublicUser, WorkScheduleSlot } from "../models/_types";
import {
  createAttendanceRecord,
  findWorkScheduleForUser,
  listAttendanceRecords,
  recordActivity,
  updateAttendanceRecord
} from "../data/repositories";
import { nowISO } from "../utils/date";
import { isTimestampWithinSchedule, resolveScheduleSlots } from "../utils/scheduleCompliance";

const ATTENDANCE_ROLES: PublicUser["role"][] = ["DEVELOPER", "ENGINEER"];

type AttendanceSummary = {
  records: AttendanceRecord[];
  activeRecord: AttendanceRecord | null;
  aggregates: {
    todayMinutes: number;
    weekMinutes: number;
  };
  schedule: {
    timeZone: string;
    slots: WorkScheduleSlot[];
  };
};

export async function clockIn(actor: PublicUser): Promise<AttendanceRecord> {
  ensureAttendanceRole(actor);
  const existing = await listAttendanceRecords({ userId: actor.id, status: "OPEN" });
  if (existing.length) {
    throw new Error("You are already clocked in.");
  }
  const schedule = await resolveSchedule(actor);
  const timestamp = nowISO();
  const userNow = DateTime.fromISO(timestamp).setZone(schedule.timeZone);
  const dateKey = userNow.toISODate();
  if (!dateKey) {
    throw new Error("Unable to determine current date for your time zone.");
  }
  const record = await createAttendanceRecord({
    userId: actor.id,
    clockIn: timestamp,
    date: dateKey,
    outOfSchedule: !isTimestampWithinSchedule(timestamp, schedule.slots, schedule.timeZone)
  });
  await recordActivity(actor.id, "ATTENDANCE_CLOCK_IN", "Clocked in", {
    attendanceId: record.id,
    clockIn: timestamp
  });
  return record;
}

export async function clockOut(actor: PublicUser): Promise<AttendanceRecord> {
  ensureAttendanceRole(actor);
  const openRecord = await getActiveAttendanceRecord(actor.id);
  if (!openRecord) {
    throw new Error("You are not currently clocked in.");
  }
  const schedule = await resolveSchedule(actor);
  const timestamp = nowISO();
  const start = DateTime.fromISO(openRecord.clockIn).setZone(schedule.timeZone);
  const end = DateTime.fromISO(timestamp).setZone(schedule.timeZone);
  if (!start.isValid || !end.isValid || end <= start) {
    throw new Error("Clock out time must be after clock in.");
  }
  const minutesWorked = Math.max(1, Math.round(end.diff(start, "minutes").minutes));
  const outOfSchedule = openRecord.outOfSchedule || !isTimestampWithinSchedule(timestamp, schedule.slots, schedule.timeZone);
  const updated = await updateAttendanceRecord(openRecord.id, {
    clockOut: timestamp,
    minutesWorked,
    status: "COMPLETED",
    outOfSchedule
  });
  await recordActivity(actor.id, "ATTENDANCE_CLOCK_OUT", "Clocked out", {
    attendanceId: openRecord.id,
    clockOut: timestamp,
    minutesWorked
  });
  return updated;
}

export async function getAttendanceSummary(actor: PublicUser): Promise<AttendanceSummary> {
  ensureAttendanceRole(actor);
  const schedule = await resolveSchedule(actor);
  const records = await listAttendanceRecords({ userId: actor.id });
  const activeRecord = records.find((record) => record.status === "OPEN") ?? null;
  const now = DateTime.now().setZone(schedule.timeZone);
  const todayKey = now.toISODate();
  const weekStart = now.startOf("week");

  const aggregates = records.reduce(
    (acc, record) => {
      const recordDate = DateTime.fromISO(record.date, { zone: schedule.timeZone });
      const isToday = record.date === todayKey;
      const isThisWeek = recordDate.isValid ? recordDate >= weekStart : false;
      let minutes = record.minutesWorked ?? 0;
      if (record.status === "OPEN" && record === activeRecord) {
        const start = DateTime.fromISO(record.clockIn).setZone(schedule.timeZone);
        if (start.isValid && now > start) {
          minutes = Math.max(0, Math.round(now.diff(start, "minutes").minutes));
        }
      }
      if (isToday) {
        acc.todayMinutes += minutes;
      }
      if (isThisWeek) {
        acc.weekMinutes += minutes;
      }
      return acc;
    },
    { todayMinutes: 0, weekMinutes: 0 }
  );

  return {
    records,
    activeRecord,
    aggregates,
    schedule: {
      timeZone: schedule.timeZone,
      slots: schedule.slots
    }
  };
}

async function resolveSchedule(actor: PublicUser): Promise<{ timeZone: string; slots: WorkScheduleSlot[] }> {
  const schedule = await findWorkScheduleForUser(actor.id, actor.companyId);
  const timeZone = schedule?.timeZone ?? actor.profile.timeZone ?? "UTC";
  const slots = resolveScheduleSlots(schedule?.slots);
  return { timeZone, slots };
}

async function getActiveAttendanceRecord(userId: string): Promise<AttendanceRecord | null> {
  const records = await listAttendanceRecords({ userId, status: "OPEN" });
  return records[0] ?? null;
}

function ensureAttendanceRole(actor: PublicUser) {
  if (!ATTENDANCE_ROLES.includes(actor.role)) {
    throw new Error("Attendance tracking is only available to developers and engineers.");
  }
}
