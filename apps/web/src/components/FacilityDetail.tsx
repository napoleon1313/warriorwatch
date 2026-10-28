"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { TypicalResponse } from "@warriorwatch/contract";
import { api, USING_MOCK } from "@/lib/api";
import { SLUG_TO_ID, display, scheduleUrl, facilityPageUrl } from "@/lib/facilities";
import { openStatus, rangeFor } from "@/lib/hours";
import { usePolling, useNow } from "@/lib/hooks";
import { LABEL_VAR } from "@/lib/labels";
import { SITE_URL } from "@/lib/site";
import { WEEKDAYS, localParts, plural, relativeAgo, zonedToUtc, type Weekday } from "@/lib/time";
import { BestWindows } from "./BestWindows";
import { CopySnippet } from "./CopySnippet";
import { DayCurve } from "./DayCurve";
import { Heatmap } from "./Heatmap";
import { HoursTable } from "./HoursTable";
import { LabelPill } from "./LabelPill";
import { EmptyState, Notice } from "./Notice";
import { Ring } from "./Ring";
import { Section } from "./Section";
import { Trend } from "./Trend";
import { vsUsual } from "./copy";
import { REFRESH_MS } from "./LiveBoard";

export function FacilityDetail({ slug }: { slug: string }) {
  const id = SLUG_TO_ID[slug]!;
  const d = display(id);
  const now = useNow(30_000);
  const lp = localParts(now);
  const today = lp.ymd;

  const live = usePolling((s) => api.live(s), REFRESH_MS, "live");
  const facilities = usePolling((s) => api.facilities(s), null, "facilities");
  const history = usePolling(
    (s) => api.history(slug, zonedToUtc(today, 0).toISOString(), undefined, "5m", s),
    5 * 60_000,
    `history:${slug}:${today}`,
  );
  const best = usePolling((s) => api.best(slug, today, s), 15 * 60_000, `best:${slug}:${today}`);
  const week = usePolling(
    (s) => Promise.all(([0, 1, 2, 3, 4, 5, 6] as const).map((wd) => api.typical(slug, wd, s))),
    null,
    `typical:${slug}`,
  );

  const f = live.data?.facilities.find((x) => x.id === id) ?? null;
  const fac = facilities.data?.facilities.find((x) => x.id === id) ?? null;
  const typicalToday: TypicalResponse | null = week.data?.find((t) => t.weekday === lp.weekday) ?? null;
  const nToday = useMemo(() => Math.max(0, ...(typicalToday?.slots.map((s) => s.n) ?? [0])), [typicalToday]);
  const weeksOfData = useMemo(() => Math.max(0, ...(week.data?.flatMap((t) => t.slots.map((s) => s.n)) ?? [0])), [week.data]);
  const dayName = WEEKDAYS[lp.weekday];
  const max = f?.max ?? fac?.maxOccupancy ?? 0;
  const status = fac ? openStatus(fac.hours, now) : null;
  const vs = f && live.data ? vsUsual(f, live.data.fetchedAt) : null;
  const embed = `<iframe src="${SITE_URL}/embed/${slug}" title="${d.title} occupancy" width="320" height="120" style="border:0;border-radius:16px" loading="lazy"></iframe>`;

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/" className="text-muted hover:text-fg">
          ← All facilities
        </Link>
      </nav>

      <header className="flex items-center gap-4">
        {f ? (
          <Ring count={f.count} max={f.max} label={f.label} size={88} />
        ) : (
          <div className="skeleton h-[88px] w-[88px] shrink-0 rounded-full" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight">{d.title}</h1>
          <p className="text-sm text-muted">{fac && fac.name !== d.title ? fac.name : d.where}</p>
          <div className="tnum mt-1.5 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {f && <LabelPill label={f.label} />}
            {f?.open && (
              <span>
                <strong>{f.count}</strong>
                <span className="text-muted">
                  {" "}
                  / {f.max} · {f.pct}%
                </span>
              </span>
            )}
            {f?.open && <Trend trend={f.trend} />}
          </div>
        </div>
      </header>

      <div aria-live="polite" className="tnum min-h-5 text-sm text-muted">
        {f && (
          <p>
            {vs?.sign && <strong className="text-fg">{vs.sign} </strong>}
            {vs ? `${vs.rest}. ` : ""}
            {status ? `${status.text}. ` : ""}Count updated {relativeAgo(f.lastChange, now)}.
            {USING_MOCK && <span className="ml-1 rounded bg-line px-1.5 py-0.5 text-xs font-medium text-fg">Demo data</span>}
          </p>
        )}
      </div>

      {live.data?.stale && <Notice tone="warn">The official page says its numbers are not live right now.</Notice>}
      {(live.error || history.error) && !live.data && (
        <Notice tone="error" action={<button type="button" className="rounded-lg border border-current px-3 py-1 text-sm" onClick={live.refresh}>Try again</button>}>
          Couldn&apos;t reach the WarriorWatch API.
        </Notice>
      )}

      <Section
        title="Today"
        aside={
          typicalToday
            ? nToday > 0
              ? `Usual = based on ${plural(nToday, dayName)}`
              : `No usual ${dayName} yet`
            : "\u00a0"
        }
      >
        {history.data && week.data ? (
          <>
            <DayCurve
              points={history.data.points}
              typical={typicalToday?.slots ?? null}
              max={max}
              hours={fac ? rangeFor(fac.hours, lp.weekday) : null}
              now={now}
              weekdayName={dayName}
              color={f ? LABEL_VAR[f.label === "closed" ? "quiet" : f.label] : undefined}
            />
            {nToday === 0 && (
              <p className="mt-2 text-sm text-muted">
                We haven&apos;t seen a full {dayName} here yet, so there&apos;s no usual curve to compare against. It fills in after the first week.
              </p>
            )}
            {nToday > 0 && nToday < 4 && (
              <p className="mt-2 text-xs text-muted">
                Only {plural(nToday, dayName)} so far, so the usual band is wide. It narrows as more weeks come in.
              </p>
            )}
          </>
        ) : (
          <div className="skeleton h-[250px] w-full" aria-hidden="true" />
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Best times today" aside={<Link href={`/plan?f=${slug}`} className="underline underline-offset-2 hover:text-fg">Plan another day →</Link>}>
          {best.data ? <BestWindows best={best.data} now={now} isToday /> : <div className="skeleton h-48 w-full" aria-hidden="true" />}
        </Section>

        <Section title="Hours" aside={status?.text ?? "\u00a0"}>
          {fac ? <HoursTable hours={fac.hours} today={lp.weekday} /> : <div className="skeleton h-48 w-full" aria-hidden="true" />}
          <p className="mt-3 text-xs text-muted">
            Regular hours from the facility page. Holidays, varsity games and bookings can close it; check the{" "}
            <a className="font-medium text-accent underline underline-offset-2" href={scheduleUrl(id)} rel="noopener" target="_blank">
              official calendar<span className="sr-only"> (opens in a new tab)</span> ↗
            </a>{" "}
            or the{" "}
            <a className="underline underline-offset-2 hover:text-fg" href={facilityPageUrl(id)} rel="noopener" target="_blank">
              facility page<span className="sr-only"> (opens in a new tab)</span> ↗
            </a>
            .
          </p>
        </Section>
      </div>

      <Section title="A usual week" aside={weeksOfData > 0 ? `Based on up to ${weeksOfData} of each weekday` : "\u00a0"}>
        {week.data && fac ? (
          weeksOfData > 0 ? (
            <Heatmap week={week.data} max={max} hours={fac.hours} todayWeekday={lp.weekday as Weekday} nowHour={lp.hour} />
          ) : (
            <EmptyState title="No usual week yet">The heatmap fills in as each weekday gets its first full day of counts.</EmptyState>
          )
        ) : (
          <div className="skeleton h-48 w-full" aria-hidden="true" />
        )}
      </Section>

      <Section title="Embed this">
        <p className="mb-2 text-sm text-muted">A live mini card for a club site, Discord dashboard or Notion page.</p>
        <CopySnippet code={embed} label="Embed code" />
      </Section>
    </div>
  );
}
