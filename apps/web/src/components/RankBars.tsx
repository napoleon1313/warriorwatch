"use client";

import Link from "next/link";
import type { LiveFacility } from "@warriorwatch/contract";
import { display, slugOf } from "@/lib/facilities";
import { LABEL_VAR } from "@/lib/labels";

/**
 * Every open room on one axis, most room first. Bar = share of capacity,
 * coloured by label. Reads at a glance which room to walk to.
 */
export function RankBars({ facilities }: { facilities: LiveFacility[] }) {
  const open = facilities.filter((f) => f.open && f.max > 0).sort((a, b) => a.count / a.max - b.count / b.max);
  if (open.length === 0) return null;
  return (
    <ol className="space-y-1.5" aria-label="Open rooms ranked by how full they are, emptiest first">
      {open.map((f, i) => {
        const d = display(f.id, f.name);
        const w = Math.max(2, Math.round((f.count / f.max) * 100));
        return (
          <li key={f.id} className="rise" style={{ "--i": i } as React.CSSProperties}>
            <Link href={`/f/${slugOf(f.id)}`} className="group grid grid-cols-[1.25rem_minmax(0,9.5rem)_1fr_auto] items-center gap-x-3 py-0.5 sm:grid-cols-[1.25rem_minmax(0,12rem)_1fr_auto]">
              <span className="mono text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
              <span className="truncate text-sm group-hover:text-accent">
                {d.title}
                <span className="mono ml-1.5 hidden text-[10px] text-faint sm:inline">{d.where}</span>
              </span>
              <span className="relative h-2.5 overflow-hidden rounded-sm bg-line" aria-hidden="true">
                <span
                  className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-700 [transition-timing-function:var(--ease)]"
                  style={{ width: `${w}%`, background: LABEL_VAR[f.label] }}
                />
                {[25, 50, 75].map((t) => (
                  <span key={t} className="absolute inset-y-0 w-px bg-[color:var(--card)]" style={{ left: `${t}%` }} />
                ))}
              </span>
              <span className="mono w-[5.5rem] text-right text-xs tabular-nums">
                <span className="font-semibold">{f.count}</span>
                <span className="text-muted">/{f.max}</span>
                <span className="ml-1.5 text-muted">{f.pct}%</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
