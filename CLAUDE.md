# WarriorWatch — conventions for every agent

- Read `docs/PLAN.md` and `packages/contract/src/index.ts` first. The contract is the law; if it must change, change it in a dedicated commit and say so in your final report.
- npm workspaces, Node ≥22, TypeScript strict, ESM. Tests with vitest. No pnpm/bun.
- Stay inside your workspace folder (`apps/worker`, `apps/web`, `packages/analytics`, `docs/launch`) except for the contract rule above and adding your workspace's deps to its own `package.json`.
- Scraping etiquette: one request per minute to `/FacilityOccupancy`, `SOURCE.userAgent`, no parallel hammering of facility pages (sequential, 500 ms apart).
- Timezone is America/Toronto for anything a human sees; store UTC ISO strings.
- Commit small, descriptive messages. Do not push to `main`; you are on your own branch.
