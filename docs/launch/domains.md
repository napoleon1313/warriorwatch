# Domain shortlist

Checked **2026-10-28, 06:07 UTC** from the shell. Method: RDAP via `https://rdap.org/domain/<name>`, which redirects to the registry that runs each TLD. A 404 from the registry means no registration exists. The `.com` and `.ca` results were cross-checked with `whois`. `.app`, `.dev` and `.live` have no port-43 whois server, so RDAP is the only check for those.

"Not registered" means nobody holds it today. It doesn't guarantee a price: some registries mark short or popular names as premium. Confirm the price at the registrar before buying. Nothing has been bought.

| # | Domain | Result | Evidence | Notes |
|---|---|---|---|---|
| 1 | `warriorwatch.ca` | **Taken** | RDAP 200 from CIRA: registered 2019-03-21, expires 2027-03-21, transfer locked | Someone else's. Skip. |
| 2 | `warriorwatch.app` | Not registered | `pubapi.registry.google` RDAP 404 | `.app` forces HTTPS (HSTS preload), fine on Cloudflare Pages |
| 3 | `warriorwatch.dev` | Not registered | `pubapi.registry.google` RDAP 404 | Same HSTS rule. Reads as a dev tool more than a student site |
| 4 | `warriorwatch.live` | Not registered | `rdap.identitydigital.services` RDAP 404 | "live" fits the product; less familiar TLD |
| 5 | `isthepacbusy.com` | Not registered | Verisign RDAP 404; whois "No match" | Says the question people ask. Doesn't mention CIF |
| 6 | `howbusyisthepac.com` | Not registered | Verisign RDAP 404; whois "No match" | Longer version of #5 |
| 7 | `pacorcif.com` | Not registered | Verisign RDAP 404; whois "No match" | Short, names both buildings. Needs a second to parse |
| 8 | `uwgym.ca` | Not registered | CIRA RDAP 404; whois "Not found" | Plain. `.ca` needs a Canadian Presence Requirement declaration, which a UW student meets |

## Recommendation

`isthepacbusy.com` for the launch link. The URL is the question the site answers, so it explains itself in a group chat before anyone clicks. Buy `warriorwatch.app` too if the project name stays, and redirect it.

## Before buying

- **The "Warriors" name.** "Waterloo Warriors" is UW Athletics' brand. A domain with "warrior" in it can read as official. The README already says the project is unaffiliated; a neutral domain like #5 or #8 avoids the question. If Athletics objects to the name, renaming is cheaper before the domain is bought.
- **Privacy.** The author is anonymous. Use the registrar's WHOIS privacy (Cloudflare Registrar includes it at cost price, and `.ca` hides individual registrants by default). Register under the project's contact, not a personal name.
- **Cloudflare Registrar** sells `.com`, `.app` and `.dev`; check its TLD list for `.live`. I don't think it sells `.ca`, which needs a CIRA-certified registrar. Confirm both at purchase time.

## Re-run the check

```bash
for d in warriorwatch.ca warriorwatch.app warriorwatch.dev warriorwatch.live \
         isthepacbusy.com howbusyisthepac.com pacorcif.com uwgym.ca; do
  printf '%-22s ' "$d"
  curl -s -L -o /dev/null -w '%{http_code}\n' "https://rdap.org/domain/$d"
done
# 200 = registered, 404 = not registered
```
