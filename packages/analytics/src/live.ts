import type { BestResponse, Reading, TypicalSlot } from "@warriorwatch/contract";
import { toDate } from "./time.ts";

export type Verdict = "quieter" | "usual" | "busier";

/**
 * Current count against the typical slot. The "usual" band is
 * ±max(2 people, half the interquartile range) around the median.
 * With no typical median yet, delta is null and the verdict is "usual".
 */
export function nowVsTypical(count: number, slot: TypicalSlot | null | undefined): { delta: number | null; verdict: Verdict } {
  if (!slot || slot.median === null) return { delta: null, verdict: "usual" };
  const delta = Math.round((count - slot.median) * 10) / 10;
  const iqr = slot.p25 !== null && slot.p75 !== null ? slot.p75 - slot.p25 : 0;
  const threshold = Math.max(2, 0.5 * iqr);
  if (delta > threshold) return { delta, verdict: "busier" };
  if (delta < -threshold) return { delta, verdict: "quieter" };
  return { delta, verdict: "usual" };
}

/**
 * Least-squares slope of count over time, in people per 10 minutes, rounded to
 * 0.1. Pass the last 20 minutes of readings for one facility (any order).
 * Null with fewer than 3 readings or when they all share one timestamp.
 */
export function trend(last20min: readonly Reading[]): number | null {
  if (last20min.length < 3) return null;
  const pts = last20min.map((r) => ({ x: toDate(r.ts).getTime() / 60_000, y: r.count }));
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
  }
  if (sxx === 0) return null;
  return Math.round((sxy / sxx) * 10 * 10) / 10 + 0;
}

/** How much to trust a typical curve built from `daysOfData` days: <7 low, <28 medium, else high. */
export function confidence(daysOfData: number): BestResponse["confidence"] {
  if (daysOfData < 7) return "low";
  if (daysOfData < 28) return "medium";
  return "high";
}
