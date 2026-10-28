/** Hourly rebuild of the precomputed `typical` table from readings. */
import { buildTypical, termCalendar } from "@warriorwatch/analytics";
import { readingsSince, upsertTypical } from "./db";
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
  const groups = buildTypical(readings, termCalendar, { until: now });
  await upsertTypical(env.DB, groups);
  return groups.length;
}
