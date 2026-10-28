import { describe, expect, it } from "vitest";
import { bestWindows } from "../src/index.ts";
import { ALL_DAY, ESPORTS_HOURS, GYM_HOURS, POOL_HOURS, curve, toronto } from "./helpers.ts";

const MAX = 75; // PAC free weights; quiet = expected <= 30

describe("bestWindows", () => {
  // Monday-ish curve: quiet early, busy mid-morning with one lone quiet slot, quiet late evening
  const monday = curve((m) => {
    if (m < 6 * 60) return 0; // closed anyway
    if (m < 8 * 60) return 10;
    if (m === 9 * 60) return 5; // a single 15-min dip
    if (m < 20 * 60) return 50;
    return 20;
  });

  it("merges adjacent quiet slots, drops runs under 30 min and respects opening hours", () => {
    const windows = bestWindows(monday, GYM_HOURS, "2026-10-26", MAX);
    expect(windows).toEqual([
      { start: toronto("2026-10-26", "06:00"), end: toronto("2026-10-26", "08:00"), expected: 10, pct: 13, label: "quiet" },
      { start: toronto("2026-10-26", "20:00"), end: toronto("2026-10-27", "00:00"), expected: 20, pct: 27, label: "quiet" },
    ]);
  });

  it("skips Sunday morning when the gym opens at 9", () => {
    const flat = curve(() => 3);
    const [w, ...rest] = bestWindows(flat, GYM_HOURS, "2026-10-25", MAX);
    expect(rest).toEqual([]);
    expect(w).toMatchObject({ start: toronto("2026-10-25", "09:00"), end: toronto("2026-10-26", "00:00"), expected: 3 });
  });

  it("returns nothing on a closed day", () => {
    expect(bestWindows(curve(() => 0), ESPORTS_HOURS, "2026-10-25", 20)).toEqual([]);
  });

  it("uses the previous day's after-midnight close", () => {
    // Tuesday: open 00:00-00:30 (Monday's "6:00 - 12:30 AM") and from 06:00
    const windows = bestWindows(curve(() => 2), POOL_HOURS, "2026-10-27", 100);
    expect(windows.map((w) => [w.start, w.end])).toEqual([
      [toronto("2026-10-27", "00:00"), toronto("2026-10-27", "00:30")],
      [toronto("2026-10-27", "06:00"), toronto("2026-10-28", "00:00")],
    ]);
  });

  it("excludes slots that are only partly open", () => {
    const hours = { Wednesday: "6:10 AM - 11:30 PM" };
    const [w] = bestWindows(curve(() => 1), hours, "2026-10-28", MAX);
    expect(w).toMatchObject({ start: toronto("2026-10-28", "06:15"), end: toronto("2026-10-28", "23:30") });
  });

  it("ranks quietest first, ties by start time, and keeps at most 5", () => {
    // seven 30-minute quiet windows separated by busy slots, expected 7,6,...,1
    const ranked = curve((m) => {
      const block = Math.floor((m - 6 * 60) / 60);
      if (m < 6 * 60 || block > 6) return 60;
      return m % 60 < 30 ? 7 - block : 60;
    });
    const windows = bestWindows(ranked, ALL_DAY, "2026-10-28", MAX);
    expect(windows.map((w) => w.expected)).toEqual([1, 2, 3, 4, 5]);
    expect(windows[0]!.start).toBe(toronto("2026-10-28", "12:00"));
    expect(bestWindows(ranked, ALL_DAY, "2026-10-28", MAX, { limit: 2 })).toHaveLength(2);
    const tie = bestWindows(curve((m) => (m === 0 || m === 15 || m === 60 || m === 75 ? 1 : 60)), ALL_DAY, "2026-10-28", MAX);
    expect(tie.map((w) => w.start)).toEqual([toronto("2026-10-28", "00:00"), toronto("2026-10-28", "01:00")]);
  });

  it("treats exactly 40% as quiet and ignores slots without data", () => {
    expect(bestWindows(curve(() => 30), ALL_DAY, "2026-10-28", MAX)[0]).toMatchObject({ expected: 30, pct: 40, label: "moderate" });
    expect(bestWindows(curve(() => 30.1), ALL_DAY, "2026-10-28", MAX)).toEqual([]);
    expect(bestWindows(curve(() => null), ALL_DAY, "2026-10-28", MAX)).toEqual([]);
    expect(bestWindows([], ALL_DAY, "2026-10-28", MAX)).toEqual([]);
  });

  it("averages the slot medians and honours threshold and minMinutes options", () => {
    const steps = curve((m) => (m >= 600 && m < 660 ? [4, 8, 6, 2][(m - 600) / 15]! : 70));
    expect(bestWindows(steps, ALL_DAY, "2026-10-28", MAX)).toEqual([
      { start: toronto("2026-10-28", "10:00"), end: toronto("2026-10-28", "11:00"), expected: 5, pct: 7, label: "quiet" },
    ]);
    expect(bestWindows(steps, ALL_DAY, "2026-10-28", MAX, { minMinutes: 90 })).toEqual([]);
    expect(bestWindows(steps, ALL_DAY, "2026-10-28", MAX, { threshold: 0.95 })).toHaveLength(1);
    expect(bestWindows(steps, ALL_DAY, "2026-10-28", MAX, { threshold: 0.05 })).toEqual([]);
  });

  it("drops slots already over when `from` is set", () => {
    const windows = bestWindows(monday, GYM_HOURS, "2026-10-26", MAX, { from: toronto("2026-10-26", "21:07") });
    expect(windows).toEqual([
      { start: toronto("2026-10-26", "21:00"), end: toronto("2026-10-27", "00:00"), expected: 20, pct: 27, label: "quiet" },
    ]);
  });

  it("accepts a Date for the local day", () => {
    const fromDate = bestWindows(monday, GYM_HOURS, new Date(toronto("2026-10-26", "23:30")), MAX);
    expect(fromDate).toEqual(bestWindows(monday, GYM_HOURS, "2026-10-26", MAX));
  });

  it("returns nothing when max is unknown", () => {
    expect(bestWindows(monday, GYM_HOURS, "2026-10-26", 0)).toEqual([]);
    expect(bestWindows(monday, GYM_HOURS, "2026-10-26", Number.NaN)).toEqual([]);
  });

  it("spans a 23-hour day on 2026-03-08 and a 25-hour day on 2025-11-02", () => {
    const [spring] = bestWindows(curve(() => 0), ALL_DAY, "2026-03-08", MAX);
    expect(spring).toMatchObject({ start: "2026-03-08T05:00:00.000Z", end: "2026-03-09T04:00:00.000Z" });
    const [fall] = bestWindows(curve(() => 0), ALL_DAY, "2025-11-02", MAX);
    expect(fall).toMatchObject({ start: "2025-11-02T04:00:00.000Z", end: "2025-11-03T05:00:00.000Z" });
  });

  it("never offers the missing 02:00 hour on spring-forward day", () => {
    // only 02:00-02:45 would be quiet, and that hour does not exist on 2026-03-08
    const twoAm = curve((m) => (m >= 120 && m < 180 ? 0 : 60));
    expect(bestWindows(twoAm, ALL_DAY, "2026-03-08", MAX)).toEqual([]);
    expect(bestWindows(twoAm, ALL_DAY, "2026-03-15", MAX)).toHaveLength(1);
  });
});
