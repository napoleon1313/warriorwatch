"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { TypicalResponse } from "@warriorwatch/contract";
import { api, USING_MOCK } from "@/lib/api";
import { LIBRARY_HOURS_URL, SLUG_TO_ID, display, facilityPageUrl, isLibrary, isLibraryTotal, libraryOf, scheduleUrl, slugOf, sourcePageUrl, zonesOf } from "@/lib/facilities";
import { openStatus, rangeFor } from "@/lib/hours";
import { usePolling, useNow } from "@/lib/hooks";
import { LABEL_VAR } from "@/lib/labels";
import { SITE_URL } from "@/lib/site";
import { WEEKDAYS, addDays, localParts, plural, relativeAgo, zonedToUtc, type Weekday } from "@/lib/time";
import { BestWindows } from "./BestWindows";
import { CopySnippet } from "./CopySnippet";
import { DayCurve } from "./DayCurve";
import { Heatmap } from "./Heatmap";
import { HoursTable } from "./HoursTable";
import { LabelPill } from "./LabelPill";
import { EmptyState, Notice } from "./Notice";
import { RecentDays } from "./RecentDays";
import { RankBars } from "./RankBars";
import { Ring } from "./Ring";
import { Section } from "./Section";
import { Trend } from "./Trend";
import { WeekMultiples } from "./WeekMultiples";
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
  const recent = usePolling(
    (s) => api.history(slug, zonedToUtc(addDays(today, -6), 0).toISOString(), undefined, "15m", s),
    15 * 60_000,
    `recent:${slug}:${today}`,
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
  const library = isLibrary(id);
  const parentLibrary = libraryOf(id);
  const zones = useMemo(() => {
    if (!isLibraryTotal(id) || !live.data) return [];
    const ids = new Set(zonesOf(id));
    return live.data.facilities.filter((x) => ids.has(x.id));
  }, [id, live.data]);
  const fetchedAt = (library ? live.data?.sources?.waitz?.fetchedAt : null) ?? live.data?.fetchedAt ?? null;
  const vs = f && fetchedAt ? vsUsual(f, fetchedAt) : null;
  const embed = `<iframe src="${SITE_URL}/embed/${slug}" title="${d.title} occupancy" width="320" height="120" style="border:0;border-radius:14px" loading="lazy"></iframe>`;

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="mono flex flex-wrap gap-x-3 text-[11px]">
        <Link href="/" className="text-muted hover:text-fg">
          ← all rooms
        </Link>
        {parentLibrary && (
          <Link href={`/f/${slugOf(parentLibrary)}`} className="text-muted hover:text-fg">
            ← {display(parentLibrary).title}, whole building
          </Link>
        )}
      </nav>

      <header className="panel rise flex items-center gap-4 p-4 sm:p-5">
        {f ? (
          <Ring count={f.count} max={f.max} label={f.label} size={92} />
        ) : (
          <div className="skeleton h-[92px] w-[92px] shrink-0 rounded-full" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{d.where}</p>
          <h1 className="mt-0.5 text-2xl font-semibold leading-tight tracking-tight">{d.title}</h1>
          <p className="mono mt-0.5 text-[11px] text-faint">{fac && fac.name !== d.title ? fac.name : ""}</p>
          <div className="mono mt-2 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {f && <LabelPill label={f.label} size="md" />}
            {f?.open && (
              <span>
                <strong className="text-lg">{f.count}</strong>
                <span className="text-xs text-muted">
                  {" "}
                  / {f.max} · {f.pct}%
                </span>
              </span>
            )}
            {f?.open && <Trend trend={f.trend} />}
            {f && !f.open && status && (
              <span className="text-xs text-muted">
                opens <span className="text-fg">{status.whenText}</span> · {status.inText}
              </span>
            )}
          </div>
        </div>
      </header>

      <div aria-live="polite" className="mono min-h-5 text-[11px] text-muted">
        {f && (
          <p>
            {vs?.sign && <strong className="text-fg">{vs.sign} </strong>}
            {vs ? `${vs.rest} · ` : ""}
            {status ? `${status.text.toLowerCase()} · ` : ""}count updated {relativeAgo(f.lastChange, now)}
            {USING_MOCK && <span className="ml-2 rounded border border-line px-1.5 py-0.5 text-fg">demo data</span>}
          </p>
        )}
      </div>

      {!library && live.data?.stale && <Notice tone="warn">The official page says its numbers are not live right now.</Notice>}
      {library && live.data?.sources?.waitz?.stale && <Notice tone="warn">The library feed hasn&apos;t updated for a while. These numbers may be out of date.</Notice>}

      {isLibraryTotal(id) && (
        <Section eyebrow="01" title="Floor by floor, right now" aside={zones.length ? `${zones.filter((z) => z.open).length}/${zones.length} floors open` : "no floor sensors"}>
          {zones.length === 0 ? (
            <p className="text-sm text-muted">This library reports one number for the whole building.</p>
          ) : zones.some((z) => z.open) ? (
            <RankBars facilities={zones} />
          ) : (
            <p className="text-sm text-muted">All floors closed right now.</p>
          )}
          <p className="mt-3 text-xs text-muted">
            The building total is its own sensor reading, so the floors don&apos;t add up to it exactly.
          </p>
        </Section>
      )}
      {(live.error || history.error) && !live.data && (
        <Notice tone="error" action={<button type="button" className="rounded-md border border-current px-3 py-1 text-sm" onClick={live.refresh}>Try again</button>}>
          Couldn&apos;t reach the WarriorWatch API.
        </Notice>
      )}

      <Section
        eyebrow="02"
        title="Today vs usual"
        aside={typicalToday ? (nToday > 0 ? `usual = ${plural(nToday, dayName)}` : `no usual ${dayName} yet`) : " "}
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
                No full {dayName} seen here yet, so there&apos;s no usual curve to compare against. It fills in after the first week.
              </p>
            )}
            {nToday > 0 && nToday < 4 && (
              <p className="mt-2 text-xs text-muted">Only {plural(nToday, dayName)} so far, so the usual band is wide. It narrows as more weeks come in.</p>
            )}
          </>
        ) : (
          <div className="skeleton h-[250px] w-full" aria-hidden="true" />
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section eyebrow="03" title="Best times today" aside={<Link href={`/plan?f=${slug}`} className="underline underline-offset-2 hover:text-fg">plan another day →</Link>}>
          {best.data ? <BestWindows best={best.data} now={now} isToday /> : <div className="skeleton h-48 w-full" aria-hidden="true" />}
        </Section>

        <Section eyebrow="04" title="Hours" aside={status ? `${status.text.toLowerCase()} · ${status.inText}` : " "}>
          {fac ? <HoursTable hours={fac.hours} today={lp.weekday} /> : <div className="skeleton h-48 w-full" aria-hidden="true" />}
          {library ? (
            <p className="mt-3 text-xs text-muted">
              Regular-term hours. Exam periods, reading week and holidays differ; check the{" "}
              <a className="font-medium text-accent underline underline-offset-2" href={LIBRARY_HOURS_URL} rel="noopener" target="_blank">
                library hours page<span className="sr-only"> (opens in a new tab)</span> ↗
              </a>
              . Seat counts come from{" "}
              <a className="underline underline-offset-2 hover:text-fg" href={sourcePageUrl(id)} rel="noopener" target="_blank">
                Waitz<span className="sr-only"> (opens in a new tab)</span> ↗
              </a>
              , which estimates people from Bluetooth and Wi-Fi signals.
            </p>
          ) : (
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
          )}
        </Section>
      </div>

      <Section eyebrow="05" title="A usual week, day by day" aside={weeksOfData > 0 ? `up to ${weeksOfData} of each weekday` : " "}>
        {week.data && fac ? (
          weeksOfData > 0 ? (
            <WeekMultiples week={week.data} max={max} hours={fac.hours} today={lp.weekday as Weekday} nowMin={lp.minuteOfDay} />
          ) : (
            <EmptyState title="No usual week yet">Fills in as each weekday gets its first full day of counts.</EmptyState>
          )
        ) : (
          <div className="skeleton h-32 w-full" aria-hidden="true" />
        )}
      </Section>

      <Section eyebrow="06" title="Last 7 days, as they happened" aside="actual counts · 15-min">
        {recent.data ? <RecentDays points={recent.data.points} max={max} today={today} /> : <div className="skeleton h-32 w-full" aria-hidden="true" />}
      </Section>

      <Section eyebrow="07" title="Usual week as a grid" aside="hour × weekday · colour = label">
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

      <Section eyebrow="08" title="Embed this">
        <p className="mb-2 text-sm text-muted">A live mini card for a club site, Discord dashboard or Notion page.</p>
        <CopySnippet code={embed} label="Embed code" />
      </Section>
    </div>
  );
}
