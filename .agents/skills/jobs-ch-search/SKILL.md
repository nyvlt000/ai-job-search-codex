---
name: jobs-ch-search
version: 1.0.0
description: >
  Use this skill to search live Swiss job listings on jobs.ch (JobCloud),
  especially in Basel and other Swiss cities, or to look up a specific posting.
  Covers any sector (IT, engineering, project management, life sciences, etc.).
  Trigger phrases: jobs.ch, Stellen Basel, Stellensuche Schweiz, offres d'emploi
  Suisse, Swiss jobs, Basel jobs, find a job in Basel, search jobs.ch, look up
  this jobs.ch posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/jobs-ch-search/cli/src/cli.ts *)
---

# jobs.ch Search Skill

Search live job listings on **[jobs.ch](https://www.jobs.ch)** — Switzerland's
major JobCloud board — with **Basel as the headline location**. No authentication,
no API key, and **zero runtime dependencies** — it runs with just `bun`.

The CLI reads public HTML pages only. It never calls the jobs.ch JSON API
(`robots.txt` disallows `/api/` and `/api_proxy/`).

## ⚠️ Personal use only

JobCloud's [terms of use](https://www.jobcloud.ch/c/en/terms/) prohibit crawlers,
scrapers, data-mining tools, and bots. This skill is for **personal job-search
use only**: keep volume low, do not use it commercially or for bulk collection,
and run it on your own responsibility. Prefer a handful of targeted queries over
wide crawls.

## When to use this skill

- Search Swiss openings by keyword and/or city (Basel, Zurich, etc.)
- Filter by recency (`--jobage`, mapped to jobs.ch `publication-date`)
- Switch locale between English, German, and French result pages
- Fetch the full description of a specific jobs.ch vacancy

## Commands

### Search job listings

```bash
bun run .agents/skills/jobs-ch-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, skill, role).
- `--location <text>` / `-l <text>` — Swiss place string, e.g. `"Basel"`,
  `"Basel-Landschaft"`, `"Zurich"`. Omit to search all of Switzerland.
  **Pitfall:** `"Freiburg"` means Fribourg (CH), not Freiburg im Breisgau (DE).
- `--jobage <days>` — posted within N days (positive integer; maps to
  `publication-date`). Verified values include `1`, `3`, `7`, `14`, `30`, `60`.
- `--page <n>` — 1-indexed page (20 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--lang <code>` — `en` (default), `de`, or `fr`.
- `--format json|table|plain` — default `json`.

At least one of `--query` or `--location` is required.

### Fetch full job detail

```bash
bun run .agents/skills/jobs-ch-search/cli/src/cli.ts detail <id|url> [--format json|plain] [--lang en|de|fr]
```

`id` is the UUID from `search` results. You may also pass a full
`/en/vacancies/detail/<uuid>/`, `/de/stellenangebote/detail/<uuid>/`, or
`/fr/offres-emplois/detail/<uuid>/` URL. Returns title, company, location, date,
employment type, description (text), and apply URL.

## Usage examples

```bash
# Project manager roles in Basel, last 14 days
bun run .agents/skills/jobs-ch-search/cli/src/cli.ts search -q "project manager" -l Basel --jobage 14 --format table

# IT project manager, German locale
bun run .agents/skills/jobs-ch-search/cli/src/cli.ts search -q "IT Project Manager" -l Basel --lang de --format table

# Digital transformation / cloud migration programs near Basel
bun run .agents/skills/jobs-ch-search/cli/src/cli.ts search -q "digital transformation" -l Basel --jobage 30

# Contact-center / CCaaS keywords across Switzerland
bun run .agents/skills/jobs-ch-search/cli/src/cli.ts search -q "contact center" --jobage 14 --format table

# Full details for a specific vacancy
bun run .agents/skills/jobs-ch-search/cli/src/cli.ts detail 4be37140-3c52-4075-aaac-4af33fb127e7 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON is `{ "meta": { "count", "page", "totalHits", "numPages" }, "results": [...] }`.
Each result has at least `id`, `title`, `company`, `location`, `date`, and `url`
(missing values are `null`). Extra fields: `workload`, `isNew`, `easyApply`.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## Notes

- Page size is fixed at **20** results per page.
- Switzerland only — jobs.ch will not cover Freiburg im Breisgau (Germany).
- No `sort` parameter is exposed in v1 (portal `sort=` / `order=` did not change ranking in probes).
- `radius=` had no effect in probes and is not offered.
- The CLI retries 429/5xx with exponential backoff. Keep volume low (see ToS note).
- Job IDs are UUIDs — pass them as-is to `detail`.
