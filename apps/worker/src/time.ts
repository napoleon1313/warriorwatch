/** Time-zone helpers. Storage is UTC ISO; anything human-facing is America/Toronto. */
import { SOURCE } from "@warriorwatch/contract";

export const TZ = SOURCE.timezone;
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface LocalParts {
  /** YYYY-MM-DD in the zone */
  date: string;
  weekday: Weekday;
  /** minutes since local midnight, 0..1439 */
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
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

function fields(at: Date, tz: string) {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(at)) if (p.type !== "literal") out[p.type] = parseInt(p.value, 10);
  return { y: out.year!, mo: out.month!, d: out.day!, h: out.hour! % 24, mi: out.minute!, s: out.second! };
}

export function localParts(at: Date, tz: string = TZ): LocalParts {
  const { y, mo, d, h, mi } = fields(at, tz);
  const date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { date, weekday: new Date(Date.UTC(y, mo - 1, d)).getUTCDay() as Weekday, minute: h * 60 + mi };
}

/** Local wall-clock minus UTC, in minutes (e.g. -240 for EDT). */
export function tzOffsetMinutes(at: Date, tz: string = TZ): number {
  const { y, mo, d, h, mi, s } = fields(at, tz);
  return Math.round((Date.UTC(y, mo - 1, d, h, mi, s) - Math.floor(at.getTime() / 1000) * 1000) / MINUTE);
}

/** The UTC instant of `minute` minutes after local midnight on local `date`. `minute` may exceed 1440. */
export function localToUtc(date: string, minute: number, tz: string = TZ): Date {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, mo - 1, d, 0, minute);
  let t = wall - tzOffsetMinutes(new Date(wall), tz) * MINUTE;
  const corrected = wall - tzOffsetMinutes(new Date(t), tz) * MINUTE;
  if (corrected !== t) t = corrected;
  return new Date(t);
}

export function addDays(date: string, days: number): string {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && addDays(s, 0) === s;
}
