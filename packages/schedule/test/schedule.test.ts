import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appointmentsUrl, classifyKind, expandAppointments, fetchFacilityEvents, localToUtc,
  type RawAppointment,
} from "../src/index.js";
import { parseRule, occurrences } from "../src/recurrence.js";

const FIX = new URL("../../../fixtures/", import.meta.url);
const load = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, FIX), "utf8")) as T;

const PAC_MAIN = "a3e9c00d-5aa7-45ea-ad73-f62c293856a8";
const tor = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  new Date(localToUtc({ y, mo, d, h, mi, s: 0 }));

// Formats with Intl only, so the check is independent of src/time.ts.
const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "short", day: "numeric" });
const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" });
const render = (e: { title: string; start: string; end: string }) => {
  const parts = day.formatToParts(new Date(e.start));
  const wd = parts.find((p) => p.type === "weekday")!.value;
  const dd = parts.find((p) => p.type === "day")!.value;
  const t = (iso: string) => clock.format(new Date(iso)).replace(/\u202f/g, " ");
  return `${wd} ${dd} | ${e.title} ${t(e.start)} - ${t(e.end)}`;
};

describe("expandAppointments vs the live DevExtreme scheduler (DST week)", () => {
  const raw = load<RawAppointment[]>("schedule-appointments-pac-main-gym-2026-11-01.json");
  const truth = load<{ rows: string[] }>("schedule-rendered-pac-main-gym-2026-11-01.json").rows;
  const from = tor(2026, 11, 1);
  const to = tor(2026, 11, 8);
  const events = expandAppointments(raw, PAC_MAIN, from, to);

  it("produces exactly the occurrences the browser rendered", () => {
    // The scheduler lists an appointment in the column where it starts; we also
    // keep ones that started before the window and overlap it, so compare starts in-window.
    const inWindow = events.filter((e) => new Date(e.start) >= from);
    expect(inWindow.map(render).sort()).toEqual([...truth].sort());
  });

  it("keeps wall-clock times across the 2026-11-01 DST change", () => {
    const closed = events.filter((e) => e.title === "Building Closed");
    expect(closed[0]).toMatchObject({ start: "2026-11-01T04:30:00.000Z", end: "2026-11-01T14:00:00.000Z" }); // 00:30 EDT → 09:00 EST
    expect(closed[1]).toMatchObject({ start: "2026-11-02T05:30:00.000Z", end: "2026-11-02T11:00:00.000Z" }); // 00:30 → 06:00 EST
  });

  it("returns UTC ISO strings and contract-shaped events", () => {
    for (const e of events) {
      expect(e.facilityId).toBe(PAC_MAIN);
      expect(e.start).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/);
      expect(e.end > e.start).toBe(true);
    }
  });
});

describe("expandAppointments on the 2026-10-25 week", () => {
  const raw = load<RawAppointment[]>("schedule-appointments-pac-main-gym-2026-10-25.json");
  const wed = expandAppointments(raw, PAC_MAIN, tor(2026, 10, 28), tor(2026, 10, 29));

  it("honours RecurrenceException (IM Vball skipped on Wed 28 Oct)", () => {
    expect(wed.find((e) => e.title === "IM Vball")).toBeUndefined();
  });

  it("finds open rec and varsity blocks on Wed 28 Oct", () => {
    expect(wed.map((e) => [e.kind, e.start, e.end])).toEqual([
      ["Closed", "2026-10-28T04:30:00.000Z", "2026-10-28T10:00:00.000Z"],
      ["Varsity", "2026-10-28T11:00:00.000Z", "2026-10-28T13:00:00.000Z"],
      ["Open Rec", "2026-10-28T13:30:00.000Z", "2026-10-28T19:30:00.000Z"],
      ["Varsity", "2026-10-28T20:00:00.000Z", "2026-10-28T22:00:00.000Z"],
      ["Varsity", "2026-10-28T22:00:00.000Z", "2026-10-29T00:30:00.000Z"],
    ]);
  });

  it("does not leak the server's far-future rows into a short window", () => {
    expect(wed.every((e) => e.start < "2026-10-29T04:00:00.000Z")).toBe(true);
  });
});

describe("recurrence", () => {
  it("handles INTERVAL=2 weekly and COUNT", () => {
    const r = parseRule("FREQ=WEEKLY;INTERVAL=2;COUNT=3;BYDAY=MO,WE;WKST=SU");
    const occ = occurrences({ y: 2026, mo: 10, d: 26, h: 9, mi: 0, s: 0 }, r, Date.UTC(2027, 0, 1));
    expect(occ.map((o) => `${o.mo}-${o.d}`)).toEqual(["10-26", "10-28", "11-9"]);
  });

  it("stops at UTC UNTIL", () => {
    const r = parseRule("FREQ=DAILY;UNTIL=20261030T130000Z");
    const occ = occurrences({ y: 2026, mo: 10, d: 28, h: 9, mi: 0, s: 0 }, r, Date.UTC(2027, 0, 1));
    expect(occ.map((o) => o.d)).toEqual([28, 29, 30]); // 09:00 EDT = 13:00Z, inclusive
  });

  it("rejects rule parts it does not understand", () => {
    expect(() => parseRule("FREQ=MONTHLY;BYMONTHDAY=1")).toThrow(/FREQ/);
    expect(() => parseRule("FREQ=WEEKLY;BYDAY=1MO")).toThrow(/BYDAY/);
  });
});

describe("classifyKind", () => {
  it.each([
    ["Building Closed", "Closed"],
    ["Pool Vacuuming", "Closed"],
    ["Final Examinations", "Closed"],
    ["Fall 2026 - Open Rec Basketball - Open Rec Basketball", "Open Rec"],
    ["Fall 2026 - Swimming - Fitness and Rec - Fitness and Rec Swim", "Open Rec"],
    ["Fall 2026 - Swimming - Family Rec - Family Rec Swim", "Open Rec"],
    ["Fall 2026 - Esports Programming - Drop-Ins (All devices)", "Open Rec"],
    ["Fall 2026 - PAC Fitness Centre Hours - PAC Fitness Centre", "Open Rec"],
    ["Hatha Yoga", "Booking"],
    ["Fall 2026 - IU Men's Basketball - IU Men's Basketball", "Varsity"],
    ["vs Nipissing", "Varsity"],
    ["Game Day Set Up", "Varsity"],
    ["IM Vball", "Intramural"],
    ["Complete | Lucky Duckies vs Teletubies", "Intramural"],
    ["Big Tuna vs Wavy Warriors", "Intramural"],
    ["Fall 2026 - Underwater Hockey Club - Underwater Hockey Club", "Booking"],
    ["HOLD - Robotics", "Booking"],
  ])("%s → %s", (title, kind) => expect(classifyKind(title)).toBe(kind));
});

describe("fetch", () => {
  it("builds the browser's query in Toronto wall clock", () => {
    const u = new URL(appointmentsUrl(PAC_MAIN, tor(2026, 10, 25), tor(2026, 10, 31, 23, 59)));
    expect(u.pathname).toBe("/Facility/GetScheduleCustomAppointmentsForDevExtremeScheduler");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      selectedFacilityId: PAC_MAIN, start: "2026-10-25T00:00:00", end: "2026-10-31T23:59:00",
    });
  });

  it("sends the WarriorWatch User-Agent and expands the reply", async () => {
    const raw = load<RawAppointment[]>("schedule-appointments-pac-main-gym-2026-10-25.json");
    let ua: string | null = null;
    const fake = (async (_url: string, init?: RequestInit) => {
      ua = new Headers(init?.headers).get("user-agent");
      return new Response(JSON.stringify(raw), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const ev = await fetchFacilityEvents(PAC_MAIN, tor(2026, 10, 28), tor(2026, 10, 29), { fetch: fake });
    expect(ua).toMatch(/^WarriorWatch\//);
    expect(ev).toHaveLength(5);
  });

  it("throws on HTTP errors", async () => {
    const fake = (async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchFacilityEvents(PAC_MAIN, new Date(), new Date(), { fetch: fake })).rejects.toThrow(/503/);
  });
});
