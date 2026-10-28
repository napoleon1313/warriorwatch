import type { LiveFacility } from "@warriorwatch/contract";
import { formatMinute, localParts } from "@/lib/time";

const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Tue 6:30 PM": the 15-min typical slot the comparison is against. */
export function slotName(iso: string): string {
  const lp = localParts(iso);
  return `${SHORT[lp.weekday]} ${formatMinute(Math.floor(lp.minuteOfDay / 15) * 15)}`;
}

/**
 * Plain-English "vs usual". The contract only gives the signed delta (no IQR or
 * verdict), so we state the number rather than judge "busier than usual".
 */
export function vsUsual(f: LiveFacility, fetchedAt: string): { sign: string; rest: string } | null {
  if (!f.open) return null;
  if (f.delta == null || f.typical == null) return { sign: "", rest: "Not enough history for a usual yet" };
  const slot = slotName(fetchedAt);
  if (f.delta === 0) return { sign: "", rest: `Same as a usual ${slot}` };
  const n = Math.abs(f.delta);
  return { sign: `${f.delta > 0 ? "+" : "−"}${n}`, rest: `vs a usual ${slot} (${f.typical})` };
}
