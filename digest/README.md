# Daily job digest

GitHub Actions scrapes **LinkedIn**, **jobs.ch**, and **JobScout24** for Michal Dub and emails HTML tables to `md@michaldub.com` via **Resend**.

## Schedule

| Role | Host | When |
|------|------|------|
| Primary | GitHub Actions (`daily-job-scrape.yml` on `nyvlt000/ai-job-search-codex`) | Cron `0 7 * * *` UTC ≈ **08:00 Europe/Berlin** in winter (09:00 in CEST) |

PC Task Scheduler runners have been removed. Do not re-register `JobSearchDailyDigest`.

## Setup (GitHub)

1. Portal CLIs under `.agents/skills/{linkedin,jobs-ch,jobscout24}-search/`.
2. On the repo, set Actions secrets:
   - `RESEND_API_KEY` — from https://resend.com/api-keys (`re_...`)
   - `RESEND_FROM` — verified sender, e.g. `Job Digest <noreply@yourdomain.com>`
3. Recipient defaults to `md@michaldub.com` (`digest/config.yaml` / workflow `DIGEST_TO`).

## Manual runs (local)

```powershell
# Preview only (no email, no seen_jobs update)
py tools/daily_digest.py --dry-run --jobage 3

# Send once via Resend (needs RESEND_API_KEY + RESEND_FROM in the environment)
py tools/daily_digest.py --send --source primary
```

Or trigger **Actions → Daily job scrape → Run workflow**.

## Quality gates

Every configured portal (LinkedIn, jobs.ch, JobScout24) must return parseable search JSON. Any portal failure → `Job digest FAILED …` email and **no** `seen_jobs` / heartbeat update.
