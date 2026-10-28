import { describe, expect, it } from "vitest";
import { localDateKey, localDayBounds, localParts, localSlot, zonedTimeToUtc } from "../src/index.ts";
import { dateKeyFromDayNumber, dayNumber, toDate, tzOffsetMs, weekdayOfDayNumber } from "../src/time.ts";

const HOUR = 3_600_000;

describe("localSlot", () => {
  it("maps a UTC instant to the Toronto weekday and 15-minute slot", () => {
    // 2026-10-28 13:07Z = Wednesday 09:07 EDT
    expect(localSlot("2026-10-28T13:07:00Z")).toEqual({ weekday: 3, minute: 540 });
    // 2026-11-02 03:59Z = Sunday 22:59 EST (the UTC date is Monday)
    expect(localSlot("2026-11-02T03:59:00Z")).toEqual({ weekday: 0, minute: 22 * 60 + 45 });
  });

  it("reports local midnight as minute 0, never hour 24", () => {
    expect(localSlot("2026-10-28T04:00:00Z")).toEqual({ weekday: 3, minute: 0 });
    expect(localParts("2026-10-28T04:00:00Z").hour).toBe(0);
  });

  it("follows the 2025-11-02 fall-back: 01:xx happens twice", () => {
    expect(localSlot("2025-11-02T05:30:00Z")).toEqual({ weekday: 0, minute: 90 }); // 01:30 EDT
    expect(localSlot("2025-11-02T06:30:00Z")).toEqual({ weekday: 0, minute: 90 }); // 01:30 EST
    expect(localSlot("2025-11-02T07:00:00Z")).toEqual({ weekday: 0, minute: 120 }); // 02:00 EST
  });

  it("follows the 2026-03-08 spring-forward: 02:xx never happens", () => {
    expect(localSlot("2026-03-08T06:59:00Z")).toEqual({ weekday: 0, minute: 105 }); // 01:59 EST
    expect(localSlot("2026-03-08T07:00:00Z")).toEqual({ weekday: 0, minute: 180 }); // 03:00 EDT
  });

  it("accepts another zone", () => {
    expect(localSlot("2026-01-01T00:00:00Z", "Asia/Kolkata")).toEqual({ weekday: 4, minute: 330 });
  });
});

describe("offsets and wall time", () => {
  it("knows EDT and EST", () => {
    expect(tzOffsetMs(Date.parse("2026-10-28T12:00:00Z"))).toBe(-4 * HOUR);
    expect(tzOffsetMs(Date.parse("2026-12-01T12:00:00.250Z"))).toBe(-5 * HOUR);
  });

  it("converts wall time to UTC around both DST transitions", () => {
    expect(zonedTimeToUtc("2026-03-08", 60).toISOString()).toBe("2026-03-08T06:00:00.000Z"); // 01:00 EST
    expect(zonedTimeToUtc("2026-03-08", 5 * 60).toISOString()).toBe("2026-03-08T09:00:00.000Z"); // 05:00 EDT
    // 02:30 does not exist; pushed forward by the gap to 03:30 EDT
    expect(zonedTimeToUtc("2026-03-08", 150).toISOString()).toBe("2026-03-08T07:30:00.000Z");
    // 01:30 on fall-back day is ambiguous; first occurrence (EDT)
    expect(zonedTimeToUtc("2025-11-02", 90).toISOString()).toBe("2025-11-02T05:30:00.000Z");
    expect(zonedTimeToUtc("2025-11-02", 3 * 60).toISOString()).toBe("2025-11-02T08:00:00.000Z"); // 03:00 EST
  });

  it("gives 23-, 24- and 25-hour local days", () => {
    const len = (k: string) => {
      const { start, end } = localDayBounds(k);
      return (end.getTime() - start.getTime()) / HOUR;
    };
    expect(len("2026-03-08")).toBe(23);
    expect(len("2025-11-02")).toBe(25);
    expect(len("2026-10-28")).toBe(24);
    expect(localDayBounds("2026-03-08").start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });

  it("formats local date keys", () => {
    expect(localDateKey(new Date("2026-10-28T03:59:00Z"))).toBe("2026-10-27");
    expect(localDateKey("2026-10-28T04:00:00Z")).toBe("2026-10-28");
  });

  it("does day-number arithmetic", () => {
    expect(dayNumber("1970-01-02")).toBe(1);
    expect(dateKeyFromDayNumber(dayNumber("2026-02-28") + 1)).toBe("2026-03-01");
    expect(weekdayOfDayNumber(dayNumber("2026-10-28"))).toBe(3);
    expect(weekdayOfDayNumber(-1)).toBe(3); // 1969-12-31 was a Wednesday
  });

  it("rejects bad input", () => {
    expect(() => toDate("not a date")).toThrow(RangeError);
    expect(() => dayNumber("2026/10/28")).toThrow(RangeError);
  });
});
