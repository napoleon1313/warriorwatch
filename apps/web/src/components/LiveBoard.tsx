"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Facility, LiveFacility } from "@warriorwatch/contract";
import { api, USING_MOCK } from "@/lib/api";
import { BUILDING_LONG, buildingShort, display, slugOf } from "@/lib/facilities";
import { openStatus } from "@/lib/hours";
import { usePolling, useNow } from "@/lib/hooks";
import { formatTime, relativeAgo } from "@/lib/time";
import { FacilityCard, FacilityCardSkeleton } from "./FacilityCard";
import { Notice } from "./Notice";

export const REFRESH_MS = 60_000;

export function LiveBoard() {
  const live = usePolling((s) => api.live(s), REFRESH_MS, "live");
  const facilities = usePolling((s) => api.facilities(s), null, "facilities");
  const now = useNow(15_000);

  const hoursById = useMemo(() => {
    const m = new Map<string, Facility>();
    for (const f of facilities.data?.facilities ?? []) m.set(f.id, f);
    return m;
  }, [facilities.data]);

  const groups = useMemo(() => {
    const g = new Map<string, LiveFacility[]>();
    for (const f of live.data?.facilities ?? []) {
      const b = buildingShort(f.building);
      g.set(b, [...(g.get(b) ?? []), f]);
    }
    return [...g.entries()];
  }, [live.data]);

  const quietest = useMemo(() => {
    const open = (live.data?.facilities ?? []).filter((f) => f.open && f.max >= 25);
    return open.sort((a, b) => a.count / a.max - b.count / b.max)[0] ?? null;
  }, [live.data]);
  const anyOpen = live.data?.facilities.some((f) => f.open) ?? false;

  const data = live.data;
  return (
    <div className="space-y-6">
      <div className="min-h-[3rem] text-sm text-muted" aria-live="polite">
        {data ? (
          <p>
            {anyOpen && quietest ? (
              <>
                Most room right now:{" "}
                <Link href={`/f/${slugOf(quietest.id)}`} className="font-semibold text-fg underline decoration-line underline-offset-4 hover:decoration-current">
                  {display(quietest.id).title}
                </Link>{" "}
                at {quietest.pct}% ({quietest.count}/{quietest.max}).
              </>
            ) : (
              <>Everything is closed right now.</>
            )}{" "}
            <span className="tnum whitespace-nowrap">
              Checked {formatTime(data.fetchedAt)} ({relativeAgo(data.fetchedAt, now)}).
            </span>
            {USING_MOCK && <span className="ml-1 rounded bg-line px-1.5 py-0.5 text-xs font-medium text-fg">Demo data</span>}
          </p>
        ) : live.error ? null : (
          <div className="skeleton h-4 w-64" aria-hidden="true" />
        )}
      </div>

      {data?.stale && (
        <Notice tone="warn">
          The official page says its numbers are <strong>not live</strong> right now. Counts below may be out of date.
        </Notice>
      )}
      {live.error && (
        <Notice
          tone="error"
          action={
            <button type="button" onClick={live.refresh} className="rounded-lg border border-current px-3 py-1 text-sm font-medium">
              Try again
            </button>
          }
        >
          {data ? "Couldn't refresh. Showing the last numbers we got." : "Couldn't reach the WarriorWatch API."}
        </Notice>
      )}

      {!data && !live.error && (
        <section aria-busy="true" aria-label="Loading live counts">
          <div className="skeleton mb-3 h-5 w-48" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <FacilityCardSkeleton key={i} />
            ))}
          </div>
        </section>
      )}

      {groups.map(([building, list]) => (
        <section key={building} aria-labelledby={`b-${building}`}>
          <h2 id={`b-${building}`} className="mb-3 flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            {building}
            <span className="font-normal normal-case tracking-normal">{BUILDING_LONG[building] ?? ""}</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((f) => {
              const fac = hoursById.get(f.id);
              const status = fac ? openStatus(fac.hours, now).text : undefined;
              return <FacilityCard key={f.id} f={f} fetchedAt={data!.fetchedAt} now={now} status={status} />;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
