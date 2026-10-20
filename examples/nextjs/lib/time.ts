/** Time zones the demo event form offers. Gelatin requires an explicit IANA zone. */
export const DEMO_TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
] as const;

function wallParts(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

function offsetMinutes(utcMs: number, timeZone: string) {
  const wall = wallParts(utcMs, timeZone);
  return (Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) - Math.floor(utcMs / 60_000) * 60_000) / 60_000;
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Convert a local wall-clock date and time in `timeZone` to an ISO timestamp
 * with that zone's offset. Times skipped by a daylight-saving change are rejected.
 */
export function zonedIso(date: string, time: string, timeZone: string): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) throw new Error("Invalid date or time");
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hour, minute] = timeMatch.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  if (Number.isNaN(wall) || hour > 23 || minute > 59) throw new Error("Invalid date or time");

  let utc = wall - offsetMinutes(wall, timeZone) * 60_000;
  utc = wall - offsetMinutes(utc, timeZone) * 60_000;
  const check = wallParts(utc, timeZone);
  if (check.year !== year || check.month !== month || check.day !== day || check.hour !== hour || check.minute !== minute) {
    throw new Error("That local time does not exist in this time zone");
  }
  const offset = offsetMinutes(utc, timeZone);
  const sign = offset < 0 ? "-" : "+";
  const absolute = Math.abs(offset);
  return `${date}T${time}:00${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

/** The event's end; an end time at or before the start time is the next morning. */
export function eventInterval(date: string, start: string, end: string, timeZone: string) {
  const startsAt = zonedIso(date, start, timeZone);
  let endDate = date;
  if (end <= start) {
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    endDate = next.toISOString().slice(0, 10);
  }
  return { starts_at: startsAt, ends_at: zonedIso(endDate, end, timeZone) };
}
