import { facilitySource } from "@warriorwatch/contract";
import type { Facility, FacilityId } from "@warriorwatch/contract";
import { isOpenAt } from "../lib/hours";
import { localParts, type Weekday } from "../lib/time";

/**
 * Deterministic synthetic occupancy. Same inputs → same numbers, so the
 * live page, the history curve and the OG image all agree with each other
 * without a server. Shapes are plausible, not measured: a small morning
 * bump, a lunch bump, a big 5–8 PM peak, and flatter weekends.
 */
interface Profile {
  /** fraction of max at the busiest weekday slot */
  peak: number;
  /** extra weight on the evening peak vs the rest of the day */
  evening: number;
  /** Esports lounge: mostly empty, occasional 1–3 people */
  sparse?: boolean;
}

const PROFILES: Record<FacilityId, Profile> = {
  "7c59cbfb-ea06-46e0-8ec7-06739ccaec45": { peak: 0.92, evening: 1.0 }, // PAC Free Weights
  "b03ac6cb-b6ec-4fd4-bd21-e9872a3a43f3": { peak: 0.72, evening: 0.9 }, // PAC Functional
  "db0e08e1-faa7-4bc5-b639-088d7642a53e": { peak: 0.62, evening: 0.7 }, // PAC Cardio
  "b08d4801-c28c-4eba-8602-8e904ae0568c": { peak: 0.8, evening: 0.95 }, // PAC Machines
  "f30dc951-26b0-4909-b814-ce54d38c2fbb": { peak: 0.55, evening: 0.85 }, // Warrior Zone
  "b2d98ff8-e37a-42da-bf72-06b259ff1a2c": { peak: 0.7, evening: 1.0 }, // CIF Fitness
  "9f0010ea-3844-4c2a-9357-68db5149cda7": { peak: 0.12, evening: 0.6, sparse: true }, // Esports
};

/** Libraries (Waitz): fuller through the afternoon, quieter evenings than a gym. */
const LIBRARY_PROFILE: Profile = { peak: 0.78, evening: 0.45 };

function profileOf(f: Facility): Profile | undefined {
  return PROFILES[f.id] ?? (facilitySource(f.id) === "waitz" ? LIBRARY_PROFILE : undefined);
}

/** FNV-1a → [0,1) */
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const bump = (h: number, mu: number, sigma: number) => Math.exp(-((h - mu) ** 2) / (2 * sigma ** 2));

/** Unitless 0..1 shape for an hour of day (fractional) and weekday. */
function shape(h: number, wd: Weekday, evening: number): number {
  const weekend = wd === 0 || wd === 6;
  if (weekend) {
    return Math.min(1, 0.08 + 0.55 * bump(h, 13.5, 2.2) + 0.5 * evening * bump(h, 17, 2) + 0.15 * bump(h, 21, 1.5)) * 0.78;
  }
  const friday = wd === 5;
  const eve = evening * (friday ? 0.65 : 1);
  const v =
    0.07 +
    0.32 * bump(h, 7.6, 0.9) +
    0.42 * bump(h, 12.4, 1.0) +
    0.3 * bump(h, 15, 1.2) +
    0.9 * eve * bump(h, 18.4, 1.6) +
    0.45 * eve * bump(h, 21.3, 1.1) +
    0.12 * bump(h, 23, 1.2);
  return Math.max(0, Math.min(1, v));
}

/** Fade in after opening and out before closing, so curves don't cliff. */
function edgeFade(f: Facility, at: number): number {
  let fade = 1;
  for (const [dir, mins] of [[1, 30], [-1, 45]] as const) {
    for (let step = 0; step <= mins; step += 15) {
      if (!isOpenAt(f.hours, at - dir * step * 60_000)) {
        fade = Math.min(fade, step / mins);
        break;
      }
    }
  }
  return 0.35 + 0.65 * fade;
}

/** Expected (median) headcount at an instant. 0 when closed. */
export function expectedAt(f: Facility, at: number): number {
  const max = f.maxOccupancy ?? 0;
  const p = profileOf(f);
  if (!p || !max || !isOpenAt(f.hours, at)) return 0;
  const lp = localParts(at);
  return max * p.peak * shape(lp.minuteOfDay / 60, lp.weekday, p.evening) * edgeFade(f, at);
}

/** Smooth value noise in [-1,1] with knots every `knotMin` minutes. */
function valueNoise(key: string, at: number, knotMin: number): number {
  const k = at / 60_000 / knotMin;
  const i = Math.floor(k);
  const t = k - i;
  const a = hash01(`${key}:${i}`) * 2 - 1;
  const b = hash01(`${key}:${i + 1}`) * 2 - 1;
  const s = t * t * (3 - 2 * t);
  return a + (b - a) * s;
}

/** The counter only moves every few minutes, like the real tap-in/out counter. */
export const COUNT_STEP_MIN = 3;

/** Simulated headcount at an instant. Integer, 0 when closed. */
export function countAt(f: Facility, at: number): number {
  const max = f.maxOccupancy ?? 0;
  const p = profileOf(f);
  if (!p || !max || !isOpenAt(f.hours, at)) return 0;
  const t = Math.floor(at / (COUNT_STEP_MIN * 60_000)) * COUNT_STEP_MIN * 60_000;
  const base = expectedAt(f, t);
  const day = localParts(t).ymd;
  const dayFactor = 0.85 + 0.3 * hash01(`${f.id}:${day}`);
  const wobble = valueNoise(f.id, t, 25) * 0.12 * max * Math.sqrt(base / max + 0.05);
  if (p.sparse) {
    const n = base * dayFactor + valueNoise(`${f.id}:s`, t, 40) * 2.2 - 0.9;
    return Math.max(0, Math.min(max, Math.round(n)));
  }
  return Math.max(0, Math.min(max, Math.round(base * dayFactor + wobble)));
}
