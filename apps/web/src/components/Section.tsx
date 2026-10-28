import type { ReactNode } from "react";

/**
 * Panel with a mono eyebrow ("02 · TODAY") and a sentence-case title.
 * Pass `aside=" "` while its text is loading to reserve the line.
 */
export function Section({
  title,
  eyebrow,
  aside,
  children,
  id,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  aside?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const hid = id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section aria-labelledby={hid} className={`panel p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-3">
        <div className="flex items-baseline gap-2">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 id={hid} className="text-[15px] font-semibold tracking-tight">
            {title}
          </h2>
        </div>
        {aside !== undefined && <div className="mono min-h-4 text-[11px] text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
