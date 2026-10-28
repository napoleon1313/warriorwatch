import { SOURCE } from "@warriorwatch/contract";

/** Everything a human sees is America/Toronto. Data stays UTC ISO. */
export const TZ = SOURCE.timezone;

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export type WeekdayName = (typeof WEEKDAYS)[number];
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface LocalParts {
  /** YYYY-MM-DD in Toronto */
  ymd: string;
  weekday: Weekday;
  hour: number;
  minute: number;
  /** minutes since local midnight */
  minuteOfDay: number;
}

export function localParts(at: Date | string | number): LocalParts {
  const d = at instanceof Date ? at : new Date(at);
  const p: Record<string, string> = {};
  for (const { type, value } of partsFmt.formatToParts(d)) p[type] = value;
  const hour = Number(p.hour) % 24;
  const minute = Number(p.minute);
  return {
    ymd: `${p.year}-${p.month}-${p.day}`,
    weekday: SHORT_DAYS.indexOf(p.weekday ?? "Sun") as Weekday,
    hour,
    minute,
    minuteOfDay: hour * 60 + minute,
  };
}

/** UTC instant of a Toronto wall-clock time (handles DST by re-checking the offset). */
export function zonedToUtc(ymd: string, minuteOfDay = 0): Date {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d, 0, minuteOfDay);
  let guess = naive;
  for (let i = 0; i < 2; i++) {
    const lp = localParts(guess);
    const [ly, lm, ld] = lp.ymd.split("-").map(Number) as [number, number, number];
    const seen = Date.UTC(ly, lm - 1, ld, 0, lp.minuteOfDay);
    guess += naive - seen;
  }
  return new Date(guess);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function weekdayOf(ymd: string): Weekday {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

const timeFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
/** "6:05 p.m." → normalised to "6:05 PM" */
export function formatTime(at: Date | string | number): string {
  return timeFmt.format(at instanceof Date ? at : new Date(at)).replace(/\s?a\.m\./i, " AM").replace(/\s?p\.m\./i, " PM");
}

/** Minutes since midnight → "6 AM", "12:30 PM", "midnight". */
export function formatMinute(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  if (m === 0 || m === 1439) return "midnight";
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return mm === 0 ? `${h12} ${suffix}` : `${h12}:${String(mm).padStart(2, "0")} ${suffix}`;
}

/** Compact hour label for axes: "6a", "12p". */
export function hourTick(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  if (hh === 0) return "12a";
  if (hh === 12) return "12p";
  return hh < 12 ? `${hh}a` : `${hh - 12}p`;
}

export function relativeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60 ? `${m % 60} min ` : ""}ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
/** "Tue, Oct 28" for a local YYYY-MM-DD */
export function formatYmd(ymd: string): string {
  return dayFmt.format(new Date(`${ymd}T12:00:00Z`)).replace(/\.$/, "");
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
