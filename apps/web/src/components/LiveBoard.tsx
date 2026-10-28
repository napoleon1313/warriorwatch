"use client";

import { useMemo } from "react";
import type { Facility, LiveFacility } from "@warriorwatch/contract";
import { api, USING_MOCK } from "@/lib/api";
import { BUILDING_LONG, buildingShort } from "@/lib/facilities";
import { openStatus } from "@/lib/hours";
import { usePolling, useNow } from "@/lib/hooks";
import { formatTime, relativeAgo } from "@/lib/time";
import { FacilityCard, FacilityCardSkeleton } from "./FacilityCard";
import { Notice } from "./Notice";
import { Overview } from "./Overview";
import { RankBars } from "./RankBars";
import { Section } from "./Section";
import { WeekStrip } from "./WeekStrip";

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

  const anyOpen = live.data?.facilities.some((f) => f.open) ?? false;
  const data = live.data;
  let idx = 0;

  return (
    <div className="space-y-5">
      <div className="mono flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted" aria-live="polite">
        {data ? (
          <>
            <span className="inline-flex items-center gap-2 text-fg">
              <span className="live-dot" aria-hidden="true" />
              {data.stale ? "STALE" : "LIVE"}
            </span>
            <span>
              checked {formatTime(data.fetchedAt)} · {relativeAgo(data.fetchedAt, now)}
            </span>
            <span>refresh 60s</span>
            {!anyOpen && <span className="text-fg">all rooms closed</span>}
            {USING_MOCK && <span className="rounded border border-line px-1.5 py-0.5 text-fg">demo data</span>}
          </>
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
            <button type="button" onClick={live.refresh} className="rounded-md border border-current px-3 py-1 text-sm font-medium">
              Try again
            </button>
          }
        >
          {data ? "Couldn't refresh. Showing the last numbers we got." : "Couldn't reach the WarriorWatch API."}
        </Notice>
      )}

      {!data && !live.error && (
        <section aria-busy="true" aria-label="Loading live counts">
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-[4.5rem]" />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <FacilityCardSkeleton key={i} />
            ))}
          </div>
        </section>
      )}

      {data && (
        <>
          <Overview facilities={data.facilities} hoursById={hoursById} now={now} />

          {anyOpen && (
            <Section eyebrow="rank" title="Right now, most room first" aside="share of posted capacity">
              <RankBars facilities={data.facilities} />
            </Section>
          )}

          {groups.map(([building, list]) => (
            <section key={building} aria-labelledby={`b-${building}`}>
              <h2 id={`b-${building}`} className="mb-2.5 flex items-baseline gap-2">
                <span className="eyebrow text-fg">{building}</span>
                <span className="text-xs text-muted">{BUILDING_LONG[building] ?? ""}</span>
                <span className="mono ml-auto text-[11px] text-faint">
                  {list.filter((f) => f.open).length}/{list.length} open
                </span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((f) => {
                  const fac = hoursById.get(f.id);
                  const status = fac ? openStatus(fac.hours, now) : null;
                  return <FacilityCard key={f.id} f={f} fetchedAt={data.fetchedAt} now={now} status={status} index={idx++} />;
                })}
              </div>
            </section>
          ))}

          <Section eyebrow="shape" title="How today usually goes, room by room" aside="usual curve for this weekday · now marked">
            <WeekStrip facilities={data.facilities} hoursById={hoursById} now={now} />
          </Section>
        </>
      )}
    </div>
  );
}
