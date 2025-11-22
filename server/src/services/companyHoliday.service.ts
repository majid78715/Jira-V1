import { createCompanyHoliday, deleteCompanyHoliday, listCompanyHolidays, updateCompanyHoliday } from "../data/repositories";
import { PublicUser } from "../models/_types";
import { HttpError } from "../middleware/httpError";

type HolidayFilters = {
  companyId?: string;
  vendorId?: string;
};

type HolidayPayload = {
  name: string;
  calendarName: string;
  date: string;
  companyId?: string;
  vendorId?: string;
  isFullDay?: boolean;
  partialStartTimeUtc?: string;
  partialEndTimeUtc?: string;
  recurrenceRule?: string;
  countryCode?: string;
};

type HolidayUpdatePayload = Partial<HolidayPayload>;

export async function listHolidays(actor: PublicUser, filters: HolidayFilters = {}) {
  ensureHolidayViewer(actor);
  const vendorId = resolveVendorScope(actor, filters.vendorId);
  const companyId = filters.companyId ?? actor.companyId;
  return listCompanyHolidays({ companyId, vendorId });
}

export async function createHoliday(actor: PublicUser, payload: HolidayPayload) {
  ensureHolidayEditor(actor);
  validateHolidayPayload(payload);
  const normalizedDate = normalizeDate(payload.date);
  return createCompanyHoliday({
    name: payload.name.trim(),
    calendarName: payload.calendarName.trim(),
    date: normalizedDate,
    companyId: payload.companyId ?? actor.companyId,
    vendorId: payload.vendorId ?? resolveVendorScope(actor),
    isFullDay: payload.isFullDay ?? true,
    partialStartTimeUtc: payload.partialStartTimeUtc,
    partialEndTimeUtc: payload.partialEndTimeUtc,
    recurrenceRule: payload.recurrenceRule,
    countryCode: payload.countryCode
  });
}

export async function updateHoliday(actor: PublicUser, id: string, payload: HolidayUpdatePayload) {
  ensureHolidayEditor(actor);
  if (!payload || Object.keys(payload).length === 0) {
    throw new HttpError(400, "Update payload cannot be empty.");
  }
  const update: HolidayUpdatePayload = {};
  if (payload.name !== undefined) {
    const trimmed = payload.name.trim();
    if (!trimmed) {
      throw new HttpError(400, "name cannot be empty.");
    }
    update.name = trimmed;
  }
  if (payload.calendarName !== undefined) {
    const trimmed = payload.calendarName.trim();
    if (!trimmed) {
      throw new HttpError(400, "calendarName cannot be empty.");
    }
    update.calendarName = trimmed;
  }
  if (payload.date) {
    update.date = normalizeDate(payload.date);
  }
  if (payload.vendorId !== undefined) {
    update.vendorId = resolveVendorScope(actor, payload.vendorId);
  }
  if (payload.companyId !== undefined) {
    update.companyId = payload.companyId;
  }
  update.isFullDay = payload.isFullDay ?? undefined;
  update.partialStartTimeUtc = payload.partialStartTimeUtc;
  update.partialEndTimeUtc = payload.partialEndTimeUtc;
  update.recurrenceRule = payload.recurrenceRule;
  update.countryCode = payload.countryCode;
  return updateCompanyHoliday(id, update);
}

export async function deleteHoliday(actor: PublicUser, id: string): Promise<void> {
  ensureHolidayEditor(actor);
  await deleteCompanyHoliday(id);
}

function ensureHolidayViewer(actor: PublicUser) {
  if (!["PM", "SUPER_ADMIN", "VP", "PROJECT_MANAGER"].includes(actor.role)) {
    throw new HttpError(403, "You do not have permission to view holiday calendars.");
  }
}

function ensureHolidayEditor(actor: PublicUser) {
  if (!["PM", "SUPER_ADMIN"].includes(actor.role)) {
    throw new HttpError(403, "You do not have permission to manage holidays.");
  }
}

function resolveVendorScope(actor: PublicUser, requestedVendorId?: string) {
  if (actor.role === "SUPER_ADMIN") {
    return requestedVendorId;
  }
  if (actor.role === "PROJECT_MANAGER") {
    if (!actor.companyId) {
      throw new HttpError(400, "Vendor scope requires an associated company.");
    }
    if (requestedVendorId && requestedVendorId !== actor.companyId) {
      throw new HttpError(403, "Cannot manage holidays for another vendor.");
    }
    return actor.companyId;
  }
  return requestedVendorId;
}

function normalizeDate(value: string) {
  const normalized = new Date(value);
  if (Number.isNaN(normalized.getTime())) {
    throw new HttpError(400, "Invalid date.");
  }
  return normalized.toISOString().slice(0, 10);
}

function validateHolidayPayload(payload: HolidayPayload) {
  if (!payload.name?.trim()) {
    throw new HttpError(400, "name is required.");
  }
  if (!payload.calendarName?.trim()) {
    throw new HttpError(400, "calendarName is required.");
  }
  if (!payload.date) {
    throw new HttpError(400, "date is required.");
  }
}
