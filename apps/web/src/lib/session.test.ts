import { describe, expect, it } from "vitest";
import type { TypicalSlot } from "@warriorwatch/contract";
import { bestOrder, bestStarts, decodeBlocks, decodeTime, encodeBlocks, encodeTime, expectedAt, move, scoreSession, type RoomInfo } from "./session";

const HOURS = { Monday: "6:00 AM - 11:59 PM", Tuesday: "6:00 AM - 11:59 PM", Wednesday: "6:00 AM - 11:59 PM", Thursday: "6:00 AM - 11:59 PM" };
const YMD = "2026-10-28"; // a Wednesday

/** median = a + b·slot, so rooms can be made to rise or fall through the day */
function slots(fn: (minute: number) => number | null): TypicalSlot[] {
  return Array.from({ length: 96 }, (_, i) => {
    const m = i * 15;
    const v = fn(m);
    return { minute: m, median: v, p25: v, p75: v, n: v == null ? 0 : 5 };
  });
}

const rising: RoomInfo = { slug: "a", max: 100, hours: HOURS, slots: slots((m) => m / 20) }; // 0 → 72
const falling: RoomInfo = { slug: "b", max: 100, hours: HOURS, slots: slots((m) => 72 - m / 20) };
const rooms = new Map([
  ["a", rising],
  ["b", falling],
]);

describe("expectedAt", () => {
  it("interpolates between slot centres", () => {
    expect(expectedAt(rising.slots, 7.5)).toBeCloseTo(0, 2); // slot 0 centre
    expect(expectedAt(rising.slots, 15)).toBeCloseTo(0.375, 2);
    expect(expectedAt(rising.slots, 600)).toBeCloseTo(29.6, 0);
  });
  it("returns null without data", () => {
    expect(expectedAt(slots(() => null), 600)).toBeNull();
    expect(expectedAt([], 600)).toBeNull();
  });
});

describe("scoreSession", () => {
  it("lays blocks back to back and scores each against its room", () => {
    const s = scoreSession([{ slug: "a", minutes: 30 }, { slug: "b", minutes: 30 }], 18 * 60, rooms, YMD);
    expect(s.segments.map((x) => [x.from, x.to])).toEqual([[1080, 1110], [1110, 1140]]);
    expect(s.segments[0]!.expected).toBe(54); // rising room, samples 18:00–18:25
    expect(s.segments[1]!.expected).toBe(16); // falling room at ~18:45
    expect(s.feasible).toBe(true);
    expect(s.totalMinutes).toBe(60);
    expect(s.avgPct).toBe(35);
    expect(s.worstPct).toBe(54);
  });
  it("marks blocks outside hours as infeasible", () => {
    const s = scoreSession([{ slug: "a", minutes: 60 }], 23 * 60 + 30, rooms, YMD);
    expect(s.feasible).toBe(false);
    expect(s.segments[0]!.open).toBe(false);
  });
  it("handles unknown rooms", () => {
    const s = scoreSession([{ slug: "zz", minutes: 30 }], 600, rooms, YMD);
    expect(s.feasible).toBe(false);
    expect(s.avgPct).toBeNull();
  });
});

describe("bestOrder", () => {
  it("puts the falling room first when starting in the morning (it is busiest early)", () => {
    // At 8 AM: a is quiet (24) and getting busier, b is busy (48) and emptying.
    // Doing b first costs more now; doing a first means b is quieter by the time we get there.
    const r = bestOrder([{ slug: "b", minutes: 60 }, { slug: "a", minutes: 60 }], 8 * 60, rooms, YMD);
    expect(r.blocks.map((b) => b.slug)).toEqual(["a", "b"]);
    expect(r.score.avgPct!).toBeLessThanOrEqual(scoreSession([{ slug: "b", minutes: 60 }, { slug: "a", minutes: 60 }], 8 * 60, rooms, YMD).avgPct!);
  });
  it("keeps a single block", () => {
    const r = bestOrder([{ slug: "a", minutes: 30 }], 600, rooms, YMD);
    expect(r.blocks).toHaveLength(1);
  });
});

describe("bestStarts", () => {
  it("prefers the quietest feasible start and spaces suggestions apart", () => {
    const opts = bestStarts([{ slug: "a", minutes: 60 }], rooms, YMD, { from: 6 * 60, to: 22 * 60 }, 3);
    expect(opts[0]!.startMin).toBe(6 * 60); // rising room: earliest is quietest
    expect(opts).toHaveLength(3);
    expect(opts[1]!.startMin - opts[0]!.startMin).toBeGreaterThanOrEqual(45);
    expect(opts.every((o) => o.score.feasible)).toBe(true);
  });
});

describe("codec", () => {
  it("round-trips blocks and times", () => {
    const b = [{ slug: "a", minutes: 30 }, { slug: "b", minutes: 45 }];
    expect(decodeBlocks(encodeBlocks(b), new Set(["a", "b"]))).toEqual(b);
    expect(decodeBlocks("zz:30,a:9999,a:30", new Set(["a"]))).toEqual([{ slug: "a", minutes: 30 }]);
    expect(decodeTime(encodeTime(18 * 60 + 15))).toBe(18 * 60 + 15);
    expect(decodeTime("25:00")).toBeNull();
  });
});

describe("move", () => {
  it("reorders without mutating", () => {
    const a = [1, 2, 3, 4];
    expect(move(a, 0, 2)).toEqual([2, 3, 1, 4]);
    expect(move(a, 3, 0)).toEqual([4, 1, 2, 3]);
    expect(a).toEqual([1, 2, 3, 4]);
  });
});
