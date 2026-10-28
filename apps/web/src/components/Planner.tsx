"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LIVE_SLUGS, SLUG_TO_ID, display } from "@/lib/facilities";
import { rangeFor } from "@/lib/hours";
import { usePolling, useNow } from "@/lib/hooks";
import { WEEKDAYS, addDays, formatYmd, localParts, plural, weekdayOf } from "@/lib/time";
import { BestWindows } from "./BestWindows";
import { DayCurve } from "./DayCurve";
import { Section } from "./Section";

export function Planner() {
  const now = useNow(60_000);
  const today = localParts(now).ymd;
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const [slug, setSlug] = useState(LIVE_SLUGS[0]!);
  const [day, setDay] = useState(today);

  // Read ?f=&d= once on load; keep the URL in sync so a plan can be shared.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const f = q.get("f");
    const d = q.get("d");
    if (f && LIVE_SLUGS.includes(f)) setSlug(f);
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDay(d);
  }, []);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    q.set("f", slug);
    if (day === today) q.delete("d");
    else q.set("d", day);
    history.replaceState(null, "", `?${q.toString()}`);
  }, [slug, day, today]);

  const weekday = weekdayOf(day);
  const best = usePolling((s) => api.best(slug, day, s), null, `best:${slug}:${day}`);
  const typical = usePolling((s) => api.typical(slug, weekday, s), null, `typical:${slug}:${weekday}`);
  const facilities = usePolling((s) => api.facilities(s), null, "facilities");
  const fac = facilities.data?.facilities.find((f) => f.id === SLUG_TO_ID[slug]);
  const n = Math.max(0, ...(typical.data?.slots.map((s) => s.n) ?? [0]));
  const isToday = day === today;
  const dayLabel = isToday ? "today" : day === addDays(today, 1) ? "tomorrow" : WEEKDAYS[weekday];

  const highlights =
    best.data?.windows.map((w) => ({
      from: localParts(w.start).minuteOfDay,
      to: localParts(w.end).minuteOfDay || 1440,
    })) ?? [];

  return (
    <div className="space-y-4">
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()} aria-label="Pick a facility and day">
        <div>
          <label htmlFor="facility" className="eyebrow mb-1.5 block">
            where
          </label>
          <select
            id="facility"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="h-11 w-full rounded-md border border-line bg-card px-3 text-base sm:max-w-sm"
          >
            {LIVE_SLUGS.map((s) => {
              const d = display(SLUG_TO_ID[s]!);
              return (
                <option key={s} value={s}>
                  {d.title} ({d.where})
                </option>
              );
            })}
          </select>
        </div>
        <fieldset className="min-w-0">
          <legend className="eyebrow mb-1.5">when</legend>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {days.map((d, i) => {
              const checked = d === day;
              const wd = weekdayOf(d);
              const closed = fac ? !rangeFor(fac.hours, wd) : false;
              return (
                <label
                  key={d}
                  className={`mono relative flex min-w-[4.5rem] shrink-0 cursor-pointer flex-col items-center rounded-md border px-3 py-2 text-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[color:var(--accent)] ${
                    checked ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-muted hover:text-fg"
                  }`}
                >
                  <input type="radio" name="day" value={d} checked={checked} onChange={() => setDay(d)} className="sr-only" />
                  <span className="font-semibold">{i === 0 ? "Today" : i === 1 ? "Tmrw" : WEEKDAYS[wd].slice(0, 3)}</span>
                  <span className="text-[10px] opacity-80">{closed ? "Closed" : formatYmd(d).split(", ")[1]}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </form>

      <Section
        eyebrow="02"
        title={`Quietest times ${dayLabel}`}
        aside={n > 0 ? `Usual ${WEEKDAYS[weekday]} = ${plural(n, WEEKDAYS[weekday])} of data` : "\u00a0"}
      >
        <div aria-live="polite">
          {best.data ? (
            <BestWindows best={best.data} now={now} isToday={isToday} />
          ) : best.error ? (
            <p className="text-sm text-muted">Couldn&apos;t load suggestions. Try again in a minute.</p>
          ) : (
            <div className="skeleton h-60 w-full" aria-hidden="true" />
          )}
        </div>
      </Section>

      <Section eyebrow="03" title={`A usual ${WEEKDAYS[weekday]}`}>
        {typical.data && fac ? (
          n > 0 ? (
            <DayCurve
              points={[]}
              typical={typical.data.slots}
              max={fac.maxOccupancy ?? 0}
              hours={rangeFor(fac.hours, weekday)}
              now={now}
              weekdayName={WEEKDAYS[weekday]}
              highlights={highlights}
              planning
              height={180}
            />
          ) : (
            <p className="text-sm text-muted">No {WEEKDAYS[weekday]} data yet.</p>
          )
        ) : (
          <div className="skeleton h-[220px] w-full" aria-hidden="true" />
        )}
      </Section>
    </div>
  );
}
