import {
  FACILITY_SLUGS,
  GYM_FACILITY_ORDER,
  LIBRARY_FACILITY_ORDER,
  LIBRARY_TOTAL_IDS,
  LIVE_FACILITY_ORDER,
  SOURCE,
  facilitySource,
  type FacilityId,
} from "@warriorwatch/contract";

export const SLUG_TO_ID: Record<string, FacilityId> = Object.fromEntries(
  Object.entries(FACILITY_SLUGS).map(([id, slug]) => [slug, id]),
);

const slugs = (ids: FacilityId[]) => ids.map((id) => FACILITY_SLUGS[id]!);

/** Every live facility: 7 gyms, then 3 library totals and 16 library zones. */
export const LIVE_SLUGS: string[] = slugs(LIVE_FACILITY_ORDER);
export const GYM_SLUGS: string[] = slugs(GYM_FACILITY_ORDER);
export const LIBRARY_SLUGS: string[] = slugs(LIBRARY_FACILITY_ORDER);
export const LIBRARY_TOTAL_SLUGS: string[] = slugs(LIBRARY_TOTAL_IDS);
/** Rooms you can chain in a session: gyms plus whole libraries (a floor is too fine for planning). */
export const SESSION_SLUGS: string[] = [...GYM_SLUGS, ...LIBRARY_TOTAL_SLUGS];

export const isLibrary = (id: FacilityId): boolean => facilitySource(id) === "waitz";
export const isLibraryTotal = (id: FacilityId): boolean => LIBRARY_TOTAL_IDS.includes(id);

/** Which library a zone belongs to (by slug prefix), or null for totals and gyms. */
export function libraryOf(id: FacilityId): FacilityId | null {
  const slug = FACILITY_SLUGS[id] ?? "";
  if (slug.startsWith("dp-")) return "waitz-215";
  if (slug.startsWith("dc-")) return "waitz-216";
  return null;
}

/** The zones of a library total, in contract order. */
export function zonesOf(libraryId: FacilityId): FacilityId[] {
  return LIBRARY_FACILITY_ORDER.filter((id) => libraryOf(id) === libraryId);
}

export function slugOf(id: FacilityId): string {
  return FACILITY_SLUGS[id] ?? id;
}

/**
 * Display copy only. The portal names ("PAC - 2nd Floor - Weight Machines")
 * are long for a phone card, so the UI shows a short title plus where it is.
 * The API's `name` stays the source of truth and is shown on the detail page.
 */
const DISPLAY: Record<string, { title: string; where: string }> = {
  "pac-free-weights": { title: "Free Weights", where: "PAC · 1st floor" },
  "pac-functional": { title: "Functional", where: "PAC · 1st floor" },
  "pac-cardio": { title: "Cardio", where: "PAC · 2nd floor" },
  "pac-machines": { title: "Weight Machines", where: "PAC · 2nd floor" },
  "warrior-zone": { title: "Warrior Zone", where: "PAC" },
  "cif-fitness": { title: "Fitness Centre", where: "CIF" },
  "esports-lounge": { title: "Esports Lounge", where: "PAC 2021 · PCs" },
  // Libraries (Waitz sensors). Totals are whole buildings; zones are floors or areas.
  "dana-porter": { title: "Dana Porter", where: "Library" },
  "davis-library": { title: "Davis Centre", where: "Library" },
  musagetes: { title: "Musagetes", where: "Library · Cambridge" },
  "dp-lower": { title: "Lower floor", where: "Dana Porter" },
  "dp-main": { title: "Main floor", where: "Dana Porter" },
  "dp-atc": { title: "Adaptive Tech Centre", where: "Dana Porter · main" },
  "dp-floor-3": { title: "Floor 3 · study", where: "Dana Porter" },
  "dp-floor-6": { title: "Floor 6 · quiet", where: "Dana Porter" },
  "dp-floor-7": { title: "Floor 7 · silent", where: "Dana Porter" },
  "dp-floor-8": { title: "Floor 8 · silent", where: "Dana Porter" },
  "dp-floor-9": { title: "Floor 9 · quiet", where: "Dana Porter" },
  "dp-floor-10": { title: "Floor 10 · group", where: "Dana Porter" },
  "dc-lower-bookstacks": { title: "Lower · bookstack tables", where: "Davis Centre" },
  "dc-lower-wall-tables": { title: "Lower · wall tables", where: "Davis Centre" },
  "dc-lower-quiet": { title: "Lower · quiet study", where: "Davis Centre" },
  "dc-lower-pods": { title: "Lower · quiet pods", where: "Davis Centre" },
  "dc-main": { title: "Main study areas", where: "Davis Centre" },
  "dc-quiet-corner": { title: "Main · quiet corner", where: "Davis Centre" },
  "dc-silent-room": { title: "Main · silent room", where: "Davis Centre" },
};

export function display(id: FacilityId, fallbackName = ""): { title: string; where: string } {
  return DISPLAY[slugOf(id)] ?? { title: fallbackName, where: "" };
}

const BUILDING_SHORT: Record<string, string> = {
  "Physical Activities Complex": "PAC",
  "Columbia Icefield Building": "CIF",
  "Dana Porter Library": "Dana Porter",
  "Davis Centre Library": "Davis Centre",
  "Musagetes Architecture Library": "Musagetes",
};
export function buildingShort(building: string | null): string {
  if (!building) return "Other";
  return BUILDING_SHORT[building] ?? building;
}
export const BUILDING_LONG: Record<string, string> = {
  PAC: "Physical Activities Complex",
  CIF: "Columbia Icefield",
  "Dana Porter": "Arts library",
  "Davis Centre": "Engineering, math and science library",
  Musagetes: "Architecture, Cambridge",
};

export const scheduleUrl = (id: FacilityId) => SOURCE.scheduleUrl(id);
export const facilityPageUrl = (id: FacilityId) => SOURCE.facilityUrl(id);
/** Where a person can see the same number at the source. */
export const sourcePageUrl = (id: FacilityId) => (isLibrary(id) ? SOURCE.waitzPageUrl : SOURCE.facilityUrl(id));
export const LIBRARY_HOURS_URL = SOURCE.libraryHoursUrl;
