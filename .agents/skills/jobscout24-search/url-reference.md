# JobScout24.ch URL reference

Captured 2026-11-08 during `/add-portal` investigation. Update this file when the portal markup changes.

## Host

`https://www.jobscout24.ch`

## robots.txt (relevant)

Allowed for this skill:
- `/de/jobs/`, `/en/jobs/`
- `/de/job/{uuid}/`, `/en/job/{uuid}/`

Disallowed (never call):
- `/JS24Web/`, `/js24web/`
- `/exportfeed/`
- `/de/account/`, `/en/account/`, apply/customer/cookies paths
- `/app/`, `/aspnet_client/`, `/statistics/`

## Search

**Working pattern (use this):**

```
GET /{lang}/jobs/{encodeURIComponent(query)}/?Actuality={days}&p={page}&o=1
```

Examples:
- `/de/jobs/project%20manager%20Basel/?Actuality=14&o=1`
- `/en/jobs/project%20manager/?Actuality=7`

**Broken / unreliable:**
- `/de/jobs/?q=...&l=Basel` — often ignores filters and returns ~80k unfiltered hits.
- Path `/de/jobs/{query}/basel/` — returned 0 hits in probes.

**Location strategy:** append the place to the keyword (`project manager Basel`) because `?l=` / `Region=` GET params did not reliably filter in probes. Region checkbox value `1` = Nordwestschweiz (AG/BL/BS/SO) exists in the UI but was not effective via simple GET.

**Actuality (job age)** — verified against live totals for `project manager`:

| Actuality | Approx total (probe) |
|-----------|----------------------|
| 1 | 77 |
| 3 | 269 |
| 7 | 540 |
| 14 | 1010 |
| 30 | 1585 |
| 60 | 1972 |
| -1 / omit | all (~2608) |

**Sort:** `o=1` = Aktualität (recency). `o=0` = Bester Treffer.

**Pagination:** `p=2`, `p=3`, … (~25 results/page). Total in `data-total-job-count` on `.result-stats`.

### Result card anchors

```html
<li class="job-list-item"
    data-job-id="10461298"
    data-job-detail-url="/de/job/9501c563-7161-4d8f-aac9-8dcbb4c4cb69/">
  <a class="job-link-detail job-title" title="...">...</a>
  <p class="job-attributes"><span>Company</span>, <span>City</span></p>
  <p class="job-date">3 T</p>  <!-- optional; Top Listings often omit -->
</li>
```

Relative dates: `N T` (Tage), `N W` (Wochen), `N M` (Monate), `Neu`/`New`.

Primary id for the CLI contract: **UUID** from `data-job-detail-url` (detail endpoint requires it).

## Detail

```
GET /{lang}/job/{uuid}/
```

Description and structured fields come from `application/ld+json` `JobPosting` (often inside a JSON array that also contains `BreadcrumbList`). Fields seen: `title`, `description` (HTML), `datePosted`, `jobLocation.address`, `employmentType`, `industry`, `hiringOrganization`.

## Locales

This skill supports **`de` and `en` only**. French (`/fr/`) is intentionally out of scope.

## Terms

JobCloud GTC (covers jobscout24.ch): no crawlers/scrapers/bots. Personal-use-only warning required in SKILL.md.
