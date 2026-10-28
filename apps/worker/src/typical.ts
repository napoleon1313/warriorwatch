/** Hourly rebuild of the precomputed `typical` table from readings. */
import type { Reading, TermBucket } from "@warriorwatch/contract";
import { buildTypical, localSlot, termBucketFor, termCalendar } from "./analytics";
import { readingsSince, upsertTypical } from "./db";
import type { TypicalGroup } from "./db";
import type { Env } from "./env";
import { DAY } from "./time";

/** Only recent weeks feed the curve: keeps the work bounded and the curve current. */
export const TYPICAL_LOOKBACK_DAYS = 70;

/**
 * Recompute every (term, weekday) group that has readings for `facilityId` in the lookback.
 * Groups outside the lookback keep their stored rows.
 */
export async function rebuildTypical(env: Env, facilityId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - TYPICAL_LOOKBACK_DAYS * DAY).toISOString();
  const readings = await readingsSince(env.DB, facilityId, since);

  const groups = new Map<string, { term: TermBucket; weekday: number; readings: Reading[] }>();
  for (const r of readings) {
    const term = termBucketFor(new Date(r.ts), termCalendar);
    const { weekday } = localSlot(r.ts);
    const key = `${term}:${weekday}`;
    const g = groups.get(key) ?? { term, weekday, readings: [] };
    g.readings.push(r);
    groups.set(key, g);
  }

  const out: TypicalGroup[] = [...groups.values()].map((g) => ({
    facilityId,
    term: g.term,
    weekday: g.weekday,
    slots: buildTypical(g.readings, termCalendar),
  }));
  await upsertTypical(env.DB, out);
  return out.length;
}
