import type { BusyLabel } from "@warriorwatch/contract";
import { LABEL_PILL, LABEL_TEXT } from "@/lib/labels";

export function LabelPill({ label, className = "" }: { label: BusyLabel; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${LABEL_PILL[label]} ${className}`}>
      {LABEL_TEXT[label]}
    </span>
  );
}
