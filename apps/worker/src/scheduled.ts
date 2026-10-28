/** Cron dispatch: the minute scrape (+ hourly typical rebuild, + calendar slice) and the daily facilities refresh. */
import { LIVE_FACILITY_ORDER } from "@warriorwatch/contract";
import { defaultDeps } from "./env";
import type { Deps, Env } from "./env";
import { runEventsTick } from "./events";
import { refreshFacilities } from "./facilities";
import { runScrape } from "./ingest";
import { MINUTE } from "./time";
import { rebuildTypical } from "./typical";

export const DAILY_CRON = "15 9 * * *";
/** Minutes past each hour at which `typical` is rebuilt, one live facility per minute. */
const TYPICAL_FIRST_MINUTE = 5;

export async function handleScheduled(cron: string, scheduledTime: number, env: Env, deps: Deps = defaultDeps): Promise<void> {
  if (cron === DAILY_CRON) {
    await refreshFacilities(env, deps);
    return;
  }
  // Occupancy first: it is the time-critical sample. Later stages must not lose it, nor block each other.
  const { scrape, stored } = await runScrape(env, deps);
  console.log(`scrape ok=${scrape.ok} stale=${scrape.stale} cards=${scrape.cards} stored=${stored} ms=${scrape.ms}`);

  // Spread the hourly typical rebuild over minutes :05..:11 so each invocation stays small.
  const minute = new Date(scheduledTime).getUTCMinutes();
  const facilityId = LIVE_FACILITY_ORDER[minute - TYPICAL_FIRST_MINUTE];
  if (facilityId) {
    try {
      const { groups, written } = await rebuildTypical(env, facilityId, deps.now());
      console.log(`typical ${facilityId}: ${groups} groups, ${written} slots written`);
    } catch (err) {
      console.error(`typical rebuild for ${facilityId} failed: ${String(err)}`);
    }
  }

  try {
    const { updated, failed } = await runEventsTick(env, deps, Math.floor(scheduledTime / MINUTE));
    console.log(`events: ${updated.map((u) => `${u.facilityId}=${u.events}${u.changed ? "*" : ""}`).join(" ")}${failed.length ? ` failed=${failed.join(",")}` : ""}`);
  } catch (err) {
    console.error(`events tick failed: ${String(err)}`);
  }
}
