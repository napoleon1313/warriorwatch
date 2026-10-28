import type { TermBucket } from "@warriorwatch/contract";
import exported from "@warriorwatch/analytics/term-calendar.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { termBucketFor, termCalendar, type TermCalendar } from "../src/index.ts";

const BUCKETS: TermBucket[] = ["term", "reading-week", "exams", "break", "holiday"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("termBucketFor", () => {
  it.each([
    ["2025-09-01", "holiday"], // Labour Day, before classes
    ["2025-09-02", "break"],
    ["2025-09-03", "term"], // Fall 2025 classes begin
    ["2025-10-13", "holiday"], // Thanksgiving inside Reading Week
    ["2025-10-15", "reading-week"],
    ["2025-11-02", "term"], // DST day
    ["2025-12-03", "exams"], // study day
    ["2025-12-19", "exams"], // last emergency day
    ["2025-12-22", "break"],
    ["2025-12-25", "holiday"], // winter closure
    ["2026-01-02", "holiday"],
    ["2026-01-04", "break"],
    ["2026-02-16", "holiday"], // Family Day
    ["2026-02-20", "reading-week"],
    ["2026-03-08", "term"], // DST day
    ["2026-04-03", "holiday"], // Good Friday
    ["2026-04-10", "exams"],
    ["2026-05-18", "holiday"], // Victoria Day
    ["2026-07-01", "holiday"],
    ["2026-08-31", "break"],
    ["2026-10-14", "reading-week"],
    ["2026-10-28", "term"],
    ["2026-12-09", "exams"],
    ["2026-12-31", "holiday"],
    ["2027-01-03", "holiday"],
    ["2027-01-05", "break"], // Winter 2027 classes start Jan 11
    ["2027-03-26", "holiday"],
    ["2027-04-30", "exams"],
    ["2027-07-02", "holiday"],
    ["2027-06-15", "term"],
    ["2028-01-15", "break"], // beyond the data
  ] as const)("%s is %s", (date, bucket) => {
    expect(termBucketFor(date, termCalendar)).toBe(bucket);
  });

  it("converts instants to the Toronto date first", () => {
    // 2026-10-12 03:30Z is still Oct 11 in Toronto (Reading Week), 04:30Z is Thanksgiving
    expect(termBucketFor(new Date("2026-10-12T03:30:00Z"), termCalendar)).toBe("reading-week");
    expect(termBucketFor(new Date("2026-10-12T04:30:00Z"))).toBe("holiday");
    expect(termBucketFor("2026-10-28T15:00:00Z")).toBe("term");
  });

  it("defaults to break with an empty calendar", () => {
    const empty: TermCalendar = { terms: [], ranges: [] };
    expect(termBucketFor("2026-10-28", empty)).toBe("break");
  });
});

describe("term-calendar.json", () => {
  it("is exported from the package and is well formed", () => {
    expect(exported).toEqual(termCalendar);
    expect(termCalendar.source?.[0]).toBe("https://uwaterloo.ca/registrar/important-dates");
    for (const r of termCalendar.ranges) {
      expect(r.from).toMatch(DATE);
      expect(r.to).toMatch(DATE);
      expect(r.from <= r.to).toBe(true);
      expect(BUCKETS).toContain(r.bucket);
      expect(r.label.length).toBeGreaterThan(0);
    }
  });

  it("covers Fall 2025 through Winter 2027 with reading weeks and exams inside their terms", () => {
    const names = termCalendar.terms.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["Fall 2025", "Winter 2026", "Spring 2026", "Fall 2026", "Winter 2027"]));
    for (const r of termCalendar.ranges.filter((x) => x.bucket === "reading-week" || x.bucket === "exams")) {
      const term = termCalendar.terms.find((t) => r.from >= t.from && r.to <= t.to);
      expect(term, r.label).toBeDefined();
    }
    for (const t of termCalendar.terms) {
      expect(termCalendar.ranges.some((r) => r.bucket === "exams" && r.to === t.to)).toBe(true);
    }
  });
});
