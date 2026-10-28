import {
  LIVE_FACILITY_ORDER,
  busyLabel,
  type BestResponse,
  type BestWindow,
  type Facility,
  type FacilitiesResponse,
  type HistoryResponse,
  type LiveFacility,
  type LiveResponse,
  type TypicalResponse,
  type TypicalSlot,
} from "@warriorwatch/contract";
import registry from "@warriorwatch/contract/facilities.json";
import { addDays, localParts, weekdayOf, zonedToUtc, type Weekday } from "../lib/time";
import { SLUG_TO_ID } from "../lib/facilities";
import { isOpenAt } from "../lib/hours";
import { COUNT_STEP_MIN, countAt, expectedAt } from "./generate";

/**
 * In-browser stand-in for the worker, implementing packages/contract/API.md
 * over the synthetic generator. Scenarios (append ?mock=… to any page URL):
 *   fresh  – first days of collection: typical curves mostly empty
 *   stale  – portal showed the "results not live" banner
 *   down   – API unreachable (every call throws)
 */
export type MockScenario = "normal" | "fresh" | "stale" | "down";

const FACILITIES = registry as Facility[];
const byId = new Map(FACILITIES.map((f) => [f.id, f]));

/** Pretend collection started this many days ago. */
const DAYS_OF_DATA: Record<MockScenario, number> = { normal: 20, fresh: 2, stale: 20, down: 20 };

function resolve(facility: string | null | undefined): Facility {
  const id = facility ? (SLUG_TO_ID[facility] ?? facility) : "";
  const f = byId.get(id);
  if (!f) throw new MockHttpError(404, `unknown facility: ${facility}`);
  return f;
}

export class MockHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const MIN = 60_000;

/** Distinct past days with this weekday since collection started (today excluded). */
function daysForWeekday(weekday: Weekday, scenario: MockScenario, now: number): number {
  const today = localParts(now).ymd;
  let n = 0;
  for (let i = 1; i <= DAYS_OF_DATA[scenario]; i++) if (weekdayOf(addDays(today, -i)) === weekday) n++;
  return n;
}

function typicalSlots(f: Facility, weekday: Weekday, scenario: MockScenario, now: number): TypicalSlot[] {
  // Use a reference date with the requested weekday so hours apply correctly.
  const today = localParts(now).ymd;
  let ref = today;
  while (weekdayOf(ref) !== weekday) ref = addDays(ref, 1);
  const n = daysForWeekday(weekday, scenario, now);
  const max = f.maxOccupancy ?? 0;
  const slots: TypicalSlot[] = [];
  for (let minute = 0; minute < 1440; minute += 15) {
    if (n === 0) {
      slots.push({ minute, median: null, p25: null, p75: null, n: 0 });
      continue;
    }
    const at = zonedToUtc(ref, minute + 7).getTime();
    const med = expectedAt(f, at);
    // Fewer days → wider band; never below one person.
    const spread = (0.1 * max * Math.sqrt(med / Math.max(1, max) + 0.02)) * (1 + 1.5 / n);
    slots.push({
      minute,
      median: Math.round(med * 10) / 10,
      p25: Math.max(0, Math.round((med - spread) * 10) / 10),
      p75: Math.min(max, Math.round((med + spread) * 10) / 10),
      n,
    });
  }
  return slots;
}

function lastChange(f: Facility, now: number): string {
  const step = COUNT_STEP_MIN * MIN;
  let t = Math.floor(now / step) * step;
  const current = countAt(f, now);
  for (let i = 0; i < 24 * 60 / COUNT_STEP_MIN; i++) {
    const prev = countAt(f, t - step);
    if (prev !== current) return new Date(t + 20_000).toISOString();
    t -= step;
  }
  return new Date(t).toISOString();
}

function slope(points: { t: number; c: number }[]): number | null {
  if (points.length < 3) return null;
  const n = points.length;
  const mt = points.reduce((s, p) => s + p.t, 0) / n;
  const mc = points.reduce((s, p) => s + p.c, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.t - mt) * (p.c - mc);
    den += (p.t - mt) ** 2;
  }
  return den ? Math.round((num / den) * 10 * 10) / 10 : 0; // per minute → per 10 min
}

export function mockLive(now: number, scenario: MockScenario): LiveResponse {
  const fetchedAt = Math.floor(now / MIN) * MIN;
  const facilities: LiveFacility[] = LIVE_FACILITY_ORDER.map((id) => {
    const f = byId.get(id)!;
    const max = f.maxOccupancy ?? 0;
    const count = countAt(f, fetchedAt);
    const open = isOpenAt(f.hours, fetchedAt);
    const lp = localParts(fetchedAt);
    const slot = typicalSlots(f, lp.weekday, scenario, now)[Math.floor(lp.minuteOfDay / 15)];
    const typical = slot?.median == null ? null : Math.round(slot.median);
    const last20 = Array.from({ length: 21 }, (_, i) => ({ t: i - 20, c: countAt(f, fetchedAt - (20 - i) * MIN) }));
    const sparkline = Array.from({ length: 36 }, (_, i) => {
      const t = fetchedAt - (35 - i) * 5 * MIN;
      const hoursIn = (fetchedAt - t) / MIN;
      // "fresh" scenario: we only started collecting 2h ago
      return scenario === "fresh" && hoursIn > 120 ? null : countAt(f, t);
    });
    return {
      id,
      name: f.name,
      building: f.building,
      count,
      max,
      pct: max ? Math.round((count / max) * 100) : 0,
      label: busyLabel(count, max, open),
      open,
      typical: open ? typical : null,
      delta: open && typical != null ? count - typical : null,
      trend: open && scenario !== "fresh" ? slope(last20) : null,
      lastChange: lastChange(f, fetchedAt),
      sparkline,
    };
  });
  return { fetchedAt: new Date(fetchedAt).toISOString(), stale: scenario === "stale", facilities };
}

export function mockFacilities(): FacilitiesResponse {
  return { facilities: FACILITIES, updatedAt: zonedToUtc(localParts(Date.now()).ymd, 9 * 60 + 15).toISOString() };
}

export function mockHistory(
  facility: string,
  fromIso: string | undefined,
  toIso: string | undefined,
  res: string | undefined,
  now: number,
  scenario: MockScenario,
): HistoryResponse {
  const f = resolve(facility);
  const to = Math.min(toIso ? Date.parse(toIso) : now, now);
  const from = fromIso ? Date.parse(fromIso) : to - 24 * 60 * MIN;
  const resolution = (res === "raw" || res === "15m" || res === "1h" ? res : "5m") as HistoryResponse["resolution"];
  const stepMin = { raw: 1, "5m": 5, "15m": 15, "1h": 60 }[resolution];
  const collectedSince = now - DAYS_OF_DATA[scenario] * 24 * 60 * MIN;
  const points = [];
  const start = Math.ceil(Math.max(from, collectedSince) / (stepMin * MIN)) * stepMin * MIN;
  for (let t = start; t <= to; t += stepMin * MIN) {
    points.push({ ts: new Date(t).toISOString(), count: countAt(f, t), max: f.maxOccupancy ?? 0 });
  }
  return { facilityId: f.id, from: new Date(from).toISOString(), to: new Date(to).toISOString(), resolution, points };
}

export function mockTypical(facility: string, weekday: string | undefined, now: number, scenario: MockScenario): TypicalResponse {
  const f = resolve(facility);
  const wd = (weekday != null && weekday !== "" ? Number(weekday) : localParts(now).weekday) as Weekday;
  if (!(wd >= 0 && wd <= 6)) throw new MockHttpError(400, "weekday must be 0–6");
  return { facilityId: f.id, weekday: wd, term: "term", slots: typicalSlots(f, wd, scenario, now) };
}

const QUIET_SHARE = 0.4; // analytics README: best windows are where expected ≤ 40% of max
const MAX_WINDOW_SLOTS = 6; // split long quiet stretches into ≤ 90-min suggestions

export function mockBest(facility: string, date: string | undefined, now: number, scenario: MockScenario): BestResponse {
  const f = resolve(facility);
  const ymd = date ?? localParts(now).ymd;
  const wd = weekdayOf(ymd);
  const slots = typicalSlots(f, wd, scenario, now);
  const max = f.maxOccupancy ?? 0;
  const runs: TypicalSlot[][] = [];
  let cur: TypicalSlot[] = [];
  for (const s of slots) {
    const at = zonedToUtc(ymd, s.minute + 7).getTime();
    const open = isOpenAt(f.hours, at);
    const ok = open && s.median != null && s.median <= QUIET_SHARE * max;
    if (ok && cur.length < MAX_WINDOW_SLOTS) cur.push(s);
    else {
      if (cur.length >= 2) runs.push(cur);
      cur = ok ? [s] : [];
    }
  }
  if (cur.length >= 2) runs.push(cur);
  const windows: BestWindow[] = runs
    .map((run) => {
      const expected = run.reduce((a, s) => a + (s.median ?? 0), 0) / run.length;
      return {
        start: zonedToUtc(ymd, run[0]!.minute).toISOString(),
        end: zonedToUtc(ymd, run[run.length - 1]!.minute + 15).toISOString(),
        expected: Math.round(expected),
        pct: max ? Math.round((expected / max) * 100) : 0,
        label: busyLabel(expected, max, true),
      };
    })
    .sort((a, b) => a.expected - b.expected)
    .slice(0, 5);
  const daysOfData = DAYS_OF_DATA[scenario];
  return {
    facilityId: f.id,
    date: ymd,
    windows: slots.some((s) => s.n > 0) ? windows : [],
    confidence: daysOfData < 7 ? "low" : daysOfData < 28 ? "medium" : "high",
    daysOfData,
  };
}

/** Route a request path + query the same way the worker does. */
export function mockGet(path: string, q: Record<string, string | undefined>, scenario: MockScenario, now = Date.now()): unknown {
  if (scenario === "down") throw new MockHttpError(503, "mock: API unreachable");
  switch (path) {
    case "live":
      return mockLive(now, scenario);
    case "facilities":
      return mockFacilities();
    case "history":
      return mockHistory(q.facility ?? "", q.from, q.to, q.res, now, scenario);
    case "typical":
      return mockTypical(q.facility ?? "", q.weekday, now, scenario);
    case "best":
      return mockBest(q.facility ?? "", q.date, now, scenario);
    default:
      throw new MockHttpError(404, `no such endpoint: ${path}`);
  }
}
