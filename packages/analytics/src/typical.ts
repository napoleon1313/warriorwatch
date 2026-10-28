import type { Reading, TermBucket, TypicalResponse, TypicalSlot } from "@warriorwatch/contract";
import { termBucketFor, termCalendar, type TermCalendar } from "./calendar.ts";
import {
  DAY_MS,
  DEFAULT_TZ,
  MINUTE_MS,
  SLOT_MINUTES,
  cachedOffsetMs,
  dateKeyFromDayNumber,
  toDate,
  weekdayOfDayNumber,
  type Weekday,
} from "./time.ts";

export interface BuildTypicalOptions {
  tz?: string;
  /**
   * A reading's count is carried forward until the next reading, but never
   * longer than this. The worker writes an hourly heartbeat, so a longer gap
   * means the scraper was down and the minutes stay unknown. Default 90.
   */
  maxGapMinutes?: number;
  /** Do not fill past this instant (pass "now" so the last reading is not extended into the future). */
  until?: Date | string;
}

const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;

/** Linear-interpolated quantile of an ascending array (same as numpy's default). */
export function quantile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

const round1 = (x: number) => Math.round(x * 10) / 10;

interface DayAcc {
  sum: number;
  minutes: number;
}

/**
 * Typical occupancy curves, one TypicalResponse per (facility, term bucket,
 * local weekday) that has data, each with all 96 fifteen-minute slots.
 *
 * Change-only readings are forward-filled to a 1-minute grid first (a value
 * holds until the next reading, capped by `maxGapMinutes`). Each local day
 * then contributes the mean of its filled minutes to a slot, and median / p25 /
 * p75 are taken across days, so `n` is the number of distinct local days that
 * have at least one filled minute in the slot. Slot boundaries are local wall
 * time, so DST days simply have 92 or 100 slot-quarters of data.
 */
export function buildTypical(
  readings: readonly Reading[],
  calendar: TermCalendar = termCalendar,
  options: BuildTypicalOptions = {},
): TypicalResponse[] {
  const tz = options.tz ?? DEFAULT_TZ;
  const maxGap = (options.maxGapMinutes ?? 90) * MINUTE_MS;
  const until = options.until === undefined ? Infinity : toDate(options.until).getTime();

  const byFacility = new Map<string, { t: number; count: number }[]>();
  for (const r of readings) {
    let series = byFacility.get(r.facilityId);
    if (!series) byFacility.set(r.facilityId, (series = []));
    series.push({ t: toDate(r.ts).getTime(), count: r.count });
  }

  // group key -> slot index -> local day number -> accumulated minutes
  const groups = new Map<string, Map<number, DayAcc>[]>();
  const termOfDay = new Map<number, TermBucket>();

  for (const [facilityId, series] of byFacility) {
    series.sort((a, b) => a.t - b.t);
    for (let i = 0; i < series.length; i++) {
      const cur = series[i] as { t: number; count: number };
      const next = series[i + 1]?.t ?? Infinity;
      const end = Math.min(next, cur.t + maxGap, until);
      for (let m = Math.ceil(cur.t / MINUTE_MS) * MINUTE_MS; m < end; m += MINUTE_MS) {
        const local = m + cachedOffsetMs(m, tz);
        const day = Math.floor(local / DAY_MS);
        const slot = Math.floor((local - day * DAY_MS) / (SLOT_MINUTES * MINUTE_MS));
        let term = termOfDay.get(day);
        if (term === undefined) {
          term = termBucketFor(dateKeyFromDayNumber(day), calendar, tz);
          termOfDay.set(day, term);
        }
        const key = `${facilityId}|${term}|${weekdayOfDayNumber(day)}`;
        let slots = groups.get(key);
        if (!slots) {
          slots = Array.from({ length: SLOTS_PER_DAY }, () => new Map<number, DayAcc>());
          groups.set(key, slots);
        }
        const days = slots[slot] as Map<number, DayAcc>;
        const acc = days.get(day);
        if (acc) {
          acc.sum += cur.count;
          acc.minutes += 1;
        } else {
          days.set(day, { sum: cur.count, minutes: 1 });
        }
      }
    }
  }

  const out: TypicalResponse[] = [];
  for (const [key, slots] of groups) {
    const [facilityId, term, weekday] = key.split("|") as [string, TermBucket, string];
    out.push({
      facilityId,
      term,
      weekday: Number(weekday) as Weekday,
      slots: slots.map((days, i): TypicalSlot => {
        const values = [...days.values()].map((d) => d.sum / d.minutes).sort((a, b) => a - b);
        const median = quantile(values, 0.5);
        const p25 = quantile(values, 0.25);
        const p75 = quantile(values, 0.75);
        return {
          minute: i * SLOT_MINUTES,
          median: median === null ? null : round1(median),
          p25: p25 === null ? null : round1(p25),
          p75: p75 === null ? null : round1(p75),
          n: values.length,
        };
      }),
    });
  }
  out.sort(
    (a, b) =>
      a.facilityId.localeCompare(b.facilityId) ||
      a.term.localeCompare(b.term) ||
      a.weekday - b.weekday,
  );
  return out;
}
