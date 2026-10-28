/**
 * @warriorwatch/contract — the shared data contract.
 * Every workspace (worker, web, analytics) imports types from here and
 * NEVER redefines them. Change this file only with a note in CHANGELOG.md.
 */

/** Facility GUID exactly as the portal uses it in ?facilityId= */
export type FacilityId = string;

export interface FacilityHours {
  /** "6:00 AM - 11:59 PM" exactly as the portal renders it; "Closed" if closed */
  Sunday?: string; Monday?: string; Tuesday?: string; Wednesday?: string;
  Thursday?: string; Friday?: string; Saturday?: string;
}

export interface Facility {
  id: FacilityId;
  name: string;
  /** Top-level breadcrumb, e.g. "Physical Activities Complex", "Columbia Icefield Building", "Field House" */
  building: string | null;
  /** Full breadcrumb path below "All Facilities" */
  path: string[];
  type: string | null;
  area: string | null;
  maxOccupancy: number | null;
  /** true for the 7 facilities that appear on /FacilityOccupancy */
  liveOccupancy: boolean;
  hours: FacilityHours;
}

/** One sample of the occupancy page. */
export interface Reading {
  facilityId: FacilityId;
  /** ISO 8601 UTC, the time the page was fetched */
  ts: string;
  /** raw headcount from canvas[data-occupancy] */
  count: number;
  /** from "Max Occupancy: N" on the card at the time of the reading */
  max: number;
}

/** A single page scrape: one timestamp, all cards. */
export interface Snapshot {
  ts: string;
  /** true when the portal showed the red "results not live" banner (stale data) */
  stale: boolean;
  readings: Reading[];
}

export type BusyLabel = "closed" | "quiet" | "moderate" | "busy" | "packed";

/** Label thresholds as fraction of max. Shared by API and web so they never disagree. */
export const BUSY_THRESHOLDS = { quiet: 0.35, moderate: 0.6, busy: 0.85 } as const;

export function busyLabel(count: number, max: number, open: boolean): BusyLabel {
  if (!open) return "closed";
  const r = max > 0 ? count / max : 0;
  if (r < BUSY_THRESHOLDS.quiet) return "quiet";
  if (r < BUSY_THRESHOLDS.moderate) return "moderate";
  if (r < BUSY_THRESHOLDS.busy) return "busy";
  return "packed";
}

/** Term buckets drive separate typical curves. Data lives in packages/analytics/term-calendar.json */
export type TermBucket = "term" | "reading-week" | "exams" | "break" | "holiday";

// ---------- API response shapes (all JSON, all CORS: *) ----------

export interface LiveFacility {
  id: FacilityId;
  name: string;
  building: string | null;
  count: number;
  max: number;
  pct: number;              // 0..100, rounded
  label: BusyLabel;
  open: boolean;            // from hours at `ts`, America/Toronto
  /** typical median count for this weekday/slot/term, null until enough data */
  typical: number | null;
  /** count - typical, null if typical is null */
  delta: number | null;
  /** slope of last 20 min in people/10min; null if not enough samples */
  trend: number | null;
  /** last time the count CHANGED (not last fetch) */
  lastChange: string;
  /** last 3h at 5-min resolution, oldest first; null where no data */
  sparkline: (number | null)[];
}

export interface LiveResponse {
  fetchedAt: string;        // ISO, when the worker last scraped
  stale: boolean;
  facilities: LiveFacility[];
}

export interface HistoryPoint { ts: string; count: number; max: number }
export interface HistoryResponse {
  facilityId: FacilityId;
  from: string; to: string;
  resolution: "raw" | "5m" | "15m" | "1h";
  points: HistoryPoint[];
}

export interface TypicalSlot {
  /** minutes since local midnight, step 15 */
  minute: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  /** number of distinct days contributing */
  n: number;
}
export interface TypicalResponse {
  facilityId: FacilityId;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, America/Toronto
  term: TermBucket;
  slots: TypicalSlot[];
}

export interface BestWindow { start: string; end: string; expected: number; pct: number; label: BusyLabel }
export interface BestResponse {
  facilityId: FacilityId;
  date: string;              // YYYY-MM-DD local
  windows: BestWindow[];     // ranked, quietest first, only while open
  confidence: "low" | "medium" | "high";
  daysOfData: number;
}

export interface FacilitiesResponse { facilities: Facility[]; updatedAt: string }

export interface FacilityEvent {
  facilityId: FacilityId;
  title: string;
  start: string; end: string;   // ISO
  /** e.g. "Open Rec", "Varsity", "Intramural", "Booking", "Closed" — best effort */
  kind: string | null;
}
export interface EventsResponse { facilityId: FacilityId; from: string; to: string; events: FacilityEvent[] }

/** The 7 live facilities in display order (PAC first, then CIF). */
export const LIVE_FACILITY_ORDER: FacilityId[] = [
  "7c59cbfb-ea06-46e0-8ec7-06739ccaec45", // PAC - 1st Floor - Free Weights (75)
  "b03ac6cb-b6ec-4fd4-bd21-e9872a3a43f3", // PAC - 1st Floor - Functional (25)
  "db0e08e1-faa7-4bc5-b639-088d7642a53e", // PAC - 2nd Floor - Cardio (50)
  "b08d4801-c28c-4eba-8602-8e904ae0568c", // PAC - 2nd Floor - Weight Machines (40)
  "f30dc951-26b0-4909-b814-ce54d38c2fbb", // Warrior Zone (60)
  "b2d98ff8-e37a-42da-bf72-06b259ff1a2c", // CIF Fitness Centre (100)
  "9f0010ea-3844-4c2a-9357-68db5149cda7", // Esports & Gaming Lounge - PC's (20)
];

/** Short URL-safe slugs, stable forever (used in routes and the public API). */
export const FACILITY_SLUGS: Record<FacilityId, string> = {
  "7c59cbfb-ea06-46e0-8ec7-06739ccaec45": "pac-free-weights",
  "b03ac6cb-b6ec-4fd4-bd21-e9872a3a43f3": "pac-functional",
  "db0e08e1-faa7-4bc5-b639-088d7642a53e": "pac-cardio",
  "b08d4801-c28c-4eba-8602-8e904ae0568c": "pac-machines",
  "f30dc951-26b0-4909-b814-ce54d38c2fbb": "warrior-zone",
  "b2d98ff8-e37a-42da-bf72-06b259ff1a2c": "cif-fitness",
  "9f0010ea-3844-4c2a-9357-68db5149cda7": "esports-lounge",
};

export const SOURCE = {
  occupancyUrl: "https://warrior.uwaterloo.ca/FacilityOccupancy",
  facilityListUrl: "https://warrior.uwaterloo.ca/Facility",
  facilityUrl: (id: FacilityId) => `https://warrior.uwaterloo.ca/Facility/GetFacility?facilityId=${id}`,
  scheduleUrl: (id: FacilityId) => `https://warrior.uwaterloo.ca/Facility/GetSchedule?facilityId=${id}`,
  /** Identify ourselves. Keep the contact so Athletics can reach us. */
  userAgent: "WarriorWatch/0.1 (+https://github.com/napoleon1313/warriorwatch; fbf69b8c0b8b454cb1a1a1ba649a1534@mail.grokbot.com)",
  timezone: "America/Toronto",
} as const;
