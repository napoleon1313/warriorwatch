import { describe, expect, it } from "vitest";
import { confidence, nowVsTypical, trend } from "../src/index.ts";
import { reading } from "./helpers.ts";

describe("nowVsTypical", () => {
  const slot = { minute: 600, median: 20, p25: 10, p75: 30, n: 12 };

  it("uses half the IQR as the threshold when it exceeds 2 people", () => {
    expect(nowVsTypical(31, slot)).toEqual({ delta: 11, verdict: "busier" });
    expect(nowVsTypical(30, slot)).toEqual({ delta: 10, verdict: "usual" });
    expect(nowVsTypical(10, slot)).toEqual({ delta: -10, verdict: "usual" });
    expect(nowVsTypical(9, slot)).toEqual({ delta: -11, verdict: "quieter" });
  });

  it("falls back to 2 people when the band is narrow or missing", () => {
    const narrow = { minute: 600, median: 20, p25: 19, p75: 21, n: 3 };
    expect(nowVsTypical(23, narrow).verdict).toBe("busier");
    expect(nowVsTypical(22, narrow).verdict).toBe("usual");
    expect(nowVsTypical(17, { ...narrow, p25: null, p75: null })).toEqual({ delta: -3, verdict: "quieter" });
  });

  it("says usual with no typical data", () => {
    expect(nowVsTypical(40, { minute: 0, median: null, p25: null, p75: null, n: 0 })).toEqual({ delta: null, verdict: "usual" });
    expect(nowVsTypical(40, undefined)).toEqual({ delta: null, verdict: "usual" });
  });
});

describe("trend", () => {
  const at = (min: number, count: number) =>
    reading(new Date(Date.parse("2026-10-28T14:00:00Z") + min * 60_000).toISOString(), count);

  it("returns people per 10 minutes by least squares", () => {
    expect(trend([at(0, 10), at(5, 12), at(10, 14)])).toBe(4);
    expect(trend([at(10, 14), at(0, 10), at(5, 12)])).toBe(4); // order does not matter
    expect(trend([at(0, 30), at(4, 28), at(12, 25), at(20, 20)])).toBe(-4.9);
  });

  it("returns 0, not -0, for a flat series", () => {
    expect(Object.is(trend([at(0, 5), at(7, 5), at(19, 5)]), 0)).toBe(true);
  });

  it("returns null with fewer than 3 points or no time spread", () => {
    expect(trend([])).toBeNull();
    expect(trend([at(0, 1), at(5, 3)])).toBeNull();
    expect(trend([at(3, 1), at(3, 2), at(3, 3)])).toBeNull();
  });
});

describe("confidence", () => {
  it.each([
    [0, "low"],
    [6, "low"],
    [7, "medium"],
    [27, "medium"],
    [28, "high"],
    [400, "high"],
  ] as const)("%i days -> %s", (days, level) => {
    expect(confidence(days)).toBe(level);
  });
});
