# Search Queries for Job Scraper

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. Shipped country-agnostic CLIs include `linkedin-search` and `freehire-search`; Danish demos and any skill you add with `/add-portal` are included the same way. You do **not** need a matching `site:` line below for those CLIs to run.

The `site:` query templates in this file are the **WebSearch fallback** — for portals without a CLI, company career pages, or when a CLI fails.

## Search Sites

Primary (Freiburg / Basel / remote PM market):
- **linkedin.com/jobs** - LinkedIn job listings (filter: Freiburg, Basel, Germany, Switzerland, Remote); covered by `linkedin-search` CLI
- **freehire.dev** - Aggregated tech roles across ~50 ATS platforms; covered by `freehire-search` CLI
- **jobs.ch** - Swiss job board; covered by `jobs-ch-search` CLI
- **jobscout24.ch** - Swiss JobCloud board (Basel-first, DE/EN); covered by `jobscout24-search` CLI
- **stepstone.de** - German job board (WebSearch fallback)

Secondary (company career pages via Google):
- Direct Google searches with `site:` filters for known target companies

## Query Categories

Queries are grouped by priority. Each query should be combined with location terms (Freiburg, Basel, Germany, Switzerland, Remote) where the site supports it.

### Priority 1: Project / Program Management

These match the strongest and most desired career direction.

```
site:linkedin.com/jobs "Project Manager" Freiburg OR Basel
site:linkedin.com/jobs "Program Manager" Freiburg OR Basel OR Remote
site:linkedin.com/jobs "IT Project Manager" Germany OR Switzerland
site:linkedin.com/jobs "Digital Transformation" "Project Manager" Remote OR Freiburg OR Basel
site:stepstone.de "Projektmanager" IT Freiburg OR Basel
site:jobs.ch "Project Manager" Basel OR Freiburg
site:jobscout24.ch "Project Manager" Basel
```

### Priority 2: Digital Transformation / Cloud / CCaaS Domain

These match core domain expertise from recent Straumann delivery.

```
site:linkedin.com/jobs "cloud migration" "Project Manager" Germany OR Switzerland OR Remote
site:linkedin.com/jobs CCaaS OR "contact center" transformation Project Manager
site:linkedin.com/jobs "conversational AI" OR chatbot "Project Manager" Remote
site:linkedin.com/jobs intranet OR "digital workplace" Project Manager Freiburg OR Basel OR Remote
site:linkedin.com/jobs "Microsoft 365" OR Teams "Project Manager" Germany OR Switzerland
site:stepstone.de "Digital Transformation" Projektmanager
site:jobs.ch "cloud migration" OR "contact center" Project Manager
site:jobscout24.ch "contact center" OR "digital transformation" Basel
```

### Priority 3: Unified Communications / Collaboration (secondary net)

Adjacent roles that leverage the UC engineering and leadership background.

```
site:linkedin.com/jobs "Unified Communications" Manager OR Lead Freiburg OR Basel OR Remote
site:linkedin.com/jobs "Microsoft Teams" Administrator OR Lead Germany OR Switzerland
site:linkedin.com/jobs "Contact Center" Engineer OR Lead Remote OR Basel OR Freiburg
site:linkedin.com/jobs collaboration OR UC "Team Lead" Germany OR Switzerland
site:stepstone.de "Unified Communications" OR Teams Freiburg
site:jobs.ch "Unified Communications" OR "Contact Center" Basel
site:jobscout24.ch "Unified Communications" OR Teams Basel
```

### Priority 4: Broader Technical Program / PMO

Wider net for general technical program roles. Used when the user runs `/scrape broad`.

```
site:linkedin.com/jobs "Technical Program Manager" Remote OR Germany OR Switzerland
site:linkedin.com/jobs PMO "Project Manager" Freiburg OR Basel
site:linkedin.com/jobs "digital strategy" Manager Germany OR Switzerland OR Remote
site:stepstone.de "Technical Program Manager" OR PMO
site:jobs.ch "Program Manager" OR PMO Basel
site:jobscout24.ch "Program Manager" OR PMO Basel
```

## Location Filter

When evaluating results, verify the job location is within acceptable range:
- **Ideal** — Freiburg or Basel (including hybrid)
- **Acceptable** — Remote with DE/CH presence, or commutable Upper Rhine corridor
- **Borderline** — On-site elsewhere in Baden-Württemberg or northwest Switzerland with partial remote
- **Too far** — On-site outside the Freiburg/Basel corridor with no remote option

## Date Filter

Only include jobs posted within the last 14 days, or with an application deadline that has not yet passed. If a posting date cannot be determined, include it but flag as "date unknown".

## Adapting Queries

If the user specifies a focus area, select queries from the matching category and also generate 2-3 custom queries for that focus. For example:
- "/scrape contact center" -> Priority 2 CCaaS queries + custom conversational AI / CX queries
- "/scrape teams" or "/scrape uc" -> Priority 3 UC/Teams queries + custom collaboration leadership queries
- "/scrape broad" -> all four priority categories
