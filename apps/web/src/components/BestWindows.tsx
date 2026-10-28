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
      <ol className="divide-y divide-line overflow-hidden rounded-md border border-line">
        {windows.map((w, i) => {
          const live = isToday && Date.parse(w.start) <= now && Date.parse(w.end) > now;
          return (
            <li key={w.start} className="flex items-center gap-3 bg-card px-3 py-2.5">
              <span className="mono w-6 text-center text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <p className="mono text-sm font-semibold">
                  {formatTime(w.start)} – {formatTime(w.end)}
                  {live && <span className="ml-2 rounded border border-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent">NOW</span>}
                </p>
                <p className="mono text-[11px] text-muted">
                  Usually about {w.expected} {w.expected === 1 ? "person" : "people"} ({w.pct}%)
                </p>
              </div>
              <LabelPill label={w.label} />
            </li>
          );
        })}
      </ol>
      <p className="mono mt-2 text-[11px] text-muted">{basis.toLowerCase()} · expected counts, not a promise</p>
    </div>
  );
}
