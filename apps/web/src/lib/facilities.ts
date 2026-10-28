import { FACILITY_SLUGS, LIVE_FACILITY_ORDER, SOURCE, type FacilityId } from "@warriorwatch/contract";

export const SLUG_TO_ID: Record<string, FacilityId> = Object.fromEntries(
  Object.entries(FACILITY_SLUGS).map(([id, slug]) => [slug, id]),
);

export const LIVE_SLUGS: string[] = LIVE_FACILITY_ORDER.map((id) => FACILITY_SLUGS[id]!);

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
};

export function display(id: FacilityId, fallbackName = ""): { title: string; where: string } {
  return DISPLAY[slugOf(id)] ?? { title: fallbackName, where: "" };
}

const BUILDING_SHORT: Record<string, string> = {
  "Physical Activities Complex": "PAC",
  "Columbia Icefield Building": "CIF",
};
export function buildingShort(building: string | null): string {
  if (!building) return "Other";
  return BUILDING_SHORT[building] ?? building;
}
export const BUILDING_LONG: Record<string, string> = {
  PAC: "Physical Activities Complex",
  CIF: "Columbia Icefield",
};

export const scheduleUrl = (id: FacilityId) => SOURCE.scheduleUrl(id);
export const facilityPageUrl = (id: FacilityId) => SOURCE.facilityUrl(id);
