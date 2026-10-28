import { busyLabel, type BestWindow, type FacilityHours, type TypicalSlot } from "@warriorwatch/contract";
import { isOpen } from "./hours.ts";
import { DEFAULT_TZ, MINUTE_MS, SLOT_MINUTES, localDateKey, localDayBounds, localSlot, toDate } from "./time.ts";

export interface BestWindowOptions {
  tz?: string;
  /** Drop slots that end at or before this instant (e.g. "now" for the rest of today). */
  from?: Date | string;
  /** Quiet means expected ≤ threshold × max. Default 0.4. */
  threshold?: number;
  /** Shortest window worth suggesting. Default 30. */
  minMinutes?: number;
  /** Default 5. */
  limit?: number;
}

const SLOT_MS = SLOT_MINUTES * MINUTE_MS;

/**
 * Quiet windows on a local date, quietest first.
 *
 * `typical` is the slot curve for that date's weekday and term. A 15-minute
 * slot qualifies when its median is ≤ 40% of `max` and the facility is open for
 * the whole slot. Adjacent qualifying slots merge into one window; windows
 * shorter than 30 minutes are dropped. `expected` is the mean slot median.
 * Slots are walked in real time from local midnight to the next, so DST days
 * have 92 or 100 slots and windows never claim a non-existent hour.
 */
export function bestWindows(
  typical: readonly TypicalSlot[],
  hours: FacilityHours,
  date: string | Date,
  max: number,
  options: BestWindowOptions = {},
): BestWindow[] {
  const tz = options.tz ?? DEFAULT_TZ;
  const threshold = options.threshold ?? 0.4;
  const minSlots = Math.ceil((options.minMinutes ?? 30) / SLOT_MINUTES);
  const limit = options.limit ?? 5;
  const from = options.from === undefined ? -Infinity : toDate(options.from).getTime();
  if (!(max > 0)) return [];

  const key = typeof date === "string" ? date : localDateKey(date, tz);
  const bySlot = new Map(typical.map((s) => [s.minute, s]));
  const { start, end } = localDayBounds(key, tz);

  const runs: { start: number; medians: number[] }[] = [];
  let run: { start: number; medians: number[] } | null = null;
  for (let t = start.getTime(); t < end.getTime(); t += SLOT_MS) {
    const median = bySlot.get(localSlot(new Date(t).toISOString(), tz).minute)?.median ?? null;
    const quiet =
      median !== null &&
      median <= threshold * max &&
      t + SLOT_MS > from &&
      isOpen(hours, new Date(t), tz) &&
      isOpen(hours, new Date(t + SLOT_MS - MINUTE_MS), tz);
    if (quiet) {
      if (!run) runs.push((run = { start: t, medians: [] }));
      run.medians.push(median);
    } else {
      run = null;
    }
  }

  return runs
    .filter((r) => r.medians.length >= minSlots)
    .map((r): BestWindow => {
      const expected = Math.round((r.medians.reduce((a, b) => a + b, 0) / r.medians.length) * 10) / 10;
      return {
        start: new Date(r.start).toISOString(),
        end: new Date(r.start + r.medians.length * SLOT_MS).toISOString(),
        expected,
        pct: Math.round((expected / max) * 100),
        label: busyLabel(expected, max, true),
      };
    })
    .sort((a, b) => a.expected - b.expected || a.start.localeCompare(b.start))
    .slice(0, limit);
}
