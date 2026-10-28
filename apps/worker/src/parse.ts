/**
 * Parsers for the two server-rendered portal pages. Plain string scanning (no DOM),
 * so the same code runs in workerd and in vitest under Node.
 */
import { LIVE_FACILITY_ORDER } from "@warriorwatch/contract";
import type { Facility, FacilityHours, Reading, Snapshot } from "@warriorwatch/contract";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[ent.toLowerCase()] ?? whole;
  });
}

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Attributes of a single start tag, e.g. `<canvas class="x" hidden>` → { class: "x", hidden: "" }. */
export function parseAttrs(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const body = tag.replace(/^<\s*[a-z0-9-]+/i, "").replace(/\/?>$/, "");
  for (const m of body.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs.set(m[1]!.toLowerCase(), decodeEntities(m[2] ?? m[3] ?? m[4] ?? ""));
  }
  return attrs;
}

function hasClass(attrs: Map<string, string>, cls: string): boolean {
  return (attrs.get("class") ?? "").split(/\s+/).includes(cls);
}

function int(s: string | undefined): number | null {
  return s !== undefined && /^\s*\d+\s*$/.test(s) ? parseInt(s, 10) : null;
}

const CARD_START = /<div\b[^>]*\bdata-facilityid\s*=\s*"([0-9a-fA-F-]{36})"[^>]*>/g;

/**
 * Parse /FacilityOccupancy. Every card is rendered twice (desktop, then mobile) inside the
 * same `div[data-facilityid]`, so only the first canvas and first max-occupancy of each card count.
 * Cards whose numbers do not parse are skipped; the caller compares `readings.length` to 7.
 */
export function parseOccupancy(html: string, ts: string): Snapshot {
  const starts = [...html.matchAll(CARD_START)];
  const seen = new Set<string>();
  const readings: Reading[] = [];

  starts.forEach((m, i) => {
    const facilityId = m[1]!.toLowerCase();
    if (seen.has(facilityId)) return;
    const card = html.slice(m.index, starts[i + 1]?.index ?? html.length);

    let count: number | null = null;
    for (const t of card.matchAll(/<canvas\b[^>]*>/gi)) {
      const attrs = parseAttrs(t[0]);
      if (hasClass(attrs, "occupancy-chart")) {
        count = int(attrs.get("data-occupancy"));
        break;
      }
    }
    const maxMatch = card.match(/<p\b[^>]*\bclass="[^"]*\bmax-occupancy\b[^"]*"[^>]*>[\s\S]*?<strong>([\s\S]*?)<\/strong>/i);
    const max = int(maxMatch ? text(maxMatch[1]!) : undefined);

    if (count === null || max === null) return;
    seen.add(facilityId);
    readings.push({ facilityId, ts, count, max });
  });

  return { ts, stale: isStale(html), readings };
}

/** The portal un-hides a `.results-not-live` element when it is showing old or failed results. */
export function isStale(html: string): boolean {
  for (const m of html.matchAll(/<[a-z][a-z0-9]*\b[^>]*>/gi)) {
    if (!m[0].includes("results-not-live")) continue;
    const attrs = parseAttrs(m[0]);
    if (!hasClass(attrs, "results-not-live")) continue;
    const style = (attrs.get("style") ?? "").replace(/\s/g, "").toLowerCase();
    if (!attrs.has("hidden") && !style.includes("display:none")) return true;
  }
  return false;
}

function infoField(html: string, label: string): string | null {
  const m = html.match(new RegExp(`<strong>\\s*${label}:\\s*</strong>([\\s\\S]*?)</p>`, "i"));
  if (!m) return null;
  const v = text(m[1]!);
  return v === "" || v.toUpperCase() === "N/A" ? null : v;
}

/** Parse /Facility/GetFacility?facilityId=… into a Facility. Returns null when the page is not a facility page. */
export function parseFacilityPage(html: string, id: string): Facility | null {
  const crumb = html.match(/<li\b[^>]*\bclass="[^"]*\bbreadcrumb-item\b[^"]*\bactive\b[^"]*"[^>]*>([\s\S]*?)<\/li>/i);
  const path = crumb
    ? text(crumb[1]!).split(">").map((s) => s.trim()).filter((s) => s !== "")
    : [];
  if (path[0] === "All Facilities") path.shift();

  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const heading = h1 ? text(h1[1]!).replace(/\s*-\s*Facility Details$/i, "") : "";
  const name = heading || path[path.length - 1] || "";

  const hours: FacilityHours = {};
  const dayRe = new RegExp(`<strong>\\s*(${WEEKDAYS.join("|")}):\\s*</strong>\\s*</p>\\s*<p\\b[^>]*>([\\s\\S]*?)</p>`, "gi");
  for (const m of html.matchAll(dayRe)) {
    const day = WEEKDAYS.find((d) => d.toLowerCase() === m[1]!.toLowerCase());
    if (day) hours[day] = text(m[2]!);
  }

  if (name === "" || Object.keys(hours).length === 0) return null;
  const facilityId = id.toLowerCase();
  return {
    id: facilityId,
    name,
    building: path[0] ?? null,
    path,
    type: infoField(html, "Facility Type"),
    area: infoField(html, "Area"),
    // The portal prints 0 for facilities without a cap; the registry stores that as null.
    maxOccupancy: int(infoField(html, "Max Occupancy") ?? undefined) || null,
    liveOccupancy: LIVE_FACILITY_ORDER.includes(facilityId),
    hours,
  };
}
