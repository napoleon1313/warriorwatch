/**
 * Import PACked's committed SQLite history (github.com/pauligwe/PACked, occupancy.db)
 * into our `readings` shape as a SQL file for D1.
 *
 * PACked has NO LICENSE file. Do not load its data into a public deployment until the
 * author has said yes (draft request: docs/launch/packed-outreach.md). Credit them either way.
 *
 * Usage:
 *   npx tsx scripts/import-packed.ts                    # dry run (default): fetch, inspect, summarise
 *   npx tsx scripts/import-packed.ts --db ./occupancy.db
 *   npx tsx scripts/import-packed.ts --out packed-seed.sql [--drop-closed]
 *   npx wrangler d1 execute <db-name> --remote --file packed-seed.sql
 *
 * Flags:
 *   --db <path>      use a local copy instead of fetching from GitHub
 *   --url <url>      override the download URL
 *   --out <path>     write INSERT OR IGNORE statements (turns off dry run)
 *   --dry-run        explicit dry run; wins over --out
 *   --drop-closed    skip samples taken while the facility was closed per facilities.json hours
 *                    (PACked samples 24/7 and the portal keeps the last count overnight)
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { Facility, FacilityHours, FacilityId, Reading } from "../packages/contract/src/index.ts";
import { SOURCE } from "../packages/contract/src/index.ts";

const DEFAULT_URL = "https://raw.githubusercontent.com/pauligwe/PACked/main/occupancy.db";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

interface Args { db?: string; url: string; out?: string; dryRun: boolean; dropClosed: boolean }

function parseArgs(argv: string[]): Args {
  const args: Args = { url: DEFAULT_URL, dryRun: true, dropClosed: false };
  let explicitDry = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (!v) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--db") args.db = next();
    else if (a === "--url") args.url = next();
    else if (a === "--out") args.out = next();
    else if (a === "--dry-run") explicitDry = true;
    else if (a === "--drop-closed") args.dropClosed = true;
    else if (a === "--help" || a === "-h") {
      console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
      process.exit(0);
    } else throw new Error(`unknown flag ${a}`);
  }
  args.dryRun = explicitDry || !args.out;
  return args;
}

async function fetchDb(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": SOURCE.userAgent } });
  } catch (err) {
    throw new Error(
      `could not reach ${url} (${(err as Error).cause ?? (err as Error).message}). ` +
        `Check your network, or download occupancy.db by hand and pass --db <path>.`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `GET ${url} returned HTTP ${res.status}. The file may have moved, the repo may be private ` +
        `or deleted, or it may now be stored with Git LFS. Pass --db <path> or --url <raw-url>.`,
    );
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  // SQLite files start with "SQLite format 3\0"; a Git LFS pointer is a short text file.
  if (new TextDecoder().decode(bytes.subarray(0, 15)) !== "SQLite format 3") {
    throw new Error(`${url} is not a SQLite file (${bytes.length} bytes). Is it a Git LFS pointer?`);
  }
  const dir = mkdtempSync(join(tmpdir(), "packed-"));
  const path = join(dir, "occupancy.db");
  writeFileSync(path, bytes);
  return path;
}

/** Normalise names so "PAC - 1st Floor - Free Weights" and "pac 1st floor free weights" match. */
const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

/** PACked writes UTC as "YYYY-MM-DD HH:MM:SS" (SQLite CURRENT_TIMESTAMP / datetime.utcnow()). */
function toIsoUtc(ts: string): string {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) throw new Error(`unparseable timestamp ${JSON.stringify(ts)}`);
  return d.toISOString();
}

const localParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: SOURCE.timezone, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function minutesOf(clock: string): number {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(clock.trim());
  if (!m) throw new Error(`bad clock ${clock}`);
  const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return h * 60 + Number(m[2]);
}

/** true if open at `iso` per the portal's regular hours; unknown hours count as open. */
function isOpen(hours: FacilityHours, iso: string): boolean {
  const parts = Object.fromEntries(localParts.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  const range = hours[parts.weekday as (typeof WEEKDAYS)[number]];
  if (!range) return true;
  if (/closed/i.test(range)) return false;
  const [open, close] = range.split(/\s+-\s+/).map(minutesOf);
  const now = Number(parts.hour) * 60 + Number(parts.minute);
  // "11:59 PM" means midnight; treat the close minute as inclusive.
  return close >= open ? now >= open && now <= close : now >= open || now <= close;
}

interface PackedRow { facility_name: string; facility_id: string; occupancy_count: number; max_capacity: number; timestamp: string }

async function main(args: Args) {
  const facilities: Facility[] = JSON.parse(readFileSync(join(ROOT, "packages/contract/facilities.json"), "utf8"));
  const byName = new Map(facilities.map((f) => [norm(f.name), f]));
  const byId = new Map(facilities.map((f) => [f.id, f]));

  let dbPath = args.db;
  let tmp: string | undefined;
  if (!dbPath) {
    console.log(`Fetching ${args.url} ...`);
    dbPath = await fetchDb(args.url);
    tmp = dirname(dbPath);
  }

  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });

    console.log("\nSchema:");
    const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string; sql: string }[];
    for (const t of tables) console.log(`  ${t.sql.replace(/\s+/g, " ")}`);
    if (!tables.some((t) => t.name === "readings")) throw new Error("no `readings` table; PACked's schema changed, update this script");
    const cols = (db.prepare("PRAGMA table_info(readings)").all() as { name: string }[]).map((c) => c.name);
    for (const c of ["facility_name", "occupancy_count", "max_capacity", "timestamp"]) {
      if (!cols.includes(c)) throw new Error(`readings.${c} missing (columns: ${cols.join(", ")})`);
    }
    const hasId = cols.includes("facility_id");

    const rows = db
      .prepare(`SELECT facility_name, ${hasId ? "facility_id" : "NULL AS facility_id"}, occupancy_count, max_capacity, timestamp FROM readings ORDER BY timestamp`)
      .all() as unknown as PackedRow[];
    db.close();

    // Map by name (PACked's display name = portal name), cross-check against its stored GUID.
    const mapping = new Map<string, Facility | null>();
    const warnings: string[] = [];
    for (const name of new Set(rows.map((r) => r.facility_name))) {
      const f = byName.get(norm(name)) ?? null;
      mapping.set(name, f);
      if (!f) warnings.push(`unmapped facility name ${JSON.stringify(name)}; its rows are skipped`);
    }
    for (const r of rows) {
      const f = mapping.get(r.facility_name);
      if (f && r.facility_id && r.facility_id !== f.id) {
        warnings.push(`${r.facility_name}: PACked GUID ${r.facility_id} != ours ${f.id}${byId.has(r.facility_id) ? " (theirs is also known)" : ""}`);
        break;
      }
    }

    const out: Reading[] = [];
    const seen = new Set<string>();
    let skippedUnmapped = 0, skippedClosed = 0, skippedBad = 0, skippedDup = 0;
    const perFacility = new Map<FacilityId, { name: string; n: number; closed: number }>();

    for (const r of rows) {
      const f = mapping.get(r.facility_name);
      if (!f) { skippedUnmapped++; continue; }
      if (!Number.isInteger(r.occupancy_count) || r.occupancy_count < 0 || !(r.max_capacity > 0)) { skippedBad++; continue; }
      const ts = toIsoUtc(r.timestamp);
      const key = `${f.id}|${ts}`;
      if (seen.has(key)) { skippedDup++; continue; }
      seen.add(key);

      const open = isOpen(f.hours, ts);
      const stat = perFacility.get(f.id) ?? { name: f.name, n: 0, closed: 0 };
      if (!open) stat.closed++;
      perFacility.set(f.id, stat);
      if (!open && args.dropClosed) { skippedClosed++; continue; }

      stat.n++;
      out.push({ facilityId: f.id, ts, count: r.occupancy_count, max: r.max_capacity });
    }

    const all = out.map((r) => r.ts).sort();
    const days = new Set(all.map((ts) => ts.slice(0, 10)));
    console.log(`\nSource rows: ${rows.length}`);
    console.log(`Mapped readings: ${out.length} across ${perFacility.size} facilities, ${days.size} UTC days`);
    console.log(`Date range (UTC): ${all[0] ?? "-"} → ${all.at(-1) ?? "-"}`);
    console.log(`Skipped: unmapped ${skippedUnmapped}, bad values ${skippedBad}, duplicate ${skippedDup}, closed ${skippedClosed}${args.dropClosed ? "" : " (pass --drop-closed to skip)"}`);
    console.log("\nPer facility:");
    for (const [id, s] of perFacility) {
      console.log(`  ${s.name.padEnd(36)} ${id}  ${String(s.n).padStart(5)} rows  (${s.closed} while closed)`);
    }
    const missing = facilities.filter((f) => f.liveOccupancy && !perFacility.has(f.id)).map((f) => f.name);
    if (missing.length) console.log(`  No PACked data for: ${missing.join(", ")}`);
    for (const w of warnings) console.warn(`WARN ${w}`);

    if (args.dryRun) {
      console.log(`\nDry run: nothing written.${args.out ? "" : " Pass --out <file.sql> to write SQL."}`);
      console.log("Reminder: PACked has no license. Get the author's permission before importing into a public deployment.");
      return;
    }

    const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const lines = [
      `-- PACked import (https://github.com/pauligwe/PACked), generated ${new Date().toISOString()}`,
      `-- ${out.length} readings, ${all[0]} to ${all.at(-1)}. Credit: pauligwe/PACked.`,
      `-- INSERT OR IGNORE so rows already scraped by the worker win.`,
    ];
    // D1 rejects very large statements; batch 500 rows per INSERT.
    for (let i = 0; i < out.length; i += 500) {
      const values = out.slice(i, i + 500).map((r) => `(${q(r.facilityId)},${q(r.ts)},${r.count},${r.max})`);
      lines.push(`INSERT OR IGNORE INTO readings (facility_id, ts, count, max) VALUES\n${values.join(",\n")};`);
    }
    writeFileSync(args.out!, lines.join("\n") + "\n");
    console.log(`\nWrote ${out.length} rows to ${args.out}`);
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

main(parseArgs(process.argv.slice(2))).catch((err: Error) => {
  console.error(`import-packed: ${err.message}`);
  process.exit(1);
});
