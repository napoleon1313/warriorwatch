import { busyLabel, type BusyLabel, type FacilityHours, type TypicalSlot } from "@warriorwatch/contract";
import { isOpenAt } from "./hours";
import { zonedToUtc } from "./time";

/**
 * Workout session planning: a list of blocks (room + minutes) done back to
 * back from a start time. We score each block against that room's usual
 * curve for the day, so you can see whether "free weights then cardio" beats
 * "cardio then free weights" at 6 PM, and when the whole session is quietest.
 * Pure functions; the UI and tests both use them.
 */
export interface Block {
  slug: string;
  minutes: number;
}

export interface RoomInfo {
  slug: string;
  max: number;
  hours: FacilityHours;
  /** 96 × 15-min typical slots for the chosen weekday; medians may be null */
  slots: TypicalSlot[];
}

export interface Segment {
  slug: string;
  /** minutes of local day */
  from: number;
  to: number;
  expected: number | null;
  pct: number | null;
  label: BusyLabel;
  open: boolean;
}

export interface SessionScore {
  segments: Segment[];
  /** mean share of capacity across the session, 0..100; null if no data */
  avgPct: number | null;
  worstPct: number | null;
  /** every block falls within its room's hours */
  feasible: boolean;
  totalMinutes: number;
}

export const DURATIONS = [15, 30, 45, 60, 90] as const;
export const MAX_BLOCKS = 7;
export const STEP = 15;

/** Linear interpolation of the typical median at a minute of day (slots are 15-min, value at slot centre). */
export function expectedAt(slots: TypicalSlot[], minute: number): number | null {
  if (slots.length === 0) return null;
  const m = ((minute % 1440) + 1440) % 1440;
  const i = Math.floor(m / 15);
  const a = slots[i];
  const b = slots[(i + 1) % slots.length];
  if (!a || a.median == null) return null;
  if (!b || b.median == null) return a.median;
  const t = (m - (i * 15 + 7.5)) / 15;
  if (t <= 0) {
    const p = slots[(i + slots.length - 1) % slots.length];
    if (!p || p.median == null) return a.median;
    return p.median + (a.median - p.median) * (t + 1);
  }
  return a.median + (b.median - a.median) * t;
}

export function scoreSession(blocks: Block[], startMin: number, rooms: Map<string, RoomInfo>, ymd: string): SessionScore {
  const segments: Segment[] = [];
  let cursor = startMin;
  let sum = 0;
  let n = 0;
  let worst: number | null = null;
  let feasible = true;
  for (const b of blocks) {
    const room = rooms.get(b.slug);
    const from = cursor;
    const to = cursor + b.minutes;
    cursor = to;
    if (!room) {
      segments.push({ slug: b.slug, from, to, expected: null, pct: null, label: "closed", open: false });
      feasible = false;
      continue;
    }
    // sample every 5 min
    let s = 0;
    let k = 0;
    let open = true;
    for (let m = from; m < to; m += 5) {
      const at = zonedToUtc(ymd, m).getTime();
      if (!isOpenAt(room.hours, at)) open = false;
      const e = expectedAt(room.slots, m);
      if (e != null) {
        s += e;
        k++;
      }
    }
    const expected = k ? s / k : null;
    const pct = expected != null && room.max ? (expected / room.max) * 100 : null;
    if (!open) feasible = false;
    if (pct != null) {
      sum += pct;
      n++;
      worst = worst == null ? pct : Math.max(worst, pct);
    }
    segments.push({
      slug: b.slug,
      from,
      to,
      expected: expected == null ? null : Math.round(expected),
      pct: pct == null ? null : Math.round(pct),
      label: expected == null ? (open ? "quiet" : "closed") : busyLabel(expected, room.max, open),
      open,
    });
  }
  return {
    segments,
    avgPct: n ? Math.round(sum / n) : null,
    worstPct: worst == null ? null : Math.round(worst),
    feasible,
    totalMinutes: blocks.reduce((a, b) => a + b.minutes, 0),
  };
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  items.forEach((x, i) => {
    for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}

/** The order of the same blocks with the lowest average share of capacity. Ties keep the current order. */
export function bestOrder(blocks: Block[], startMin: number, rooms: Map<string, RoomInfo>, ymd: string): { blocks: Block[]; score: SessionScore } {
  const current = scoreSession(blocks, startMin, rooms, ymd);
  if (blocks.length < 2 || blocks.length > MAX_BLOCKS) return { blocks, score: current };
  let best = { blocks, score: current };
  const key = (s: SessionScore) => (s.feasible ? 0 : 1000) + (s.avgPct ?? 999) + (s.worstPct ?? 0) * 0.01;
  for (const p of permutations(blocks)) {
    const s = scoreSession(p, startMin, rooms, ymd);
    if (key(s) < key(best.score) - 1e-9) best = { blocks: p, score: s };
  }
  return best;
}

export interface StartOption {
  startMin: number;
  score: SessionScore;
}

/** Candidate start times (15-min grid) within [from, to] ranked quietest first, feasible only. */
export function bestStarts(
  blocks: Block[],
  rooms: Map<string, RoomInfo>,
  ymd: string,
  range: { from: number; to: number },
  limit = 3,
): StartOption[] {
  const out: StartOption[] = [];
  for (let m = Math.ceil(range.from / STEP) * STEP; m <= range.to; m += STEP) {
    const score = scoreSession(blocks, m, rooms, ymd);
    if (!score.feasible || score.avgPct == null) continue;
    out.push({ startMin: m, score });
  }
  out.sort((a, b) => a.score.avgPct! - b.score.avgPct! || a.startMin - b.startMin);
  // de-duplicate starts closer than 45 min to each other
  const picked: StartOption[] = [];
  for (const o of out) {
    if (picked.every((p) => Math.abs(p.startMin - o.startMin) >= 45)) picked.push(o);
    if (picked.length >= limit) break;
  }
  return picked;
}

/** URL codec: b=pac-free-weights:30,pac-cardio:30&t=18:00&d=2026-10-29 */
export function encodeBlocks(blocks: Block[]): string {
  return blocks.map((b) => `${b.slug}:${b.minutes}`).join(",");
}
export function decodeBlocks(s: string | null, valid: Set<string>): Block[] {
  if (!s) return [];
  const out: Block[] = [];
  for (const part of s.split(",")) {
    const [slug, m] = part.split(":");
    const minutes = Number(m);
    if (slug && valid.has(slug) && Number.isFinite(minutes) && minutes >= 5 && minutes <= 240) out.push({ slug, minutes: Math.round(minutes / 5) * 5 });
    if (out.length >= MAX_BLOCKS) break;
  }
  return out;
}
export function encodeTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
export function decodeTime(s: string | null): number | null {
  const m = s?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v < 1440 ? v : null;
}

/** Move item `from` to `to` (both indexes), returning a new array. */
export function move<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = arr.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x as T);
  return next;
}
