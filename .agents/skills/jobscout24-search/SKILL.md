---
name: jobscout24-search
version: 1.0.0
description: >
  Use this skill to search live Swiss job listings on JobScout24.ch (JobCloud),
  especially in Basel and northwest Switzerland, or to look up a specific posting.
  Covers DE/EN locales only (French listings intentionally excluded). Trigger
  phrases: JobScout24, jobscout24.ch, Stellen Basel JobScout, Swiss JobScout,
  find a job on JobScout24, look up this JobScout24 posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/jobscout24-search/cli/src/cli.ts *)
---

# JobScout24 Search Skill

Search live job listings on **[JobScout24.ch](https://www.jobscout24.ch)** — a
JobCloud Swiss board — with **Basel as the headline location**. No authentication,
no API key, and **zero runtime dependencies** — it runs with just `bun`.

The CLI reads public HTML pages only. Locales supported: **German and English**.
French (`/fr/`) listings are intentionally unsupported.

## ⚠️ Personal use only

JobCloud's [terms of use](https://www.jobcloud.ch/c/en/terms/) prohibit crawlers,
scrapers, data-mining tools, and bots (JobScout24 is a JobCloud platform alongside
jobs.ch). This skill is for **personal job-search use only**: keep volume low, do
not use it commercially or for bulk collection, and run it on your own
responsibility. Prefer a handful of targeted queries over wide crawls.

## When to use this skill

- Search Swiss openings by keyword and/or city (Basel-first)
- Filter by recency (`--jobage` → portal `Actuality`)
- Switch between German and English result pages
- Fetch the full description of a specific JobScout24 vacancy by UUID

## Commands

### Search job listings

```bash
bun run .agents/skills/jobscout24-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, skill, role).
- `--location <text>` / `-l <text>` — Swiss place, e.g. `"Basel"`. Appended to
  the keyword path because JobScout24's `?l=` query parameter is unreliable.
- `--jobage <days>` — posted within N days (maps to `Actuality`). Verified:
  `1`, `3`, `7`, `14`, `30`, `60`.
- `--page <n>` — 1-indexed page (~25 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--lang <code>` — `de` (default) or `en`. **`fr` is rejected.**
- `--format json|table|plain` — default `json`.

At least one of `--query` or `--location` is required.

### Fetch full job detail

```bash
bun run .agents/skills/jobscout24-search/cli/src/cli.ts detail <uuid|url> [--format json|plain] [--lang en|de]
```

`uuid` is the id from `search` results (from `data-job-detail-url`). You may also
pass a full `/de/job/<uuid>/` or `/en/job/<uuid>/` URL. Numeric `data-job-id`
values alone are not enough for detail.

## Usage examples

```bash
# Project manager roles near Basel, last 14 days
bun run .agents/skills/jobscout24-search/cli/src/cli.ts search -q "project manager" -l Basel --jobage 14 --format table

# German keywords
bun run .agents/skills/jobscout24-search/cli/src/cli.ts search -q "IT Projektmanager" -l Basel --lang de --jobage 7

# Digital transformation programs
bun run .agents/skills/jobscout24-search/cli/src/cli.ts search -q "digital transformation" -l Basel --jobage 30

# Full details for a specific vacancy
bun run .agents/skills/jobscout24-search/cli/src/cli.ts detail 9501c563-7161-4d8f-aac9-8dcbb4c4cb69 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing UUIDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON is `{ "meta": { "count", "page", "totalHits", "numPages" }, "results": [...] }`.
Each result has at least `id`, `title`, `company`, `location`, `date`, and `url`
(missing values are `null`). Extra fields: `workload`, `isNew`, `numericId`.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## Notes

- Working search pattern: `/{lang}/jobs/{encodedQuery}/?Actuality=&p=&o=1`.
  The `?q=&l=` query-string style often ignores filters and returns the whole board.
- Location is folded into the keyword path (`project manager Basel`) for better
  relevance; still verify locations in results (toplistings can be off-city).
- Relative list dates (`3 T`, `1 W`) are converted to approximate `YYYY-MM-DD`.
- Page size is about **25** listings (+ occasional Top Listings without dates).
- Switzerland only. JobScout24 will not cover Freiburg im Breisgau (Germany).
- Never hit robots-disallowed `/JS24Web/`, `/exportfeed/`, account, or apply paths.
- The CLI retries 429/5xx with exponential backoff. Keep volume low (see ToS note).
