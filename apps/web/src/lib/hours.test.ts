import { describe, expect, it } from "vitest";
import facilities from "@warriorwatch/contract/facilities.json";
import type { Facility } from "@warriorwatch/contract";
import { formatCountdown, isOpenAt, openStatus, parseRange } from "./hours";
import { zonedToUtc } from "./time";

describe("parseRange", () => {
  it("parses every variant in facilities.json", () => {
    for (const f of facilities as Facility[]) {
      for (const v of Object.values(f.hours)) {
        if (v === "Closed") expect(parseRange(v)).toBeNull();
        else expect(parseRange(v), v).not.toBeNull();
      }
    }
  });
  it("handles the meridiem-less starts", () => {
    expect(parseRange("12:00 - 10:00 PM")).toEqual({ open: 720, close: 1320 });
    expect(parseRange("6:00 - 12:30 AM")).toEqual({ open: 360, close: 1470 });
    expect(parseRange("6:00 AM - 11:59 PM")).toEqual({ open: 360, close: 1440 });
    expect(parseRange("12:00 AM - 11:59 PM")).toEqual({ open: 0, close: 1440 });
  });
});

describe("isOpenAt", () => {
  const late = { Monday: "6:00 - 12:30 AM", Tuesday: "Closed" };
  it("carries past-midnight ranges into the next day", () => {
    expect(isOpenAt(late, zonedToUtc("2026-10-27", 15))).toBe(true); // Tue 00:15
    expect(isOpenAt(late, zonedToUtc("2026-10-27", 45))).toBe(false);
  });
  it("reports the next opening", () => {
    const esports = { Monday: "12:00 - 10:00 PM", Tuesday: "12:00 - 10:00 PM" };
    const st = openStatus(esports, zonedToUtc("2026-10-26", 9 * 60));
    expect(st).toMatchObject({ open: false, text: "Opens 12 PM", inText: "in 3 h", whenText: "Today 12 PM" });
    expect(st.at).toBe(zonedToUtc("2026-10-26", 12 * 60).getTime());
    const tm = openStatus(esports, zonedToUtc("2026-10-26", 23 * 60));
    expect(tm.text).toBe("Opens 12 PM tomorrow");
    expect(tm.whenText).toBe("Tomorrow 12 PM");
    expect(tm.inText).toBe("in 13 h");
    const op = openStatus(esports, zonedToUtc("2026-10-26", 13 * 60));
    expect(op.text).toBe("Closes 10 PM");
    expect(op.inText).toBe("in 9 h");
  });
});

describe("formatCountdown", () => {
  it("reads naturally", () => {
    expect(formatCountdown(20_000)).toBe("now");
    expect(formatCountdown(45 * 60_000)).toBe("in 45 min");
    expect(formatCountdown((3 * 60 + 20) * 60_000)).toBe("in 3 h 20 min");
    expect(formatCountdown(26 * 3_600_000)).toBe("in 1 day");
  });
});
