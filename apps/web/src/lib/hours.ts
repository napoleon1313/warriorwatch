import type { FacilityHours } from "@warriorwatch/contract";
import { WEEKDAYS, addDays, formatMinute, localParts, zonedToUtc, type Weekday } from "./time";

/**
 * Presentation-side parser for the portal's hours strings. Every variant in
 * facilities.json is covered by hours.test.ts. @warriorwatch/analytics has the
 * canonical `isOpen`; this one feeds display text ("closes 11:59 PM",
 * "opens Wed 6 AM, in 3 h 20 min") and the mock.
 */
export interface Range {
  /** minutes since local midnight */
  open: number;
  /** may exceed 1440 when the range runs past midnight ("6:00 - 12:30 AM") */
  close: number;
}

const TIME = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i;

function toMinutes(h: number, m: number, mer: string): number {
  const hh = (h % 12) + (mer.toUpperCase() === "PM" ? 12 : 0);
  return hh * 60 + m;
}

export function parseRange(raw: string | undefined): Range | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || /closed/i.test(s)) return null;
  const [a, b] = s.split(/\s*[-–]\s*/);
  const ma = a?.match(TIME);
  const mb = b?.match(TIME);
  if (!ma || !mb || !mb[3]) return null;
  const endMer = mb[3];
  let close = toMinutes(Number(mb[1]), Number(mb[2]), endMer);
  let open: number;
  if (ma[3]) {
    open = toMinutes(Number(ma[1]), Number(ma[2]), ma[3]);
  } else {
    // "12:00 - 10:00 PM" (noon) / "6:00 - 12:30 AM" (6 AM, closes after midnight):
    // start inherits the end's meridiem; if that would put start after end,
    // the range crosses midnight.
    open = toMinutes(Number(ma[1]), Number(ma[2]), endMer);
  }
  if (close === 1439) close = 1440; // 11:59 PM means "until midnight"
  if (close <= open) close += 1440;
  return { open, close };
}

export function rangeFor(hours: FacilityHours, weekday: Weekday): Range | null {
  return parseRange(hours[WEEKDAYS[weekday]]);
}

export function isOpenAt(hours: FacilityHours, at: Date | number | string): boolean {
  const lp = localParts(at);
  const today = rangeFor(hours, lp.weekday);
  if (today && lp.minuteOfDay >= today.open && lp.minuteOfDay < today.close) return true;
  const yday = rangeFor(hours, ((lp.weekday + 6) % 7) as Weekday);
  return !!yday && yday.close > 1440 && lp.minuteOfDay < yday.close - 1440;
}

export function formatRange(r: Range | null): string {
  if (!r) return "Closed";
  if (r.open === 0 && r.close >= 1440) return "Open 24 hours";
  return `${formatMinute(r.open)} – ${formatMinute(r.close)}`;
}

/** "in 3 h 20 min", "in 45 min", "in 2 days" */
export function formatCountdown(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `in ${h} h ${m % 60} min` : `in ${h} h`;
  const d = Math.round(h / 24);
  return `in ${d} day${d === 1 ? "" : "s"}`;
}

export interface OpenStatus {
  open: boolean;
  /** "Closes midnight" / "Opens 6 AM tomorrow" */
  text: string;
  /** instant of the next transition (close if open, open if closed); null if unknown */
  at: number | null;
  /** "in 3 h 20 min" relative to `now`; "" if unknown */
  inText: string;
  /** "Wed 6:00 AM" absolute, for the closed state */
  whenText: string;
}

const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Open/closed with the next transition. When closed, gives the next opening
 * as both an absolute time ("Wed 6 AM") and a countdown ("in 3 h 20 min").
 */
export function openStatus(hours: FacilityHours, at: Date | number = Date.now()): OpenStatus {
  const nowMs = at instanceof Date ? at.getTime() : at;
  const lp = localParts(nowMs);
  const open = isOpenAt(hours, nowMs);
  if (open) {
    const today = rangeFor(hours, lp.weekday);
    const yday = rangeFor(hours, ((lp.weekday + 6) % 7) as Weekday);
    const inToday = today && lp.minuteOfDay >= today.open;
    const closeMin = inToday ? today.close : yday ? yday.close - 1440 : null;
    if (closeMin == null) return { open, text: "Open", at: null, inText: "", whenText: "" };
    const closeAt = zonedToUtc(inToday ? lp.ymd : lp.ymd, closeMin).getTime();
    return {
      open,
      text: `Closes ${formatMinute(closeMin)}`,
      at: closeAt,
      inText: formatCountdown(closeAt - nowMs),
      whenText: formatMinute(closeMin),
    };
  }
  for (let i = 0; i < 8; i++) {
    const wd = ((lp.weekday + i) % 7) as Weekday;
    const r = rangeFor(hours, wd);
    if (!r || (i === 0 && r.open <= lp.minuteOfDay)) continue;
    const ymd = addDays(lp.ymd, i);
    const openAt = zonedToUtc(ymd, r.open).getTime();
    const when = i === 0 ? "" : i === 1 ? " tomorrow" : ` ${WEEKDAYS[wd]}`;
    return {
      open,
      text: `Opens ${formatMinute(r.open)}${when}`,
      at: openAt,
      inText: formatCountdown(openAt - nowMs),
      whenText: `${i === 0 ? "Today" : i === 1 ? "Tomorrow" : SHORT[wd]} ${formatMinute(r.open)}`,
    };
  }
  return { open, text: "Closed", at: null, inText: "", whenText: "" };
}
