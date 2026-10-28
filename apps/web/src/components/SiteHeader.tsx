"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "Live", key: "01" },
  { href: "/plan", label: "Plan", key: "02" },
  { href: "/session", label: "Session", key: "03" },
  { href: "/about", label: "About", key: "04" },
];

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-[color:var(--bg)]/85 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--bg)]/70">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:rounded focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight" aria-label="WarriorWatch home">
          <Logo />
          <span className="hidden min-[440px]:inline">
            WarriorWatch<span className="mono ml-1.5 hidden text-[10px] font-medium text-faint sm:inline">v0.1</span>
          </span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-0.5">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-md px-2 py-2 text-sm font-medium transition-colors sm:px-2.5 ${active ? "text-fg" : "text-muted hover:text-fg"}`}
              >
                <span className="mono mr-1 hidden text-[10px] text-faint sm:inline">{n.key}</span>
                {n.label}
                {active && <span aria-hidden="true" className="absolute inset-x-2 -bottom-[13px] h-px bg-accent sm:inset-x-2.5" />}
              </Link>
            );
          })}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--fg)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--bg)" strokeWidth="3.5" opacity="0.25" />
      <circle
        cx="16"
        cy="16"
        r="9"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3.5"
        strokeDasharray="56.5"
        strokeDashoffset="18"
        transform="rotate(-90 16 16)"
      />
      <circle cx="16" cy="16" r="2" fill="var(--bg)" />
    </svg>
  );
}
