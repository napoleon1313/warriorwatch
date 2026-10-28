import type { ReactNode } from "react";

/** Pass `aside="\u00a0"` while its text is loading to reserve the line. */
export function Section({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  const hid = id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section aria-labelledby={hid} className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      {/* On phones the aside always gets its own line, so late-loading text never reflows the section. */}
      <div className="mb-3 flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-3">
        <h2 id={hid} className="text-base font-semibold">
          {title}
        </h2>
        {aside !== undefined && <div className="min-h-4 text-xs text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
