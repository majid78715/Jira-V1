export function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function getTimeZoneOffset(tz: string): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
    hour12: false
  };

  const formatter = new Intl.DateTimeFormat("en-US", options);
  return formatter.format(now);
}
