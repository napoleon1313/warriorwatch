import type { Facility } from "@warriorwatch/contract";
import facilitiesJson from "@warriorwatch/contract/facilities.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { DAY_NAMES, isOpen, parseHours } from "../src/index.ts";
import { ALL_DAY, ESPORTS_HOURS, GYM_HOURS, POOL_HOURS, toronto } from "./helpers.ts";

const facilities = facilitiesJson as Facility[];

describe("parseHours", () => {
  it.each([
    ["6:00 AM - 11:59 PM", 360, 1440],
    ["9:30 AM - 6:30 PM", 570, 1110],
    ["12:00 AM - 11:59 PM", 0, 1440],
    ["12:00 - 10:00 PM", 720, 1320], // collapsed PM: noon to 10 PM
    ["12:00 - 7:00 PM", 720, 1140],
    ["6:00 - 12:30 AM", 360, 1470], // collapsed AM: 6 AM to 00:30 next day
    ["8:30 AM - 10:30 PM", 510, 1350],
    ["10:00 PM - 2:00 AM", 1320, 1560],
  ])("%s", (text, open, close) => {
    expect(parseHours(text)).toEqual({ open, close });
  });

  it("returns null for closed, missing and unknown text", () => {
    expect(parseHours("Closed")).toBeNull();
    expect(parseHours(undefined)).toBeNull();
    expect(parseHours("")).toBeNull();
    expect(parseHours("Noon to late")).toBeNull();
  });

  it("parses every hours string that occurs in facilities.json", () => {
    const seen = new Set<string>();
    for (const f of facilities) for (const d of DAY_NAMES) if (f.hours[d] !== undefined) seen.add(f.hours[d] as string);
    expect(seen.size).toBeGreaterThan(10);
    for (const text of seen) {
      const parsed = parseHours(text);
      if (text === "Closed") {
        expect(parsed).toBeNull();
      } else {
        expect(parsed, text).not.toBeNull();
        expect(parsed!.open).toBeLessThan(parsed!.close);
        expect(parsed!.close).toBeLessThanOrEqual(2 * 1440);
      }
    }
  });
});

describe("isOpen", () => {
  it("keeps a gym closed on Sunday mornings", () => {
    // Sunday 2026-10-25 (EDT)
    expect(isOpen(GYM_HOURS, toronto("2026-10-25", "08:59"))).toBe(false);
    expect(isOpen(GYM_HOURS, toronto("2026-10-25", "09:00"))).toBe(true);
    // Monday opens at 6
    expect(isOpen(GYM_HOURS, toronto("2026-10-26", "06:00"))).toBe(true);
    expect(isOpen(GYM_HOURS, toronto("2026-10-26", "05:59"))).toBe(false);
  });

  it("treats 11:59 PM as open until midnight", () => {
    expect(isOpen(GYM_HOURS, new Date("2026-10-29T03:59:30Z"))).toBe(true); // Wed 23:59:30 EDT
    expect(isOpen(GYM_HOURS, new Date("2026-10-29T04:00:00Z"))).toBe(false); // Thu 00:00
  });

  it("keeps the pool open past midnight on '6:00 - 12:30 AM' days", () => {
    expect(isOpen(POOL_HOURS, toronto("2026-10-26", "06:00"))).toBe(true); // Monday
    expect(isOpen(POOL_HOURS, toronto("2026-10-27", "00:15"))).toBe(true); // Tue, Monday's late close
    expect(isOpen(POOL_HOURS, toronto("2026-10-27", "00:30"))).toBe(false);
    expect(isOpen(POOL_HOURS, toronto("2026-10-26", "00:15"))).toBe(false); // Mon, Sunday closes at midnight
    expect(isOpen(POOL_HOURS, toronto("2026-10-31", "00:15"))).toBe(true); // Sat, Friday's late close
  });

  it("reads '12:00 - 10:00 PM' as noon to 10 PM and honours Closed days", () => {
    expect(isOpen(ESPORTS_HOURS, toronto("2026-10-26", "11:59"))).toBe(false);
    expect(isOpen(ESPORTS_HOURS, toronto("2026-10-26", "12:00"))).toBe(true);
    expect(isOpen(ESPORTS_HOURS, toronto("2026-10-26", "21:59"))).toBe(true);
    expect(isOpen(ESPORTS_HOURS, toronto("2026-10-26", "22:00"))).toBe(false);
    expect(isOpen(ESPORTS_HOURS, toronto("2026-10-30", "19:00"))).toBe(false); // Friday closes at 7
    expect(isOpen(ESPORTS_HOURS, toronto("2026-10-25", "15:00"))).toBe(false); // Sunday
    expect(isOpen({}, toronto("2026-10-26", "15:00"))).toBe(false);
  });

  it("uses the local clock across DST changes", () => {
    // Sunday 2026-03-08: 13:00Z is 09:00 EDT (open); a fixed -5h offset would say 08:00
    expect(isOpen(GYM_HOURS, "2026-03-08T13:00:00Z")).toBe(true);
    expect(isOpen(GYM_HOURS, "2026-03-08T12:59:00Z")).toBe(false);
    // Sunday 2025-11-02: 14:00Z is 09:00 EST (open); 13:30Z is 08:30 EST (closed)
    expect(isOpen(GYM_HOURS, "2025-11-02T14:00:00Z")).toBe(true);
    expect(isOpen(GYM_HOURS, "2025-11-02T13:30:00Z")).toBe(false);
  });

  it("defaults to now and respects another zone", () => {
    expect(isOpen(ALL_DAY)).toBe(true);
    // 2026-10-26 10:30Z is 06:30 in Toronto but 03:30 in Vancouver
    expect(isOpen(GYM_HOURS, "2026-10-26T10:30:00Z")).toBe(true);
    expect(isOpen(GYM_HOURS, "2026-10-26T10:30:00Z", "America/Vancouver")).toBe(false);
  });

  it("agrees with the real facilities in facilities.json", () => {
    const cif = facilities.find((f) => f.name === "CIF Fitness Centre")!;
    const pool = facilities.find((f) => f.name === "PAC Pool")!;
    expect(isOpen(cif.hours, toronto("2026-10-25", "08:30"))).toBe(false);
    expect(isOpen(cif.hours, toronto("2026-10-25", "10:00"))).toBe(true);
    expect(isOpen(pool.hours, toronto("2026-10-28", "00:20"))).toBe(true);
  });
});
