# Draft issue for pauligwe/PACked

Status: **draft, not posted.** Post only after the owner has seen the site and approves.
Where: https://github.com/pauligwe/PACked/issues/new
Post from the project account (`napoleon1313`), not a personal one.

Context for the owner: PACked commits `occupancy.db` to its repo and has no LICENSE file. Without a licence, the default is all rights reserved, so we can read it but should not republish it. `scripts/import-packed.ts` is ready and dry-runs by default. Do not run it with `--out` against production until the author says yes in writing (the issue thread counts).

What the file holds (checked 2026-10-28): 14,701 readings, 6 facilities, 2026-03-12 to 2026-04-08 UTC, one sample every 15 minutes.

---

**Title:** Permission to use occupancy.db as seed history (with credit)

Hi! I'm a UW student building WarriorWatch, an open-source tracker for PAC and CIF occupancy: https://github.com/napoleon1313/warriorwatch

It samples the same `warrior.uwaterloo.ca/FacilityOccupancy` page once a minute and uses the history to show what each gym usually looks like at a given hour, per term. The weak spot is the first few weeks, when there isn't enough history for those curves.

Your repo has `occupancy.db` with about 4 weeks of 15-minute samples from March and April 2026. Would you be OK with us importing it as seed history?

If yes:

- We'd credit PACked by name with a link in the README, on the site's About page and in the API docs, and mark the imported rows' date range as coming from PACked.
- We'd only use the counts and timestamps (facility, time, count, max). No code.
- It'd help a lot if you added a licence to the repo (MIT or CC BY 4.0 for the data would both work), or just replied here saying it's fine. Either works for us.

If you'd rather we didn't, no problem at all, and we'll still credit PACked as prior work.

Thanks for building it. The class-schedule recommender is a good idea.
