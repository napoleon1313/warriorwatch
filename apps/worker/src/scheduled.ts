/** Cron dispatch: the minute scrape (+ hourly typical rebuild) and the daily facilities refresh. */
import { LIVE_FACILITY_ORDER } from "@warriorwatch/contract";
import { defaultDeps } from "./env";
import type { Deps, Env } from "./env";
import { refreshFacilities } from "./facilities";
import { runScrape } from "./ingest";
import { rebuildTypical } from "./typical";

export const DAILY_CRON = "15 9 * * *";
/** Minutes past each hour at which `typical` is rebuilt, one live facility per minute. */
const TYPICAL_FIRST_MINUTE = 5;

export async function handleScheduled(cron: string, scheduledTime: number, env: Env, deps: Deps = defaultDeps): Promise<void> {
  if (cron === DAILY_CRON) {
    await refreshFacilities(env, deps);
    return;
  }
  const { scrape, stored } = await runScrape(env, deps);
  console.log(`scrape ok=${scrape.ok} stale=${scrape.stale} cards=${scrape.cards} stored=${stored} ms=${scrape.ms}`);

  // Spread the hourly typical rebuild over minutes :05..:11 so each invocation stays small.
  const minute = new Date(scheduledTime).getUTCMinutes();
  const facilityId = LIVE_FACILITY_ORDER[minute - TYPICAL_FIRST_MINUTE];
  if (facilityId) {
    const groups = await rebuildTypical(env, facilityId, deps.now());
    console.log(`typical rebuilt for ${facilityId}: ${groups} groups`);
  }
}
