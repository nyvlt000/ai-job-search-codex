# jobs.ch URL Reference

Public HTML pages used by this skill. No authentication. **Never** call
`/api/` or `/api_proxy/` — both are disallowed by `robots.txt`.

> Personal use only — JobCloud terms prohibit crawlers/scrapers; keep volume low.
> https://www.jobcloud.ch/c/en/terms/

## Search

```
GET https://www.jobs.ch/{lang-path}/?term=...&location=...&publication-date=N&page=N
```

Locale paths:

| Lang | Path |
|------|------|
| `en` | `/en/vacancies/` |
| `de` | `/de/stellenangebote/` |
| `fr` | `/fr/offres-emplois/` |

Query params:

| Param | Meaning | Example |
|-------|---------|---------|
| `term` | Free-text query | `project manager` |
| `location` | Swiss place string | `Basel` · `Basel-Landschaft` · `Zurich` |
| `publication-date` | Posted-within window (days) | `1`, `3`, `7`, `14`, `30`, `60` (others may work) |
| `page` | 1-indexed page (20/page) | `1`, `2`, … |

Returns HTML. The page embeds an inline script with `__INIT__ = {...}`. Results
live at `vacancy.results.main.results[]`; paging meta at
`vacancy.results.main.meta` (`totalHits`, `numPages`, `baseOptions.rows=20`).

Per-result fields used by the CLI: `id` (UUID), `title`, `company.name`,
`place`, `publicationDate`, `initialPublicationDate`, `employmentGrades`,
`isNew`, `listingTags` (`easyApply` / `quickApply`).

### Parsing recipe

1. Locate the `<script>` that contains `"vacancy":{"query"`.
2. Balanced-brace slice (string/escape-aware) of the `__INIT__ =` assignment.
3. Optionally replace `:undefined` with `:null` before `JSON.parse`.
4. Map each entry independently so one bad card cannot break the rest.
5. Fallback: split on `data-cy="job-link"` anchors and recover `id` / `title` / `url`.

## Detail

```
GET https://www.jobs.ch/{lang-path}/detail/{uuid}/
```

Canonical form only: trailing slash, **no** query string, **no** extra path
segments. `robots.txt` disallows `/en/vacancies/detail/*/*/*` (three path
segments after `detail`), so never append slugs or tracking paths.

The page embeds `application/ld+json` with `@type: JobPosting`:

| Field | Use |
|-------|-----|
| `title` | Job title |
| `description` | HTML description (strip tags, keep paragraph breaks) |
| `datePosted` | ISO date |
| `hiringOrganization.name` / `.sameAs` | Company |
| `jobLocation.address` | Place |
| `employmentType` | Employment type |
| `workHours` | Workload / hours |
| `industry` | Industry |
| `skills` | Skills |
| `baseSalary` | Optional salary |

## robots.txt constraints (relevant)

- Disallow: `/api/`, `/api_proxy/`, `/*?*feat=`
- Disallow: `/en/vacancies/detail/*/*/*` (and DE/FR equivalents)
- Allow (used by this skill): `/en/vacancies/?…`, `/en/vacancies/detail/<uuid>/`

## Notes

- `radius=` had no observable effect in probes — not exposed.
- `sort=` / `order=` did not change ranking in probes — not exposed.
- `"Freiburg"` resolves to Fribourg (CH), not Freiburg im Breisgau (DE).
