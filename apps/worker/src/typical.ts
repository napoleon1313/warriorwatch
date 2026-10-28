/**
 * Hourly rebuild of the precomputed `typical` table from readings.
 *
 * Only the curves that can have moved since the last run are touched: the (term, weekday) groups for
 * today in America/Toronto (and yesterday's, just after midnight). Within a group, only slots whose
 * numbers differ from the stored row are written. D1 meters rows written, so this turns a rebuild that
 * rewrote every slot of every weekday each hour into a handful of rows.
 */
import { buildTypical, localDateKey, localDayBounds, localParts, termCalendar } from "@warriorwatch/analytics";
import type { TypicalResponse, TypicalSlot } from "@warriorwatch/contract";
import { readingsInRanges, typicalSlots, upsertTypical } from "./db";
import type { Env } from "./env";
import { HOUR, shiftDateKey } from "./time";

/** Only recent weeks feed the curve: keeps the work bounded and the curve current. */
export const TYPICAL_LOOKBACK_DAYS = 70;
/** buildTypical carries a reading forward up to 90 min, so each day's window starts early enough to seed its first slots. */
const CARRY_MS = 2 * HOUR;
/** Local hours after midnight during which yesterday's curve is still rebuilt, so its last readings land even if one run fails. */
const FINALIZE_HOURS = 3;

/** Local dates whose curves may have changed since the previous hourly run: today, plus yesterday just after midnight. */
export function datesToRebuild(now: Date): string[] {
  const today = localDateKey(now);
  return localParts(now).hour < FINALIZE_HOURS ? [today, shiftDateKey(today, -1)] : [today];
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

export async function rebuildTypical(env: Env, facilityId: string, now: Date): Promise<RebuildResult> {
  const result: RebuildResult = { groups: 0, written: 0 };
  for (const dateKey of datesToRebuild(now)) {
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
  }
  return result;
}
