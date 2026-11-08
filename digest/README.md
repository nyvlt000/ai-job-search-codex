# Daily job digest

PC-primary LinkedIn + jobs.ch digest for Michal Dub. Emails HTML tables to `md@michaldub.com` via **Resend**.

## Schedule

| Role | Host | When |
|------|------|------|
| Primary | This Windows PC (Task Scheduler `JobSearchDailyDigest`) | 08:00 Europe/Berlin, **WakeToRun** |
| Backup | GitHub Actions on `nyvlt000/ai-job-search-codex` | ~09:30 CET if PC heartbeat missing |

## Setup

1. `jobs-ch-search` lives under `.agents/skills/jobs-ch-search/`.
2. Install Bun CLIs: `bun install` in `linkedin-search/cli` and `jobs-ch-search/cli`.
3. `pip install pyyaml`
4. Set User environment variables (Resend):
   - `RESEND_API_KEY` — API key from https://resend.com/api-keys (`re_...`)
   - `RESEND_FROM` — verified sender, e.g. `Job Digest <noreply@yourdomain.com>`  
     (while testing you can use Resend’s onboarding sender if your account allows it)
5. Register the task (once):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/register_digest_task.ps1
```

6. On GitHub (`nyvlt000/ai-job-search-codex`) add Actions secrets:
   - `RESEND_API_KEY`
   - `RESEND_FROM`
   - `DIGEST_TO` = `md@michaldub.com` (optional; defaults from `digest/config.yaml`)

## Manual runs

```powershell
# Preview only (no email, no seen_jobs update)
py tools/daily_digest.py --dry-run --jobage 3

# Send once via Resend
py tools/daily_digest.py --send --source primary
```

## Quality gates

Both LinkedIn and jobs.ch must return parseable search JSON. Portal failure → `Job digest FAILED …` email and **no** success heartbeat.
