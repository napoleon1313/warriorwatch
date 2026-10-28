import { describe, expect, it } from "vitest";
import type { Reading, TypicalSlot } from "@warriorwatch/contract";
import {
  bestWindows,
  buildTypical,
  confidence,
  isOpen,
  localSlot,
  nowVsTypical,
  parseHoursRange,
  termBucketFor,
  trend,
} from "../src/analytics-fallback";
import { localToUtc } from "../src/time";

describe("hours", () => {
  it("parses every format in facilities.json", () => {
    expect(parseHoursRange("6:00 AM - 11:59 PM")).toEqual({ open: 360, close: 1440 });
    expect(parseHoursRange("12:00 AM - 11:59 PM")).toEqual({ open: 0, close: 1440 });
    expect(parseHoursRange("12:00 - 10:00 PM")).toEqual({ open: 720, close: 1320 });
    expect(parseHoursRange("6:00 - 12:30 AM")).toEqual({ open: 360, close: 1470 });
    expect(parseHoursRange("Closed")).toBeNull();
  });

  it("knows open/closed in Toronto time, including past-midnight hours", () => {
    const hours = { Monday: "6:00 - 12:30 AM", Tuesday: "Closed" };
    expect(isOpen(hours, localToUtc("2026-10-26", 7 * 60))).toBe(true); // Mon 7:00
    expect(isOpen(hours, localToUtc("2026-10-26", 5 * 60))).toBe(false); // Mon 5:00
    expect(isOpen(hours, localToUtc("2026-10-27", 15))).toBe(true); // Tue 0:15, Monday spill-over
    expect(isOpen(hours, localToUtc("2026-10-27", 45))).toBe(false); // Tue 0:45
  });
});

describe("time slots", () => {
  it("maps UTC to Toronto weekday and 15-min slot across DST", () => {
    expect(localSlot("2026-10-28T01:55:00Z")).toEqual({ weekday: 2, minute: 21 * 60 + 45 }); // Tue 9:55 PM EDT
    expect(localSlot("2026-11-02T14:07:00Z")).toEqual({ weekday: 1, minute: 9 * 60 }); // Mon 9:07 AM EST
  });

  it("defaults to 'term' with an empty calendar", () => {
    expect(termBucketFor(new Date(), { ranges: [] })).toBe("term");
    const cal = { ranges: [{ from: "2026-09-08", to: "2026-12-22", bucket: "term" as const, label: "Fall" }, { from: "2026-10-12", to: "2026-10-16", bucket: "reading-week" as const, label: "RW" }] };
    expect(termBucketFor(new Date("2026-10-14T16:00:00Z"), cal)).toBe("reading-week");
    expect(termBucketFor(new Date("2026-10-28T16:00:00Z"), cal)).toBe("term");
    expect(termBucketFor(new Date("2027-01-02T16:00:00Z"), cal)).toBe("break");
  });
});

describe("buildTypical", () => {
  const r = (ts: string, count: number): Reading => ({ facilityId: "x", ts, count, max: 50 });
  it("forward-fills change-only samples and takes the median across days", () => {
    const slots = buildTypical(
      [
        r("2026-10-26T10:00:00Z", 10), // Mon 6:00 AM EDT
        r("2026-10-26T10:30:00Z", 20),
        r("2026-11-02T11:00:00Z", 30), // Mon 6:00 AM EST
      ],
      { ranges: [] },
    );
    expect(slots).toHaveLength(96);
    const six = slots.find((s) => s.minute === 360)!;
    expect(six).toMatchObject({ n: 2, median: 20 }); // day 1: 10, day 2: 30
    const sixThirty = slots.find((s) => s.minute === 390)!;
    expect(sixThirty).toMatchObject({ n: 2, median: 25 }); // day 1: 20, day 2: 30 (forward-filled)
    expect(slots.find((s) => s.minute === 0)).toMatchObject({ n: 0, median: null });
  });
});

describe("small helpers", () => {
  const slot: TypicalSlot = { minute: 600, median: 20, p25: 10, p75: 30, n: 5 };
  it("nowVsTypical uses max(2, IQR/2)", () => {
    expect(nowVsTypical(31, slot).verdict).toBe("busier");
    expect(nowVsTypical(29, slot).verdict).toBe("usual");
    expect(nowVsTypical(9, slot)).toEqual({ delta: -11, verdict: "quieter" });
  });
  it("trend is people per 10 minutes", () => {
    const rs = [0, 5, 10].map((m, i) => ({ facilityId: "x", ts: new Date(Date.UTC(2026, 0, 1, 0, m)).toISOString(), count: i * 5, max: 50 }));
    expect(trend(rs)).toBe(10);
    expect(trend(rs.slice(0, 2))).toBeNull();
  });
  it("confidence thresholds", () => {
    expect([confidence(0), confidence(7), confidence(28)]).toEqual(["low", "medium", "high"]);
  });
});

describe("bestWindows", () => {
  it("finds open, quiet runs of at least 30 minutes, quietest first", () => {
    const slots: TypicalSlot[] = Array.from({ length: 96 }, (_, k) => ({ minute: k * 15, median: k < 40 ? 5 : k < 44 ? 60 : k === 50 ? 2 : 10, p25: null, p75: null, n: 3 }));
    const w = bestWindows(slots, { Wednesday: "6:00 AM - 11:59 PM" }, "2026-10-28", 75);
    expect(w.length).toBeGreaterThan(0);
    expect(w[0]!.start).toBe(localToUtc("2026-10-28", 6 * 60).toISOString()); // 6:00 AM, nothing before opening
    expect(w[0]!.end).toBe(localToUtc("2026-10-28", 10 * 60).toISOString());
    expect(w[0]!.label).toBe("quiet");
    expect(w.every((x) => x.pct <= 40)).toBe(true);
  });
});
