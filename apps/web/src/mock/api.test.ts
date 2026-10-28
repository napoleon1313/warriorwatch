import { describe, expect, it } from "vitest";
import { BUSY_THRESHOLDS, LIVE_FACILITY_ORDER } from "@warriorwatch/contract";
import { zonedToUtc } from "../lib/time";
import { mockBest, mockGet, mockHistory, mockLive, mockTypical } from "./api";

const tueEvening = zonedToUtc("2026-10-27", 18 * 60 + 30).getTime();
const tueEarly = zonedToUtc("2026-10-27", 4 * 60).getTime();

describe("mock API", () => {
  it("returns all 7 live facilities in contract order with consistent fields", () => {
    const live = mockLive(tueEvening, "normal");
    expect(live.facilities.map((f) => f.id)).toEqual(LIVE_FACILITY_ORDER);
    for (const f of live.facilities) {
      expect(f.count).toBeGreaterThanOrEqual(0);
      expect(f.count).toBeLessThanOrEqual(f.max);
      expect(f.sparkline).toHaveLength(36);
      expect(Date.parse(f.lastChange)).toBeLessThanOrEqual(Date.parse(live.fetchedAt) + 60_000);
      if (f.delta != null) expect(f.delta).toBe(f.count - f.typical!);
    }
  });

  it("makes PAC free weights busy on a Tuesday evening and the Esports lounge near-empty", () => {
    const live = mockLive(tueEvening, "normal");
    const fw = live.facilities.find((f) => f.id === LIVE_FACILITY_ORDER[0])!;
    expect(fw.count / fw.max).toBeGreaterThan(BUSY_THRESHOLDS.quiet);
    const es = live.facilities.find((f) => f.id === LIVE_FACILITY_ORDER[6])!;
    expect(es.count).toBeLessThanOrEqual(4);
  });

  it("is closed and zero at 4 AM", () => {
    for (const f of mockLive(tueEarly, "normal").facilities) {
      expect(f.open).toBe(false);
      expect(f.label).toBe("closed");
      expect(f.count).toBe(0);
    }
  });

  it("reports how many days back the typical curve is based on", () => {
    const t = mockTypical("pac-free-weights", "2", tueEvening, "normal");
    expect(t.slots).toHaveLength(96);
    expect(t.slots.find((s) => s.minute === 18 * 60)!.n).toBe(2); // 20 days back from a Tuesday = 2 Tuesdays
    const fresh = mockTypical("pac-free-weights", "2", tueEvening, "fresh");
    expect(fresh.slots.every((s) => s.median === null)).toBe(true);
  });

  it("ranks best windows quietest first and only while open", () => {
    const b = mockBest("cif-fitness", "2026-10-27", tueEvening, "normal");
    expect(b.windows.length).toBeGreaterThan(0);
    for (let i = 1; i < b.windows.length; i++) expect(b.windows[i]!.expected).toBeGreaterThanOrEqual(b.windows[i - 1]!.expected);
    expect(mockBest("esports-lounge", "2026-11-01", tueEvening, "normal").windows).toEqual([]); // closed Sundays
  });

  it("history never runs past now", () => {
    const h = mockHistory("pac-cardio", zonedToUtc("2026-10-27", 0).toISOString(), undefined, "5m", tueEvening, "normal");
    expect(Date.parse(h.points.at(-1)!.ts)).toBeLessThanOrEqual(tueEvening);
  });

  it("routes and errors like the worker", () => {
    expect(() => mockGet("nope", {}, "normal")).toThrow();
    expect(() => mockGet("live", {}, "down")).toThrow();
    expect(() => mockGet("typical", { facility: "nope" }, "normal")).toThrow(/unknown facility/);
  });
});
