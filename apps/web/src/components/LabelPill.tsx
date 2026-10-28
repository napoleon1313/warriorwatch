import type { BusyLabel } from "@warriorwatch/contract";
import { LABEL_TEXT, LABEL_VAR } from "@/lib/labels";

/** Status chip: colour dot + mono uppercase word. Neutral background so it never shouts. */
export function LabelPill({ label, className = "", size = "sm" }: { label: BusyLabel; className?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={`mono inline-flex items-center gap-1.5 rounded-md border border-line bg-card-2 ${
        size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]"
      } font-medium uppercase tracking-[0.08em] text-fg ${className}`}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: LABEL_VAR[label], boxShadow: label === "closed" ? undefined : `0 0 0 3px color-mix(in oklab, ${LABEL_VAR[label]} 25%, transparent)` }}
      />
      {LABEL_TEXT[label]}
    </span>
  );
}
