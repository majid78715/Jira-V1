const DEFAULT_LOCALE = typeof navigator !== "undefined" ? navigator.language : "en-US";
const FALLBACK_VALUE = "--";

export function formatNumber(value: unknown, opts: Intl.NumberFormatOptions = {}): string {
  const numericValue = coerceNumber(value);
  if (!Number.isFinite(numericValue)) {
    return FALLBACK_VALUE;
  }
  return new Intl.NumberFormat(DEFAULT_LOCALE, { maximumFractionDigits: 2, ...opts }).format(numericValue);
}

export function formatCurrency(value: unknown, currency = "USD", opts: Intl.NumberFormatOptions = {}): string {
  return formatNumber(value, { style: "currency", currency, maximumFractionDigits: 0, ...opts });
}

export function formatPercent(value: unknown, opts: Intl.NumberFormatOptions = {}): string {
  const numericValue = coerceNumber(value);
  if (!Number.isFinite(numericValue)) {
    return FALLBACK_VALUE;
  }
  return `${formatNumber(numericValue, { maximumFractionDigits: 1, ...opts })}%`;
}

export function formatDate(
  value: unknown,
  opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "2-digit" }
): string {
  const parsed = coerceDate(value);
  if (!parsed) {
    return FALLBACK_VALUE;
  }
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, opts).format(parsed);
}

export function formatShortDate(value: unknown): string {
  return formatDate(value, { month: "short", day: "numeric" });
}

function coerceNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return Number(value);
  }
  if (typeof (value as { valueOf?: () => unknown })?.valueOf === "function") {
    const result = (value as { valueOf: () => unknown }).valueOf();
    return typeof result === "number" ? result : Number(result);
  }
  return Number.NaN;
}

function coerceDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
