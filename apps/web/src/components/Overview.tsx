"use client";

import Link from "next/link";
import type { Facility, LiveFacility } from "@warriorwatch/contract";
import { busyLabel } from "@warriorwatch/contract";
import { buildingShort, display, isLibrary, slugOf } from "@/lib/facilities";
import { openStatus } from "@/lib/hours";
import { useCountUp } from "@/lib/hooks";
import { LABEL_VAR } from "@/lib/labels";

function Tile({ eyebrow, children, sub, index }: { eyebrow: string; children: React.ReactNode; sub?: React.ReactNode; index: number }) {
  return (
    <div className="panel rise min-w-0 px-3.5 py-3" style={{ "--i": index } as React.CSSProperties}>
      <p className="eyebrow">{eyebrow}</p>
      <div className="mono mt-1 truncate text-lg font-semibold leading-tight">{children}</div>
      {sub && <p className="mono mt-0.5 truncate text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function Count({ n }: { n: number }) {
  return <>{useCountUp(n)}</>;
}

/** Four instrument tiles across the top of the live page. Gyms only; the libraries have their own section. */
export function Overview({ facilities: all, hoursById, now }: { facilities: LiveFacility[]; hoursById: Map<string, Facility>; now: number }) {
  const facilities = all.filter((f) => !isLibrary(f.id));
  const byBuilding = new Map<string, { count: number; max: number; open: number }>();
  for (const f of facilities) {
    if (!f.open) continue;
    const b = buildingShort(f.building);
    const cur = byBuilding.get(b) ?? { count: 0, max: 0, open: 0 };
    byBuilding.set(b, { count: cur.count + f.count, max: cur.max + f.max, open: cur.open + 1 });
  }
  const open = facilities.filter((f) => f.open && f.max >= 25); // gyms only; the Esports lounge (20) is not a workout room
  const quietest = [...open].sort((a, b) => a.count / a.max - b.count / b.max)[0] ?? null;
  const busiest = [...open].sort((a, b) => b.count / b.max - a.count / a.max)[0] ?? null;

  // Closed everywhere: show what opens next.
  const next = facilities
    .map((f) => ({ f, st: hoursById.get(f.id) ? openStatus(hoursById.get(f.id)!.hours, now) : null }))
    .filter((x) => x.st && !x.st.open && x.st.at != null)
    .sort((a, b) => a.st!.at! - b.st!.at!)[0];

  const pac = byBuilding.get("PAC");
  const cif = byBuilding.get("CIF");
  const pct = (x?: { count: number; max: number }) => (x && x.max ? Math.round((x.count / x.max) * 100) : null);
  const colour = (x?: { count: number; max: number }) => (x && x.max ? LABEL_VAR[busyLabel(x.count, x.max, true)] : "var(--closed)");

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile eyebrow="PAC · people in" index={0} sub={pac ? `${pct(pac)}% of ${pac.max} · ${pac.open} rooms open` : "closed"}>
        {pac ? (
          <span style={{ color: colour(pac) }}>
            <Count n={pac.count} />
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </Tile>
      <Tile eyebrow="CIF · people in" index={1} sub={cif ? `${pct(cif)}% of ${cif.max}` : "closed"}>
        {cif ? (
          <span style={{ color: colour(cif) }}>
            <Count n={cif.count} />
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </Tile>
      {quietest ? (
        <Tile eyebrow="most room" index={2} sub={`${quietest.count}/${quietest.max} · ${quietest.pct}%`}>
          <Link href={`/f/${slugOf(quietest.id)}`} className="hover:text-accent">
            {display(quietest.id, quietest.name).title}
          </Link>
        </Tile>
      ) : (
        <Tile eyebrow="opens next" index={2} sub={next?.st?.inText ?? "no hours known"}>
          {next ? (
            <Link href={`/f/${slugOf(next.f.id)}`} className="hover:text-accent">
              {display(next.f.id, next.f.name).title}
            </Link>
          ) : (
            <span className="text-muted">—</span>
          )}
        </Tile>
      )}
      {busiest ? (
        <Tile eyebrow="fullest" index={3} sub={`${busiest.count}/${busiest.max} · ${busiest.pct}%`}>
          <Link href={`/f/${slugOf(busiest.id)}`} className="hover:text-accent">
            {display(busiest.id, busiest.name).title}
          </Link>
        </Tile>
      ) : (
        <Tile eyebrow="opens at" index={3} sub={next?.st?.text ?? ""}>
          {next?.st ? next.st.whenText : <span className="text-muted">—</span>}
        </Tile>
      )}
    </div>
  );
}
