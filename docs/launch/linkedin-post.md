# LinkedIn post drafts

Status: **drafts. Do not post** until the owner has seen the live site and replaced the placeholders.

Before posting:

- Replace `[LINK]` with the site URL and `[API LINK]` with the docs URL.
- Replace every `[N]` with a real number from the live data. Don't post a made-up stat.
- Attach a phone screenshot of the Live page (it carries most of the reach).
- The author is anonymous. Post from whatever account the owner chooses; nothing below names anyone.
- Each variant is under 1,300 characters including placeholders. Counts are listed under each one.

---

## Variant A: the 6 PM problem

```
Walked to the PAC at 6 PM last week. 70 people in a room built for 75. Walked back.

The occupancy number is public. UW Athletics posts a live count for each gym on warrior.uwaterloo.ca. It just doesn't tell you if that number is normal, if the room is filling up or emptying out, or when it'll be quiet later.

So I built WarriorWatch. It checks that page once a minute and keeps the history.

- Live counts for PAC free weights, functional, cardio, machines, CIF, Warrior Zone and the Esports Lounge on one screen
- How each room compares to a normal [weekday] at this hour, by term
- The quietest times to go today
- Hours for all 44 athletics spaces

For anyone who wants to build on it: every number is free JSON. No key, CORS open. Live counts, history, typical curves and best times. A Discord alert for when free weights drop under 30% is about 20 lines of bash.

Site: [LINK]
API docs: [API LINK]
Code (MIT): github.com/napoleon1313/warriorwatch

Credit to uwpac and PACked, two earlier UW gym trackers that showed this was doable.

If a number looks wrong or you build something with it, tell me.
```

Characters: 1,106 (with placeholders).

---

## Variant B: for builders

```
UW's gym occupancy is now an API.

Athletics already posts live headcounts for 7 rooms at the PAC and CIF. I've been sampling that page once a minute for [N] days and serving it back as JSON:

GET /api/live: every room now, with a quiet/busy label and a 20-minute trend
GET /api/history: past counts, raw or bucketed
GET /api/typical: what a Tuesday usually looks like, by term
GET /api/best: quietest windows for a day
GET /api/facilities: hours for all 44 spaces

No key. CORS open. Rate limit is 60 a minute.

There's also a site on top of it for people who just want to know if the free weights are packed: [LINK]

Why bother: the official page shows one number per room and nothing else. With history you can say "busier than usual" or "quiet from 2 to 3:30 today", and you can build things the portal never will. A Discord alert, a widget for your club's site, a heatmap for your stats project.

Docs: [API LINK]
Code (MIT): github.com/napoleon1313/warriorwatch

Thanks to the people behind uwpac and PACked, who tracked this before I did.
```

Characters: 1,045 (with placeholders).

---

## Variant C: short

```
Is the PAC busy right now? [LINK]

I got tired of walking to the gym to find every bench taken, so I built a tracker for UW's gyms. It reads the public occupancy page every minute and shows:

- live counts for the PAC, CIF, Warrior Zone and Esports Lounge
- whether it's busier than a normal [weekday] at this hour
- the quietest time to go today

The data is also a free API (no key) if you want to build something with it: [API LINK]

Open source, MIT: github.com/napoleon1313/warriorwatch

Built on ideas from uwpac and PACked. Feedback welcome, especially if a number looks off.
```

Characters: 582 (with placeholders).

---

## Notes on the drafts

- The "70 people in a room built for 75" line in Variant A is a placeholder scene. Swap in a real moment from the owner's own week, or a real reading from the history, before posting. If neither exists, cut the first line and start at "The occupancy number is public."
- "[weekday]" should match the day the post goes out, so the claim can be checked against the site that day.
- Hook lines are the first line of each variant. LinkedIn shows about 2 lines before "see more", so the hook and the second line carry the post.
- No tags for UW Athletics. They didn't endorse this and tagging them reads as if they did.
