import type { ReactNode } from "react";

const TONE = {
  info: "border-line bg-card text-fg",
  warn: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100",
  error: "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-100",
};

export function Notice({ tone = "info", children, action }: { tone?: keyof typeof TONE; children: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === "info" ? "status" : "alert"} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm ${TONE[tone]}`}>
      <div>{children}</div>
      {action}
    </div>
  );
}

/** For sections that have nothing honest to show yet. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{children}</p>}
    </div>
  );
}
