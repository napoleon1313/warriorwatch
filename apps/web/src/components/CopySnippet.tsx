"use client";

import { useState } from "react";

export function CopySnippet({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-[color:var(--bg)] p-3 pr-20 text-xs leading-relaxed" aria-label={label}>
        <code>{code}</code>
      </pre>
      <button
        type="button"
        className="absolute right-2 top-2 rounded-md border border-line bg-card px-2.5 py-1 text-xs font-medium hover:border-[color:var(--muted)]"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
      >
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}
