import type { TypicalResponse } from "@warriorwatch/contract";
import { describe, expect, it } from "vitest";
import { buildTypical, quantile, termCalendar } from "../src/index.ts";
import { CIF, PAC_FREE_WEIGHTS, day, reading, slotAt, toronto } from "./helpers.ts";

const only = (groups: TypicalResponse[]) => {
  expect(groups).toHaveLength(1);
  return groups[0]!;
};

describe("quantile", () => {
  it("interpolates linearly", () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([7], 0.25)).toBe(7);
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantile([10, 20, 30, 40], 0.25)).toBe(17.5);
    expect(quantile([10, 20, 30, 40], 0.75)).toBe(32.5);
  });
});

describe("buildTypical", () => {
  it("forward-fills a sparse change-only day before bucketing", () => {
    // Wednesday 2026-10-28, Fall 2026 term. Counts change at 09:00, 09:40, 10:30;
    // the hourly heartbeat repeats 5 at 11:30 and 12:30.
    const readings = day("2026-10-28", [
      ["09:00", 10],
      ["09:40", 20],
      ["10:30", 5],
      ["11:30", 5],
      ["12:30", 5],
    ]);
    const g = only(buildTypical(readings, termCalendar, { until: toronto("2026-10-28", "13:00") }));
    expect(g).toMatchObject({ facilityId: PAC_FREE_WEIGHTS, term: "term", weekday: 3 });
    expect(g.slots).toHaveLength(96);
    expect(slotAt(g.slots, "08:45")).toEqual({ minute: 525, median: null, p25: null, p75: null, n: 0 });
    // no reading inside 09:15-09:29, yet the slot is filled with the carried value
    expect(slotAt(g.slots, "09:15")).toEqual({ minute: 555, median: 10, p25: 10, p75: 10, n: 1 });
    // 10 minutes at 10 + 5 minutes at 20
    expect(slotAt(g.slots, "09:30").median).toBe(13.3);
    expect(slotAt(g.slots, "10:15").median).toBe(20);
    expect(slotAt(g.slots, "11:00").median).toBe(5);
    expect(slotAt(g.slots, "12:45")).toMatchObject({ median: 5, n: 1 });
    expect(slotAt(g.slots, "13:00").n).toBe(0); // `until` stops the fill
  });

  it("handles a day with only 2 readings", () => {
    // Thursday 2026-10-29: the scraper only saw two counts
    const g = only(buildTypical(day("2026-10-29", [["14:00", 12], ["14:20", 18]])));
    expect(g.weekday).toBe(4);
    expect(slotAt(g.slots, "14:00").median).toBe(12);
    expect(slotAt(g.slots, "14:15").median).toBe(16); // 5 min at 12, 10 min at 18
    expect(slotAt(g.slots, "15:30").median).toBe(18);
    expect(slotAt(g.slots, "15:45")).toMatchObject({ median: 18, n: 1 }); // 90-min cap ends at 15:50
    expect(slotAt(g.slots, "16:00")).toMatchObject({ median: null, n: 0 });
    expect(g.slots.filter((s) => s.n > 0)).toHaveLength(8);
  });

  it("does not fill across a scraper outage longer than maxGapMinutes", () => {
    const readings = day("2026-10-28", [["06:00", 3], ["10:00", 8]]);
    const g = only(buildTypical(readings, termCalendar, { maxGapMinutes: 90, until: toronto("2026-10-28", "10:15") }));
    expect(slotAt(g.slots, "07:15").median).toBe(3);
    expect(slotAt(g.slots, "07:30").n).toBe(0);
    expect(slotAt(g.slots, "09:45").n).toBe(0);
    expect(slotAt(g.slots, "10:00").median).toBe(8);
    const wide = only(buildTypical(readings, termCalendar, { maxGapMinutes: 240 }));
    expect(slotAt(wide.slots, "09:45").median).toBe(3);
  });

  it("takes median and IQR across days and counts distinct days", () => {
    // four Wednesdays in Fall 2026 (two in EDT, two in EST)
    const dates = ["2026-10-28", "2026-11-04", "2026-11-11", "2026-11-18"];
    const readings = dates.flatMap((d, i) => day(d, [["08:50", (i + 1) * 10], ["09:15", 0]]));
    const g = only(buildTypical(readings.reverse()));
    expect(slotAt(g.slots, "09:00")).toEqual({ minute: 540, median: 25, p25: 17.5, p75: 32.5, n: 4 });
    expect(slotAt(g.slots, "09:15")).toMatchObject({ median: 0, n: 4 });
  });

  it("splits by facility, term bucket and weekday", () => {
    const readings = [
      ...day("2026-10-28", [["10:00", 4]]), // Wed, term
      ...day("2026-10-14", [["10:00", 2]]), // Wed, reading week
      ...day("2026-10-12", [["10:00", 1]]), // Mon, Thanksgiving
      ...day("2026-10-28", [["10:00", 50]], CIF),
    ];
    const groups = buildTypical(readings);
    // sorted by facility id, then term, then weekday
    expect(groups.map((g) => [g.facilityId === CIF ? "cif" : "pac", g.term, g.weekday])).toEqual([
      ["pac", "holiday", 1],
      ["pac", "reading-week", 3],
      ["pac", "term", 3],
      ["cif", "term", 3],
    ]);
    const cif = groups.find((g) => g.facilityId === CIF)!;
    expect(slotAt(cif.slots, "10:00").median).toBe(50);
  });

  it("uses local wall-clock slots on the 2025-11-02 fall-back day", () => {
    // Readings every 30 min UTC from 00:00 EDT to 04:00 EST, count = index
    const readings = Array.from({ length: 11 }, (_, i) =>
      reading(new Date(Date.parse("2025-11-02T04:00:00Z") + i * 30 * 60_000).toISOString(), i),
    );
    const g = only(buildTypical(readings, termCalendar, { until: "2025-11-02T09:15:00Z" }));
    expect(g).toMatchObject({ term: "term", weekday: 0 });
    // 01:00-01:14 happens at 05:00Z (count 2) and 06:00Z (count 4): one day, mean 3
    expect(slotAt(g.slots, "01:00")).toMatchObject({ median: 3, n: 1 });
    expect(slotAt(g.slots, "01:30")).toMatchObject({ median: 4, n: 1 });
    expect(slotAt(g.slots, "02:00")).toMatchObject({ median: 6, n: 1 }); // 07:00Z = 02:00 EST
    expect(slotAt(g.slots, "04:00")).toMatchObject({ median: 10, n: 1 });
    expect(slotAt(g.slots, "04:15").n).toBe(0);
  });

  it("leaves the missing hour empty on the 2026-03-08 spring-forward day", () => {
    const readings = Array.from({ length: 9 }, (_, i) =>
      reading(new Date(Date.parse("2026-03-08T05:00:00Z") + i * 30 * 60_000).toISOString(), i),
    );
    const g = only(buildTypical(readings, termCalendar, { until: "2026-03-08T09:30:00Z" }));
    expect(g).toMatchObject({ term: "term", weekday: 0 });
    expect(slotAt(g.slots, "01:30")).toMatchObject({ median: 3, n: 1 }); // 06:30Z = 01:30 EST
    for (const hhmm of ["02:00", "02:15", "02:30", "02:45"]) expect(slotAt(g.slots, hhmm).n).toBe(0);
    expect(slotAt(g.slots, "03:00")).toMatchObject({ median: 4, n: 1 }); // 07:00Z = 03:00 EDT
    expect(slotAt(g.slots, "05:00")).toMatchObject({ median: 8, n: 1 });
  });

  it("carries a value across local midnight into the next weekday", () => {
    const g = buildTypical(day("2026-10-28", [["23:30", 7]]), termCalendar, { until: toronto("2026-10-29", "00:30") });
    expect(g.map((x) => x.weekday)).toEqual([3, 4]);
    expect(slotAt(g[1]!.slots, "00:15").median).toBe(7);
  });

  it("returns nothing for no readings", () => {
    expect(buildTypical([])).toEqual([]);
  });
});
