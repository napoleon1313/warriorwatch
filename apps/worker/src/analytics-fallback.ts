/**
 * Minimal stand-in for @warriorwatch/analytics (built on another branch), with the function
 * names and shapes from packages/analytics/README.md. Simple but honest: same inputs, same
 * outputs, fewer refinements. `src/analytics.ts` is the only module that imports this.
 */
import { busyLabel } from "@warriorwatch/contract";
import type { BestWindow, FacilityHours, Reading, TermBucket, TypicalSlot } from "@warriorwatch/contract";
import { MINUTE, TZ, WEEKDAY_NAMES, localParts, localToUtc } from "./time";
import type { Weekday } from "./time";

export interface TermRange {
  from: string;
  to: string;
  bucket: TermBucket;
  label: string;
}
export interface TermCalendar {
  ranges: TermRange[];
}

/** Empty until packages/analytics/term-calendar.json exists; everything is then "term". */
export const termCalendar: TermCalendar = { ranges: [] };

/** Longest gap a change-only series is forward-filled across (heartbeats are hourly). */
const FILL_CAP_MINUTES = 75;

export function termBucketFor(date: Date, calendar: TermCalendar): TermBucket {
  const day = localParts(date).date;
  let inTerm = false;
  for (const r of calendar.ranges) {
    if (r.from <= day && day <= r.to) {
      if (r.bucket !== "term") return r.bucket;
      inTerm = true;
    }
  }
  const hasTerms = calendar.ranges.some((r) => r.bucket === "term");
  return inTerm || !hasTerms ? "term" : "break";
}

export function localSlot(ts: string, tz: string = TZ): { weekday: Weekday; minute: number } {
  const p = localParts(new Date(ts), tz);
  return { weekday: p.weekday, minute: Math.floor(p.minute / 15) * 15 };
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Typical curve for ONE (facility, term, weekday) group: the caller groups.
 * Each local day's change-only series is forward-filled to 1-minute samples, averaged per
 * 15-minute slot, then median/p25/p75 are taken across days. `n` = days with data in the slot.
 */
export function buildTypical(readings: Reading[], _calendar: TermCalendar): TypicalSlot[] {
  const byDay = new Map<string, { minute: number; count: number }[]>();
  for (const r of [...readings].sort((a, b) => a.ts.localeCompare(b.ts))) {
    const p = localParts(new Date(r.ts));
    const list = byDay.get(p.date) ?? [];
    list.push({ minute: p.minute, count: r.count });
    byDay.set(p.date, list);
  }

  const perSlot: number[][] = Array.from({ length: 96 }, () => []);
  for (const series of byDay.values()) {
    const sum = new Array<number>(96).fill(0);
    const cnt = new Array<number>(96).fill(0);
    series.forEach((s, i) => {
      const end = Math.min(series[i + 1]?.minute ?? 1440, s.minute + FILL_CAP_MINUTES, 1440);
      for (let m = s.minute; m < end; m++) {
        sum[Math.floor(m / 15)]! += s.count;
        cnt[Math.floor(m / 15)]! += 1;
      }
    });
    for (let k = 0; k < 96; k++) if (cnt[k]! > 0) perSlot[k]!.push(sum[k]! / cnt[k]!);
  }

  return perSlot.map((values, k) => {
    const sorted = values.sort((a, b) => a - b);
    const has = sorted.length > 0;
    return {
      minute: k * 15,
      median: has ? round1(quantile(sorted, 0.5)) : null,
      p25: has ? round1(quantile(sorted, 0.25)) : null,
      p75: has ? round1(quantile(sorted, 0.75)) : null,
      n: sorted.length,
    };
  });
}

export function nowVsTypical(count: number, slot: TypicalSlot): { delta: number | null; verdict: "quieter" | "usual" | "busier" } {
  if (slot.median === null) return { delta: null, verdict: "usual" };
  const delta = count - slot.median;
  const iqr = slot.p25 !== null && slot.p75 !== null ? slot.p75 - slot.p25 : 0;
  const threshold = Math.max(2, 0.5 * iqr);
  return { delta, verdict: delta > threshold ? "busier" : delta < -threshold ? "quieter" : "usual" };
}

/** People per 10 minutes, least squares over the samples given; null if fewer than 3. */
export function trend(last20min: Reading[]): number | null {
  if (last20min.length < 3) return null;
  const t0 = Date.parse(last20min[0]!.ts);
  const xs = last20min.map((r) => (Date.parse(r.ts) - t0) / MINUTE);
  const ys = last20min.map((r) => r.count);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i]! - my);
    den += (x - mx) ** 2;
  });
  return den === 0 ? null : Math.round((num / den) * 10 * 100) / 100;
}

export function confidence(daysOfData: number): "low" | "medium" | "high" {
  return daysOfData < 7 ? "low" : daysOfData < 28 ? "medium" : "high";
}

/**
 * "6:00 AM - 11:59 PM" → minutes [360, 1440). A start without AM/PM takes the end's
 * ("12:00 - 10:00 PM" is noon to 10 PM). An end at or before the start runs past midnight.
 */
export function parseHoursRange(s: string | undefined): { open: number; close: number } | null {
  const m = s?.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  const toMin = (h: string, mi: string, mer: string) => ((parseInt(h, 10) % 12) + (mer.toUpperCase() === "PM" ? 12 : 0)) * 60 + parseInt(mi, 10);
  const open = toMin(m[1]!, m[2]!, m[3] ?? m[6]!);
  let close = toMin(m[4]!, m[5]!, m[6]!);
  if (close === 23 * 60 + 59) close = 1440;
  if (close <= open) close += 1440;
  return { open, close };
}

export function isOpen(hours: FacilityHours, at: Date, tz: string = TZ): boolean {
  const p = localParts(at, tz);
  const today = parseHoursRange(hours[WEEKDAY_NAMES[p.weekday]!]);
  if (today && p.minute >= today.open && p.minute < today.close) return true;
  const yesterday = parseHoursRange(hours[WEEKDAY_NAMES[(p.weekday + 6) % 7]!]);
  return !!yesterday && yesterday.close > 1440 && p.minute < yesterday.close - 1440;
}

/** Contiguous ≥30-min runs on local `date` where the typical median is ≤ 40% of max while open; quietest first, max 5. */
export function bestWindows(typical: TypicalSlot[], hours: FacilityHours, date: string, max: number): BestWindow[] {
  const ok = (slot: TypicalSlot | undefined): slot is TypicalSlot & { median: number } => {
    if (!slot || slot.median === null || max <= 0 || slot.median > 0.4 * max) return false;
    const start = localToUtc(date, slot.minute);
    return isOpen(hours, start) && isOpen(hours, new Date(start.getTime() + 15 * MINUTE - 1));
  };
  const slots = [...typical].sort((a, b) => a.minute - b.minute);
  const windows: BestWindow[] = [];
  let run: (TypicalSlot & { median: number })[] = [];
  const flush = () => {
    if (run.length >= 2) {
      const expected = round1(run.reduce((a, s) => a + s.median, 0) / run.length);
      windows.push({
        start: localToUtc(date, run[0]!.minute).toISOString(),
        end: localToUtc(date, run[run.length - 1]!.minute + 15).toISOString(),
        expected,
        pct: Math.round((expected / max) * 100),
        label: busyLabel(expected, max, true),
      });
    }
    run = [];
  };
  for (const slot of slots) {
    const last = run[run.length - 1];
    if (ok(slot) && (!last || slot.minute === last.minute + 15)) run.push(slot);
    else {
      flush();
      if (ok(slot)) run.push(slot);
    }
  }
  flush();
  return windows.sort((a, b) => a.expected - b.expected || a.start.localeCompare(b.start)).slice(0, 5);
}
