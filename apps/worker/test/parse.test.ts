import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LIVE_FACILITY_ORDER } from "@warriorwatch/contract";
import type { Facility } from "@warriorwatch/contract";
import facilitiesJson from "@warriorwatch/contract/facilities.json";
import { decodeEntities, isStale, parseFacilityPage, parseOccupancy } from "../src/parse";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url)), "utf8");

const FREE_WEIGHTS = "7c59cbfb-ea06-46e0-8ec7-06739ccaec45";
const ESPORTS = "9f0010ea-3844-4c2a-9357-68db5149cda7";
const TS = "2026-10-28T01:55:00.000Z";

describe("parseOccupancy", () => {
  const html = fixture("facility-occupancy-2026-10-27-2155.html");
  const snap = parseOccupancy(html, TS);

  it("finds the 7 cards once each, despite the duplicated mobile layout", () => {
    expect(snap.readings).toHaveLength(7);
    expect(new Set(snap.readings.map((r) => r.facilityId))).toEqual(new Set(LIVE_FACILITY_ORDER));
  });

  it("reads raw headcount and max", () => {
    const byId = new Map(snap.readings.map((r) => [r.facilityId, r]));
    expect(byId.get(FREE_WEIGHTS)).toEqual({ facilityId: FREE_WEIGHTS, ts: TS, count: 42, max: 75 });
    expect(byId.get(ESPORTS)).toMatchObject({ count: 0, max: 20 });
  });

  it("is not stale when both results-not-live elements are hidden", () => {
    expect(snap.stale).toBe(false);
    expect(snap.ts).toBe(TS);
  });

  it("detects the stale banner when it is un-hidden", () => {
    const staleHtml = html.replace(
      '<div class="results-not-live live-occupancy-mode" hidden="hidden">',
      '<div class="results-not-live live-occupancy-mode">',
    );
    expect(staleHtml).not.toBe(html);
    expect(isStale(staleHtml)).toBe(true);
  });

  it("returns no readings for a page without cards", () => {
    expect(parseOccupancy("<html><body>Maintenance</body></html>", TS).readings).toEqual([]);
  });

  it("skips a card whose count is not a number", () => {
    const broken = html.replace(/data-occupancy="42"/, 'data-occupancy=""');
    expect(parseOccupancy(broken, TS).readings).toHaveLength(6);
  });
});

describe("parseFacilityPage", () => {
  const facility = parseFacilityPage(fixture("get-facility-pac-free-weights.html"), FREE_WEIGHTS);

  it("reads 7 weekday hours and max occupancy", () => {
    expect(facility).not.toBeNull();
    expect(Object.keys(facility!.hours)).toHaveLength(7);
    expect(facility!.hours.Monday).toBe("6:00 AM - 11:59 PM");
    expect(facility!.hours.Sunday).toBe("9:00 AM - 11:59 PM");
    expect(facility!.maxOccupancy).toBe(75);
  });

  it("matches the recon registry entry exactly", () => {
    const expected = (facilitiesJson as Facility[]).find((f) => f.id === FREE_WEIGHTS);
    expect(facility).toEqual(expected);
  });

  it("treats the portal's Max Occupancy 0 (no cap) as null", () => {
    const uncapped = fixture("get-facility-pac-free-weights.html").replace(/(<strong>Max Occupancy:<\/strong>\s*)75/, "$10");
    expect(parseFacilityPage(uncapped, FREE_WEIGHTS)!.maxOccupancy).toBeNull();
  });

  it("rejects a page that is not a facility page", () => {
    expect(parseFacilityPage(fixture("facility-occupancy-2026-10-27-2155.html"), FREE_WEIGHTS)).toBeNull();
  });
});

describe("decodeEntities", () => {
  it("handles named and numeric entities", () => {
    expect(decodeEntities("Esports &amp; Gaming Lounge - PC&#39;s &gt; x&#x21;")).toBe("Esports & Gaming Lounge - PC's > x!");
  });
});
