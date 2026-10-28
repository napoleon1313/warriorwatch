import type { BestResponse } from "@warriorwatch/contract";
import { formatTime, plural } from "@/lib/time";
import { LabelPill } from "./LabelPill";
import { EmptyState } from "./Notice";

const CONFIDENCE: Record<BestResponse["confidence"], string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

/** Ranked quiet windows. For today, finished windows drop off and a current one is marked "now". */
export function BestWindows({ best, now, isToday }: { best: BestResponse; now: number; isToday: boolean }) {
  const windows = isToday ? best.windows.filter((w) => Date.parse(w.end) > now) : best.windows;
  const basis = `Based on ${plural(best.daysOfData, "day")} of data · ${CONFIDENCE[best.confidence].toLowerCase()}`;
  if (best.windows.length === 0) {
    return (
      <EmptyState title={best.daysOfData < 7 ? "Not enough history yet" : "No quiet stretch expected"}>
        {best.daysOfData < 7
          ? `We've only been counting for ${plural(best.daysOfData, "day")}. Suggestions show up once there's a usual pattern to go on.`
          : "It's usually at least moderately busy whenever it's open on this day, or it's closed."}
      </EmptyState>
    );
  }
  if (windows.length === 0) {
    return <EmptyState title="No quiet windows left today">Try tomorrow, or check the live count before you go.</EmptyState>;
  }
  return (
    <div>
      <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {windows.map((w, i) => {
          const live = isToday && Date.parse(w.start) <= now && Date.parse(w.end) > now;
          return (
            <li key={w.start} className="flex items-center gap-3 bg-card px-3 py-2.5">
              <span className="tnum w-5 text-center text-sm font-semibold text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="tnum text-sm font-semibold">
                  {formatTime(w.start)} – {formatTime(w.end)}
                  {live && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[11px] font-bold text-white dark:text-zinc-950">NOW</span>}
                </p>
                <p className="tnum text-xs text-muted">
                  Usually about {w.expected} {w.expected === 1 ? "person" : "people"} ({w.pct}%)
                </p>
              </div>
              <LabelPill label={w.label} />
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-muted">{basis}. Expected counts, not a promise.</p>
    </div>
  );
}
