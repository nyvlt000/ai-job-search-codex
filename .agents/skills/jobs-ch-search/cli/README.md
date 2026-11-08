# jobs-ch-cli

CLI for searching Swiss jobs on [jobs.ch](https://www.jobs.ch) (JobCloud),
with **Basel** as the headline location.

**Data source**: public jobs.ch HTML pages (`/en/vacancies/`, `/de/stellenangebote/`,
`/fr/offres-emplois/` and their `detail/<uuid>/` pages). Parses the embedded
`__INIT__` state blob and schema.org `JobPosting` JSON-LD.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** JobCloud's terms of use prohibit crawlers, scrapers,
> data-mining tools, and bots. Keep volume low, don't use it commercially or for
> bulk collection, and run it on your own responsibility.
> https://www.jobcloud.ch/c/en/terms/

This CLI never calls `/api/` or `/api_proxy/` (disallowed by robots.txt).

## Installation

```bash
cd .agents/skills/jobs-ch-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (requires `--query` and/or `--location`) |
| `detail` | Fetch full detail for a single vacancy by UUID or URL |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Project manager roles in Basel, last 14 days
bun run src/cli.ts search -q "project manager" -l Basel --jobage 14 --format table

# German-locale IT project manager search
bun run src/cli.ts search -q "IT Project Manager" -l Basel --lang de --format table

# Full detail for one vacancy
bun run src/cli.ts detail 4be37140-3c52-4075-aaac-4af33fb127e7 --format plain
```

See `../SKILL.md` for the full flag reference and the Terms-of-Service note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (title / skill / role). |
| `--location` | `-l` | Swiss place, e.g. `"Basel"`. Omit for all Switzerland. |
| `--jobage` | | Posted within N days (`publication-date`). Positive integer. |
| `--page` | | 1-indexed page (20 results/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--lang` | | `en` \| `de` \| `fr`. Default `en`. |
| `--format` | | `json` \| `table` \| `plain`. |
