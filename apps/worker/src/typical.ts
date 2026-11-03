/**
 * Daily rebuild of the precomputed `typical` table from readings.
 *
 * A weekday's curve is the median over completed days of that weekday, so it only changes once a
 * week: when that weekday ends. The scheduler rebuilds each facility's curve for the day that just
 * finished (America/Toronto), in the two hours after local midnight (the second pass is a retry and
 * writes nothing when the first succeeded). Within a group, only slots whose numbers differ from the
 * stored row are written. D1 meters rows read and written: rebuilding hourly with today's partial
 * readings cost ~1.4 million rows read a day and made "usual" partly circular (today compared with a
 * median that already included today).
 */
import { buildTypical, localDayBounds, localParts, termCalendar } from "@warriorwatch/analytics";
import type { TypicalResponse, TypicalSlot } from "@warriorwatch/contract";
import { readingsInRanges, typicalSlots, upsertTypical } from "./db";
import type { Env } from "./env";
import { HOUR, shiftDateKey } from "./time";

/** Only recent weeks feed the curve: keeps the work bounded and the curve current. */
export const TYPICAL_LOOKBACK_DAYS = 70;
/** buildTypical carries a reading forward up to 90 min, so each day's window starts early enough to seed its first slots. */
const CARRY_MS = 2 * HOUR;
/** Local hours after midnight during which the finished day is (re)built: the second hour is a retry. */
export const REBUILD_LOCAL_HOURS = 2;

/** The local date whose curve is due now: yesterday, during the first REBUILD_LOCAL_HOURS hours of the day; else null. */
export function dateToRebuild(now: Date): string | null {
  const lp = localParts(now);
  if (lp.hour >= REBUILD_LOCAL_HOURS) return null;
  const today = `${lp.year}-${String(lp.month).padStart(2, "0")}-${String(lp.day).padStart(2, "0")}`;
  return shiftDateKey(today, -1);
}

/** UTC windows for `dateKey` and the same weekday on each earlier week of the lookback, each padded back by CARRY_MS. */
export function sameWeekdayWindows(dateKey: string): { since: string; until: string }[] {
  const out: { since: string; until: string }[] = [];
  for (let back = 0; back < TYPICAL_LOOKBACK_DAYS; back += 7) {
    const { start, end } = localDayBounds(shiftDateKey(dateKey, -back));
    out.push({ since: new Date(start.getTime() - CARRY_MS).toISOString(), until: end.toISOString() });
  }
  return out;
}

/** The slots of `group` whose numbers differ from the stored rows (all of them when nothing is stored). */
export function changedSlots(group: TypicalResponse, stored: readonly TypicalSlot[]): TypicalSlot[] {
  const prev = new Map(stored.map((s) => [s.minute, s]));
  return group.slots.filter((s) => {
    const p = prev.get(s.minute);
    return !p || p.median !== s.median || p.p25 !== s.p25 || p.p75 !== s.p75 || p.n !== s.n;
  });
}

export interface RebuildResult {
  /** (term, weekday) groups recomputed. */
  groups: number;
  /** Slot rows actually written. */
  written: number;
}

/** Rebuild the facility's curves for `dateKey`'s weekday from that weekday's readings in the lookback, up to `now`. */
export async function rebuildTypical(env: Env, facilityId: string, dateKey: string, now: Date): Promise<RebuildResult> {
  const result: RebuildResult = { groups: 0, written: 0 };
  const weekday = localParts(localDayBounds(dateKey).start).weekday;
  const readings = await readingsInRanges(env.DB, facilityId, sameWeekdayWindows(dateKey));
  // The padding pulls in the tail of the previous day too; keep only the weekday being rebuilt.
  const groups = buildTypical(readings, termCalendar, { until: now }).filter((g) => g.weekday === weekday);
  for (const group of groups) {
    result.groups++;
    const changed = changedSlots(group, await typicalSlots(env.DB, group.facilityId, group.term, group.weekday));
    if (changed.length === 0) continue;
    await upsertTypical(env.DB, [{ ...group, slots: changed }]);
    result.written += changed.length;
  }
  return result;
}
