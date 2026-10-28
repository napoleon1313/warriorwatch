import { describe, expect, it } from "vitest";
import { localParts, zonedToUtc, relativeAgo, formatMinute } from "./time";

describe("time helpers", () => {
  it("round-trips Toronto wall time across DST", () => {
    expect(zonedToUtc("2026-10-28", 0).toISOString()).toBe("2026-10-28T04:00:00.000Z");
    expect(zonedToUtc("2026-11-02", 0).toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(localParts("2026-10-28T02:00:00Z")).toMatchObject({ ymd: "2026-10-27", weekday: 2, hour: 22 });
  });
  it("formats", () => {
    expect(formatMinute(1440)).toBe("midnight");
    expect(formatMinute(750)).toBe("12:30 PM");
    expect(relativeAgo("2026-10-28T00:00:00Z", Date.parse("2026-10-28T00:04:10Z"))).toBe("4 min ago");
  });
});
