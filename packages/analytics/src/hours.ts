/**
 * Opening hours as the portal renders them in FacilityHours.
 *
 * Variants seen in packages/contract/facilities.json:
 *   "6:00 AM - 11:59 PM"   both meridiems shown
 *   "12:00 AM - 11:59 PM"  open all day
 *   "12:00 - 10:00 PM"     shared meridiem collapsed: noon to 10 PM
 *   "6:00 - 12:30 AM"      shared meridiem collapsed: 6 AM to 00:30 the next day
 *   "Closed"
 * The portal drops the start meridiem when it equals the end one, so a bare
 * start inherits the end meridiem. "11:59 PM" means "until midnight".
 */
import type { FacilityHours } from "@warriorwatch/contract";
import { DEFAULT_TZ, localParts } from "./time.ts";

export interface OpenInterval {
  /** minutes since local midnight */
  open: number;
  /** minutes since local midnight of the same day; > 1440 when closing after midnight */
  close: number;
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const RANGE = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i;

function toMinutes(h: number, m: number, meridiem: string): number {
  const pm = meridiem.toUpperCase() === "PM";
  return ((h % 12) + (pm ? 12 : 0)) * 60 + m;
}

/** Parse one day's hours string. Returns null for "Closed", missing or unrecognised text. */
export function parseHours(text: string | undefined | null): OpenInterval | null {
  if (!text) return null;
  const m = RANGE.exec(text);
  if (!m) return null;
  const endMeridiem = m[6] as string;
  const open = toMinutes(Number(m[1]), Number(m[2]), m[3] ?? endMeridiem);
  let close = toMinutes(Number(m[4]), Number(m[5]), endMeridiem);
  if (close === 23 * 60 + 59) close = 24 * 60;
  if (close <= open) close += 24 * 60;
  return { open, close };
}

/**
 * Whether the facility is open at instant `at`, judged on the local wall clock
 * in `tz`. Hours that run past midnight ("6:00 - 12:30 AM") keep the facility
 * open into the early morning of the next day.
 */
export function isOpen(hours: FacilityHours, at: Date | string = new Date(), tz: string = DEFAULT_TZ): boolean {
  const p = localParts(at, tz);
  const now = p.hour * 60 + p.minute + p.second / 60;
  const today = parseHours(hours[DAY_NAMES[p.weekday]]);
  if (today && now >= today.open && now < today.close) return true;
  const yesterday = parseHours(hours[DAY_NAMES[(p.weekday + 6) % 7] as (typeof DAY_NAMES)[number]]);
  return !!yesterday && yesterday.close > 1440 && now + 1440 < yesterday.close;
}
