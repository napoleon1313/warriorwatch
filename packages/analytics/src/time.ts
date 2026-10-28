/**
 * Time-zone helpers built on Intl.DateTimeFormat parts only (no tz database
 * dependency). Everything a human sees is America/Toronto; storage is UTC ISO.
 */
import type { TypicalResponse } from "@warriorwatch/contract";

export const DEFAULT_TZ = "America/Toronto";
export const SLOT_MINUTES = 15;

export type Weekday = TypicalResponse["weekday"];

export interface LocalParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number; // 0..23
  minute: number;
  second: number;
  weekday: Weekday; // 0 = Sunday
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEKDAYS: Record<string, Weekday> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

export function toDate(at: Date | string | number): Date {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid date: ${String(at)}`);
  return d;
}

/** Wall-clock parts of `at` in `tz`. */
export function localParts(at: Date | string | number, tz: string = DEFAULT_TZ): LocalParts {
  const out: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(toDate(at))) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS[out.weekday as string] as Weekday,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date "YYYY-MM-DD" of `at` in `tz`. */
export function localDateKey(at: Date | string | number, tz: string = DEFAULT_TZ): string {
  const p = localParts(at, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Weekday and 15-minute slot (minutes since local midnight) of an ISO timestamp. */
export function localSlot(ts: string, tz: string = DEFAULT_TZ): { weekday: Weekday; minute: number } {
  const p = localParts(ts, tz);
  const minute = p.hour * 60 + p.minute;
  return { weekday: p.weekday, minute: minute - (minute % SLOT_MINUTES) };
}

/** Offset of `tz` from UTC at instant `utcMs`, in ms (Toronto: -4h or -5h). */
export function tzOffsetMs(utcMs: number, tz: string = DEFAULT_TZ): number {
  const p = localParts(utcMs, tz);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - (utcMs - (((utcMs % 1000) + 1000) % 1000));
}

// Zone offsets only change on whole UTC hours in every zone we care about, so
// one Intl call per (zone, UTC hour) is enough for minute-level work.
const offsetCache = new Map<string, number>();
export function cachedOffsetMs(utcMs: number, tz: string): number {
  const key = `${tz}|${Math.floor(utcMs / HOUR_MS)}`;
  let off = offsetCache.get(key);
  if (off === undefined) {
    if (offsetCache.size > 100_000) offsetCache.clear();
    off = tzOffsetMs(Math.floor(utcMs / HOUR_MS) * HOUR_MS, tz);
    offsetCache.set(key, off);
  }
  return off;
}

/** Parse "YYYY-MM-DD" to a UTC day number (days since 1970-01-01). */
export function dayNumber(dateKey: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) throw new RangeError(`Expected YYYY-MM-DD, got ${dateKey}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
}

export function dateKeyFromDayNumber(day: number): string {
  const d = new Date(day * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 1970-01-01 was a Thursday. */
export function weekdayOfDayNumber(day: number): Weekday {
  return (((day + 4) % 7) + 7) % 7 as Weekday;
}

/**
 * UTC instant of local wall time `minuteOfDay` on `dateKey` in `tz`.
 * Ambiguous times (fall-back) resolve to the first occurrence; non-existent
 * times (spring-forward gap) are pushed forward by the gap (02:30 -> 03:30).
 */
export function zonedTimeToUtc(dateKey: string, minuteOfDay: number, tz: string = DEFAULT_TZ): Date {
  const wall = dayNumber(dateKey) * DAY_MS + minuteOfDay * MINUTE_MS;
  const off1 = tzOffsetMs(wall, tz);
  const utc1 = wall - off1;
  const off2 = tzOffsetMs(utc1, tz);
  if (off2 === off1) return new Date(utc1);
  const utc2 = wall - off2;
  if (tzOffsetMs(utc2, tz) === off2) return new Date(utc2);
  return new Date(Math.max(utc1, utc2));
}

/** [start, end) UTC instants of the local day `dateKey`; 23 or 25 hours on DST days. */
export function localDayBounds(dateKey: string, tz: string = DEFAULT_TZ): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc(dateKey, 0, tz),
    end: zonedTimeToUtc(dateKeyFromDayNumber(dayNumber(dateKey) + 1), 0, tz),
  };
}

export { MINUTE_MS, DAY_MS };
