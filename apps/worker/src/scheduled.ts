/**
 * Cron dispatch. Every minute: the portal scrape, then (every 5th minute) the Waitz library poll, then
 * (in the two hours after local midnight) one facility's typical rebuild for the day that just ended,
 * then a slice of the booking calendars. Daily: facility metadata.
 */
import { LIVE_FACILITY_ORDER } from "@warriorwatch/contract";
import { defaultDeps } from "./env";
import type { Deps, Env } from "./env";
import { runEventsTick } from "./events";
import { refreshFacilities, refreshLibraries } from "./facilities";
import { runScrape } from "./ingest";
import { MINUTE } from "./time";
import { dateToRebuild, rebuildTypical } from "./typical";
import { WAITZ_EVERY_MINUTES, runWaitz } from "./waitz";

export const DAILY_CRON = "15 9 * * *";
/** Minutes past the hour at which `typical` is rebuilt, one live facility per minute (26 facilities: :05–:30). */
const TYPICAL_FIRST_MINUTE = 5;

export async function handleScheduled(cron: string, scheduledTime: number, env: Env, deps: Deps = defaultDeps): Promise<void> {
  if (cron === DAILY_CRON) {
    await refreshFacilities(env, deps);
    await refreshLibraries(env, deps);
    return;
  }
  // Occupancy first: it is the time-critical sample. Later stages must not lose it, nor block each other.
  const { scrape, stored } = await runScrape(env, deps);
  console.log(`scrape ok=${scrape.ok} stale=${scrape.stale} cards=${scrape.cards} stored=${stored} ms=${scrape.ms}`);

  const at = new Date(scheduledTime);
  const minute = at.getUTCMinutes();
  if (minute % WAITZ_EVERY_MINUTES === 0) {
    try {
      const w = await runWaitz(env, deps);
      console.log(`waitz ok=${w.ok} locations=${w.locations} stored=${w.stored}${w.unknown.length ? ` unknown=${w.unknown.join(",")}` : ""}${w.error ? ` error=${w.error}` : ""}`);
    } catch (err) {
      console.error(`waitz poll failed: ${String(err)}`);
    }
  }

  // Spread the daily rebuild over minutes :05..:30, one facility per minute, so each invocation stays small.
  const facilityId = LIVE_FACILITY_ORDER[minute - TYPICAL_FIRST_MINUTE];
  const rebuildDate = facilityId ? dateToRebuild(deps.now()) : null;
  if (facilityId && rebuildDate) {
    try {
      const { groups, written } = await rebuildTypical(env, facilityId, rebuildDate, deps.now());
      console.log(`typical ${facilityId} for ${rebuildDate}: ${groups} groups, ${written} slots written`);
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
