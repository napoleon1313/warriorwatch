import type { FacilityHours } from "@warriorwatch/contract";
import { WEEKDAYS, localParts, formatMinute, type Weekday } from "./time";

/**
 * Presentation-side parser for the portal's hours strings. Every variant in
 * facilities.json is covered by hours.test.ts. When @warriorwatch/analytics
 * lands, `isOpen` there is the canonical implementation; this one only feeds
 * display text ("closes 11:59 PM", "opens 6 AM") and the mock.
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

/** Short human status, e.g. "Closes at midnight" or "Opens 6 AM tomorrow". */
export function openStatus(hours: FacilityHours, at: Date | number = Date.now()): { open: boolean; text: string } {
  const lp = localParts(at);
  const open = isOpenAt(hours, at);
  if (open) {
    const today = rangeFor(hours, lp.weekday);
    const yday = rangeFor(hours, ((lp.weekday + 6) % 7) as Weekday);
    const close =
      today && lp.minuteOfDay >= today.open ? today.close : yday ? yday.close - 1440 : null;
    return { open, text: close == null ? "Open" : `Closes ${formatMinute(close)}` };
  }
  for (let i = 0; i < 7; i++) {
    const wd = ((lp.weekday + i) % 7) as Weekday;
    const r = rangeFor(hours, wd);
    if (!r || (i === 0 && r.open <= lp.minuteOfDay)) continue;
    const when = i === 0 ? "" : i === 1 ? " tomorrow" : ` ${WEEKDAYS[wd]}`;
    return { open, text: `Opens ${formatMinute(r.open)}${when}` };
  }
  return { open, text: "Closed" };
}
