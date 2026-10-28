import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { FACILITY_SLUGS, LIVE_FACILITY_ORDER, SOURCE } from "@warriorwatch/contract";
import type {
  BestResponse,
  EventsResponse,
  FacilitiesResponse,
  HistoryResponse,
  LiveResponse,
  TypicalResponse,
} from "@warriorwatch/contract";
import { app } from "../src/api";
import type { HealthResponse } from "../src/api";
import { resetSeedCheck } from "../src/db";
import type { Deps, Env } from "../src/env";
import { refreshFacilities } from "../src/facilities";
import { planReadings, runScrape } from "../src/ingest";
import { handleScheduled } from "../src/scheduled";
import { rebuildTypical } from "../src/typical";
import { FakeD1 } from "./d1-shim";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const OCCUPANCY_HTML = readFileSync(path("../../../fixtures/facility-occupancy-2026-10-27-2155.html"), "utf8");
const FACILITY_HTML = readFileSync(path("../../../fixtures/get-facility-pac-free-weights.html"), "utf8");
const FREE_WEIGHTS = "7c59cbfb-ea06-46e0-8ec7-06739ccaec45";

interface Call {
  url: string;
  ua: string | null;
  body?: string;
}

function setup(responder: (url: string) => Response | Promise<Response>, startIso = new Date().toISOString()) {
  resetSeedCheck();
  const db = new FakeD1(path("../migrations/0001_init.sql"));
  const calls: Call[] = [];
  let clock = Date.parse(startIso);
  const deps: Deps = {
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      calls.push({ url, ua: headers.get("User-Agent"), body: typeof init?.body === "string" ? init.body : undefined });
      return responder(url);
    },
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => new Date(clock),
  };
  const env: Env = { DB: db.asD1() };
  return { db, env, deps, calls, advance: (ms: number) => (clock += ms) };
}

const html = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/html" } });

describe("planReadings", () => {
  const snap = { ts: "2026-10-28T02:10:00.000Z", stale: false, readings: [{ facilityId: "a", ts: "2026-10-28T02:10:00.000Z", count: 5, max: 10 }] };
  it("stores the first reading, changes, and a once-per-UTC-hour heartbeat", () => {
    expect(planReadings(snap, new Map())).toHaveLength(1);
    const same = new Map([["a", { facility_id: "a", ts: "2026-10-28T02:01:00.000Z", count: 5, max: 10 }]]);
    expect(planReadings(snap, same)).toHaveLength(0);
    const changed = new Map([["a", { facility_id: "a", ts: "2026-10-28T02:01:00.000Z", count: 6, max: 10 }]]);
    expect(planReadings(snap, changed)).toHaveLength(1);
    const lastHour = new Map([["a", { facility_id: "a", ts: "2026-10-28T01:59:00.000Z", count: 5, max: 10 }]]);
    expect(planReadings(snap, lastHour)).toHaveLength(1);
  });
});

describe("scrape tick", () => {
  it("seeds facilities, stores 7 readings, records the scrape, identifies itself", async () => {
    const t = setup(() => html(OCCUPANCY_HTML));
    const { scrape, stored } = await runScrape(t.env, t.deps);
    expect(scrape).toMatchObject({ ok: 1, stale: 0, cards: 7, error: null });
    expect(stored).toBe(7);
    expect(t.calls).toEqual([{ url: SOURCE.occupancyUrl, ua: SOURCE.userAgent, body: undefined }]);
    expect(t.db.sqlite.prepare("SELECT COUNT(*) AS n FROM facilities").get()).toEqual({ n: 44 });
    expect(t.db.sqlite.prepare("SELECT count, max FROM readings WHERE facility_id = ?").get(FREE_WEIGHTS)).toEqual({ count: 42, max: 75 });

    // Same page a minute later, same hour: nothing new stored, scrape still recorded.
    t.advance(60_000);
    const again = await runScrape(t.env, t.deps);
    expect(again.stored).toBe(0);
    expect(t.db.sqlite.prepare("SELECT COUNT(*) AS n FROM scrapes").get()).toEqual({ n: 2 });
  });

  it("retries once, then records the failure without readings", async () => {
    const t = setup(() => html("down", 503));
    const { scrape, stored } = await runScrape(t.env, t.deps);
    expect(t.calls).toHaveLength(2);
    expect(scrape.ok).toBe(0);
    expect(scrape.error).toContain("HTTP 503");
    expect(stored).toBe(0);
  });

  it("does not store readings from a stale page", async () => {
    const stale = OCCUPANCY_HTML.replace('<div class="results-not-live live-occupancy-mode" hidden="hidden">', '<div class="results-not-live live-occupancy-mode">');
    const t = setup(() => html(stale));
    const { scrape, stored } = await runScrape(t.env, t.deps);
    expect(scrape).toMatchObject({ ok: 1, stale: 1, cards: 7 });
    expect(stored).toBe(0);
  });

  it("alerts the webhook once after 3 consecutive failures", async () => {
    const t = setup((url) => (url === SOURCE.occupancyUrl ? html("", 500) : new Response("ok")));
    t.env.ALERT_WEBHOOK = "https://hooks.example.test/alert";
    for (let i = 0; i < 4; i++) {
      await runScrape(t.env, t.deps);
      t.advance(60_000);
    }
    const alerts = t.calls.filter((c) => c.url === t.env.ALERT_WEBHOOK);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.body).toContain("3 consecutive scrape failures");
  });

  it("alerts when fewer than 7 cards parse", async () => {
    const broken = OCCUPANCY_HTML.replace(/data-occupancy="42"/g, 'data-occupancy="?"');
    const t = setup((url) => (url === SOURCE.occupancyUrl ? html(broken) : new Response("ok")));
    t.env.ALERT_WEBHOOK = "https://hooks.example.test/alert";
    const { scrape } = await runScrape(t.env, t.deps);
    expect(scrape.cards).toBe(6);
    expect(t.calls.filter((c) => c.url === t.env.ALERT_WEBHOOK)).toHaveLength(1);
  });
});

describe("daily facilities refresh", () => {
  it("fetches every facility page sequentially, 500 ms apart, and keeps failures' old rows", async () => {
    const t = setup((url) => (url.endsWith(FREE_WEIGHTS) ? html(FACILITY_HTML) : html("nope", 404)));
    const sleeps: number[] = [];
    const sleep = t.deps.sleep;
    t.deps.sleep = async (ms) => {
      sleeps.push(ms);
      await sleep(ms);
    };
    const result = await refreshFacilities(t.env, t.deps);
    expect(t.calls).toHaveLength(44);
    expect(t.calls.every((c) => c.ua === SOURCE.userAgent)).toBe(true);
    expect(sleeps).toEqual(new Array(43).fill(500));
    expect(result.updated).toBe(1);
    expect(result.failed).toHaveLength(43);
    expect(t.db.sqlite.prepare("SELECT COUNT(*) AS n FROM facilities").get()).toEqual({ n: 44 });
  });

  it("runs on the daily cron, not the minute cron", async () => {
    const t = setup(() => html(FACILITY_HTML));
    await handleScheduled("15 9 * * *", Date.parse("2026-10-28T09:15:00Z"), t.env, t.deps);
    expect(t.calls).toHaveLength(44);
  });
});

describe("API", () => {
  let t: ReturnType<typeof setup>;
  const get = async <T>(url: string) => {
    const res = await app.request(url, {}, t.env);
    return { res, body: (await res.json()) as T };
  };

  beforeEach(async () => {
    t = setup(() => html(OCCUPANCY_HTML));
    // Two days of history for Free Weights so typical/best have something to work with.
    const base = Date.now() - 14 * 86_400_000;
    const rows: string[] = [];
    for (let d = 0; d < 14; d += 7) {
      for (let m = 0; m < 24 * 60; m += 30) {
        const ts = new Date(base + d * 86_400_000 + m * 60_000).toISOString();
        rows.push(`('${FREE_WEIGHTS}', '${ts}', ${m < 12 * 60 ? 10 : 50}, 75)`);
      }
    }
    t.db.sqlite.exec(`INSERT INTO readings (facility_id, ts, count, max) VALUES ${rows.join(",")}`);
    await runScrape(t.env, t.deps);
    await rebuildTypical(t.env, FREE_WEIGHTS, new Date());
  });

  it("/api/live returns all 7 facilities in display order with CORS and cache headers", async () => {
    const { res, body } = await get<LiveResponse>("/api/live");
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=30, s-maxage=30");
    expect(body.stale).toBe(false);
    expect(body.facilities.map((f) => f.id)).toEqual(LIVE_FACILITY_ORDER);
    const fw = body.facilities[0]!;
    expect(fw).toMatchObject({ name: "PAC - 1st Floor - Free Weights", building: "Physical Activities Complex", count: 42, max: 75, pct: 56 });
    expect(fw.sparkline).toHaveLength(36);
    expect(fw.sparkline[35]).toBe(42);
    expect(["closed", "busy"]).toContain(fw.label);
  });

  it("/api/facilities returns all 44", async () => {
    const { res, body } = await get<FacilitiesResponse>("/api/facilities");
    expect(res.headers.get("Cache-Control")).toContain("max-age=3600");
    expect(body.facilities).toHaveLength(44);
    expect(body.facilities.filter((f) => f.liveOccupancy)).toHaveLength(7);
  });

  it("/api/history accepts slugs and buckets", async () => {
    const { body } = await get<HistoryResponse>(`/api/history?facility=${FACILITY_SLUGS[FREE_WEIGHTS]}&res=raw`);
    expect(body).toMatchObject({ facilityId: FREE_WEIGHTS, resolution: "raw" });
    expect(body.points.at(-1)).toMatchObject({ count: 42, max: 75 });
    const fiveMin = await get<HistoryResponse>(`/api/history?facility=${FREE_WEIGHTS}`);
    expect(fiveMin.body.resolution).toBe("5m");
    expect(fiveMin.body.points.at(-1)).toMatchObject({ count: 42, max: 75 });
  });

  it("/api/typical returns 96 slots", async () => {
    const { body } = await get<TypicalResponse>(`/api/typical?facility=pac-free-weights&weekday=1&term=term`);
    expect(body).toMatchObject({ facilityId: FREE_WEIGHTS, weekday: 1, term: "term" });
    expect(body.slots).toHaveLength(96);
    expect(body.slots[0]).toMatchObject({ minute: 0 });
  });

  it("/api/best returns ranked windows and confidence", async () => {
    const { res, body } = await get<BestResponse>(`/api/best?facility=pac-free-weights&date=2099-01-05`);
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ facilityId: FREE_WEIGHTS, date: "2099-01-05", confidence: "low" });
    expect(body.daysOfData).toBeGreaterThan(0);
  });

  it("/api/events returns an empty list until events are ingested", async () => {
    const { body } = await get<EventsResponse>(`/api/events?facility=${FREE_WEIGHTS}`);
    expect(body).toMatchObject({ facilityId: FREE_WEIGHTS, events: [] });
  });

  it("/api/health reports the last scrape", async () => {
    const { res, body } = await get<HealthResponse>("/api/health");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({ ok: true, cards: 7 });
  });

  it("returns typed errors", async () => {
    expect((await get("/api/history")).res.status).toBe(400);
    expect((await get("/api/history?facility=nope")).res.status).toBe(404);
    expect((await get("/api/typical?facility=pac-free-weights&weekday=9")).res.status).toBe(400);
    expect((await get("/api/best?facility=pac-free-weights&date=2026-02-30")).res.status).toBe(400);
    const missing = await get<{ error: string }>("/nope");
    expect(missing.res.status).toBe(404);
    expect(missing.body.error).toContain("no route");
  });

  it("rate limits at 60 requests per minute per IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) {
      statuses.push((await app.request("/api/health", { headers: { "CF-Connecting-IP": "203.0.113.9" } }, t.env)).status);
    }
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
  });
});

describe("migration", () => {
  it("0001 is the contract schema verbatim", () => {
    expect(readFileSync(path("../migrations/0001_init.sql"), "utf8")).toBe(
      readFileSync(path("../../../packages/contract/schema.sql"), "utf8"),
    );
  });
});
