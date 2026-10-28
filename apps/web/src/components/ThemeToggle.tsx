"use client";

import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";
const NEXT: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
const ICON: Record<Mode, string> = { system: "◐", light: "☀", dark: "☾" };

/** Inline in <head> so the right theme paints before React loads (no flash). */
export const THEME_SCRIPT = `try{var m=localStorage.getItem("theme")||"system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}`;

function apply(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try {
      setMode((localStorage.getItem("theme") as Mode | null) ?? "system");
    } catch {}
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let m: Mode = "system";
      try {
        m = (localStorage.getItem("theme") as Mode | null) ?? "system";
      } catch {}
      if (m === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const next = NEXT[mode];
  return (
    <button
      type="button"
      onClick={() => {
        setMode(next);
        try {
          localStorage.setItem("theme", next);
        } catch {}
        apply(next);
      }}
      className="ml-1 grid h-9 w-9 place-items-center rounded-md text-base text-muted hover:bg-line hover:text-fg"
      aria-label={`Theme: ${mode}. Switch to ${next}`}
      title={`Theme: ${mode}`}
    >
      <span aria-hidden="true">{ICON[mode]}</span>
    </button>
  );
}
