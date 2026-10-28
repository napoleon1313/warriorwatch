import type { FacilityHours, Reading, TypicalSlot } from "@warriorwatch/contract";
import { zonedTimeToUtc } from "../src/time.ts";

export const PAC_FREE_WEIGHTS = "7c59cbfb-ea06-46e0-8ec7-06739ccaec45";
export const CIF = "b2d98ff8-e37a-42da-bf72-06b259ff1a2c";

/** UTC ISO for a Toronto wall time, e.g. toronto("2026-10-28", "09:40"). */
export function toronto(dateKey: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return zonedTimeToUtc(dateKey, h * 60 + m).toISOString();
}

export function reading(ts: string, count: number, facilityId = PAC_FREE_WEIGHTS, max = 75): Reading {
  return { facilityId, ts, count, max };
}

/** Change-only series for one local day: [["09:00", 10], ["09:40", 20], ...]. */
export function day(dateKey: string, points: [string, number][], facilityId = PAC_FREE_WEIGHTS): Reading[] {
  return points.map(([hhmm, count]) => reading(toronto(dateKey, hhmm), count, facilityId));
}

/** A 96-slot typical curve where `median(minute)` decides each slot. */
export function curve(median: (minute: number) => number | null): TypicalSlot[] {
  return Array.from({ length: 96 }, (_, i) => {
    const m = median(i * 15);
    return { minute: i * 15, median: m, p25: m, p75: m, n: m === null ? 0 : 10 };
  });
}

export const slotAt = (slots: TypicalSlot[], hhmm: string): TypicalSlot => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return slots.find((s) => s.minute === h * 60 + m) as TypicalSlot;
};

/** CIF / PAC gym hours from facilities.json: Sunday and Saturday open at 9 AM. */
export const GYM_HOURS: FacilityHours = {
  Sunday: "9:00 AM - 11:59 PM",
  Monday: "6:00 AM - 11:59 PM",
  Tuesday: "6:00 AM - 11:59 PM",
  Wednesday: "6:00 AM - 11:59 PM",
  Thursday: "6:00 AM - 11:59 PM",
  Friday: "6:00 AM - 11:59 PM",
  Saturday: "9:00 AM - 11:59 PM",
};

/** PAC Pool hours from facilities.json: weekdays close at 00:30 the next day. */
export const POOL_HOURS: FacilityHours = {
  Sunday: "9:00 AM - 11:59 PM",
  Monday: "6:00 - 12:30 AM",
  Tuesday: "6:00 - 12:30 AM",
  Wednesday: "6:00 - 12:30 AM",
  Thursday: "6:00 - 12:30 AM",
  Friday: "6:00 - 12:30 AM",
  Saturday: "9:00 AM - 11:59 PM",
};

/** Esports lounge hours from facilities.json. */
export const ESPORTS_HOURS: FacilityHours = {
  Sunday: "Closed",
  Monday: "12:00 - 10:00 PM",
  Tuesday: "12:00 - 10:00 PM",
  Wednesday: "12:00 - 10:00 PM",
  Thursday: "12:00 - 10:00 PM",
  Friday: "12:00 - 7:00 PM",
  Saturday: "Closed",
};

export const ALL_DAY: FacilityHours = Object.fromEntries(
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => [d, "12:00 AM - 11:59 PM"]),
);
