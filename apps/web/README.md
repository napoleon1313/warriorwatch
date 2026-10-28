# apps/web — Agent C

Next.js 15 (App Router, static export where possible) + Tailwind + a small chart lib (uPlot or Recharts). Deployed to Cloudflare Pages. Reads only the public API in `packages/contract/API.md`; until the worker exists, run against `src/mock/` fixtures generated from the contract types.

Pages: `/` Live, `/f/[slug]` facility detail, `/plan` best time, `/about` (+ API docs rendered from `packages/contract/API.md`), `/embed/[slug]` widget, `/og/[slug]` OpenGraph image.

Design bar: Waitz-level. Mobile-first, dark mode, PWA manifest + install prompt, Lighthouse ≥95 mobile. Labels and colours come from `busyLabel()` in the contract, never redefined. Show honesty cues everywhere: "based on N Tuesdays", "updated X min ago" from `lastChange`, "closed" state from hours. No fake precision.

## Done when
`npm run build` succeeds, all pages render on phone width with mock data, switching `NEXT_PUBLIC_API_BASE` to a real worker URL needs no code change.
