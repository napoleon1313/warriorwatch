import { busyLabel, type TypicalResponse } from "@warriorwatch/contract";
import type { FacilityHours } from "@warriorwatch/contract";
import { LABEL_TEXT, LABEL_VAR } from "@/lib/labels";
import { rangeFor } from "@/lib/hours";
import { WEEKDAYS, formatMinute, hourTick, type Weekday } from "@/lib/time";

const ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

interface Cell {
  value: number | null;
  open: boolean;
}

function cells(t: TypicalResponse, hours: FacilityHours): Cell[] {
  const r = rangeFor(hours, t.weekday);
  return Array.from({ length: 24 }, (_, h) => {
    const open = !!r && h * 60 + 59 >= r.open && h * 60 < r.close;
    const vals = t.slots.filter((s) => s.minute >= h * 60 && s.minute < h * 60 + 60 && s.median != null).map((s) => s.median!);
    return { value: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, open };
  });
}

/** Usual week, 7 × 24. Colour = the contract's busy label for the average median in that hour. */
export function Heatmap({
  week,
  max,
  hours,
  todayWeekday,
  nowHour,
}: {
  week: TypicalResponse[];
  max: number;
  hours: FacilityHours;
  todayWeekday: Weekday;
  nowHour: number;
}) {
  const byDay = new Map(week.map((t) => [t.weekday, cells(t, hours)]));
  let busiest: { d: Weekday; h: number; v: number } | null = null;
  let quietest: { d: Weekday; h: number; v: number } | null = null;
  for (const [d, row] of byDay) {
    row.forEach((c, h) => {
      if (c.value == null || !c.open) return;
      if (!busiest || c.value > busiest.v) busiest = { d, h, v: c.value };
      if (!quietest || c.value < quietest.v) quietest = { d, h, v: c.value };
    });
  }
  const b = busiest as { d: Weekday; h: number; v: number } | null;
  const q = quietest as { d: Weekday; h: number; v: number } | null;
  const summary = b && q
    ? `Usually busiest ${WEEKDAYS[b.d]} around ${formatMinute(b.h * 60)} (about ${Math.round(b.v)} people). Usually quietest while open: ${WEEKDAYS[q.d]} around ${formatMinute(q.h * 60)} (about ${Math.round(q.v)}).`
    : "Not enough history yet to show a usual week.";

  return (
    <figure className="m-0">
      <div role="img" aria-label={`Heatmap of a usual week. ${summary}`} className="grid grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] gap-[2px] text-[10px] text-muted">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-center leading-4" aria-hidden="true">
            {h % 6 === 0 ? hourTick(h) : ""}
          </span>
        ))}
        {ORDER.map((d) => {
          const row = byDay.get(d);
          return [
            <span key={`l${d}`} className={`self-center pr-1 text-[11px] ${d === todayWeekday ? "font-bold text-fg" : ""}`} aria-hidden="true">
              {WEEKDAYS[d].slice(0, 3)}
            </span>,
            ...Array.from({ length: 24 }, (_, h) => {
              const c = row?.[h];
              const label = c && c.open && c.value != null ? busyLabel(c.value, max, true) : null;
              const isNow = d === todayWeekday && h === nowHour;
              return (
                <span
                  key={`${d}-${h}`}
                  title={
                    c?.open
                      ? `${WEEKDAYS[d]} ${formatMinute(h * 60)}: ${c.value == null ? "no data yet" : `about ${Math.round(c.value)} (${LABEL_TEXT[label!].toLowerCase()})`}`
                      : `${WEEKDAYS[d]} ${formatMinute(h * 60)}: closed`
                  }
                  className={`aspect-square rounded-[3px] ${isNow ? "ring-2 ring-[color:var(--fg)] ring-offset-1 ring-offset-[color:var(--card)]" : ""}`}
                  style={{
                    background: label ? LABEL_VAR[label] : c?.open ? "transparent" : "var(--line)",
                    opacity: label ? 0.88 : c?.open ? 1 : 0.45,
                    outline: c?.open && !label ? "1px dashed var(--line)" : undefined,
                    outlineOffset: -1,
                  }}
                />
              );
            }),
          ];
        })}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {(["quiet", "moderate", "busy", "packed"] as const).map((l) => (
          <span key={l} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: LABEL_VAR[l] }} aria-hidden="true" />
            {LABEL_TEXT[l]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] opacity-45" style={{ background: "var(--line)" }} aria-hidden="true" />
          Closed
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] outline-1 outline-dashed outline-[color:var(--line)]" aria-hidden="true" />
          No data yet
        </span>
      </figcaption>
      <p className="mt-2 text-sm text-muted">{summary}</p>
    </figure>
  );
}
