"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "Live" },
  { href: "/plan", label: "Plan" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-[color:var(--bg)]/85 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--bg)]/70">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:rounded focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" aria-label="WarriorWatch home">
          <Logo />
          <span>WarriorWatch</span>
        </Link>
        <nav aria-label="Main" className="flex items-center">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-2.5 text-sm font-medium ${active ? "text-fg" : "text-muted hover:text-fg"}`}
              >
                {n.label}
              </Link>
            );
          })}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#4c1d95" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="#3b2a6b" strokeWidth="4" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="#fbbf24" strokeWidth="4" strokeLinecap="round" strokeDasharray="56.5" strokeDashoffset="20" transform="rotate(-90 16 16)" />
    </svg>
  );
}
