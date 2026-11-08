#!/usr/bin/env python3
"""Daily LinkedIn + jobs.ch digest orchestrator (quality-gated)."""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "tools"))

from digest_mail import DigestMailError, send_html_email  # noqa: E402


class PortalQualityError(RuntimeError):
    """Raised when a required portal fails quality gates."""


@dataclass
class DigestRow:
    title: str
    location: str
    description: str
    date_posted: str
    company_summary: str
    apply_url: str
    company: str = ""
    portal: str = ""
    id: str = ""


@dataclass
class PortalResult:
    name: str
    ok: bool
    error: Optional[str] = None
    rows: list[DigestRow] = field(default_factory=list)
    searched: int = 0


def load_config(path: Path) -> dict[str, Any]:
    if yaml is None:
        raise RuntimeError("PyYAML is required. Install with: pip install pyyaml")
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def normalize_company(name: str) -> str:
    slug = name.strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-") or "unknown"


def truncate(text: str, max_chars: int) -> str:
    text = re.sub(r"\s+", " ", (text or "").strip())
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "…"


def passes_fit(row: dict[str, Any], keywords: list[str]) -> bool:
    if not keywords:
        return True
    blob = " ".join(
        str(row.get(k) or "") for k in ("title", "company", "location", "description")
    ).lower()
    return any(k.lower() in blob for k in keywords)


def run_bun_cli(cli_rel: str, args: list[str], timeout: int = 120) -> dict[str, Any]:
    cli_path = REPO_ROOT / cli_rel
    if not cli_path.exists():
        raise PortalQualityError(f"CLI not found: {cli_path}")
    cmd = ["bun", "run", str(cli_path), *args]
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError as exc:
        raise PortalQualityError("bun is not installed or not on PATH") from exc
    except subprocess.TimeoutExpired as exc:
        raise PortalQualityError(f"CLI timed out: {' '.join(cmd)}") from exc

    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()
    if proc.returncode != 0:
        raise PortalQualityError(
            f"CLI exit {proc.returncode}: {' '.join(cmd)}\nstdout={stdout[:500]}\nstderr={stderr[:500]}"
        )
    if not stdout:
        raise PortalQualityError(f"CLI returned empty stdout: {' '.join(cmd)}")
    try:
        return json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise PortalQualityError(f"CLI returned non-JSON: {stdout[:300]}") from exc


def load_seen(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"seen": {}}
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    if "seen" not in data:
        data["seen"] = {}
    return data


def save_seen(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def seen_key(url: str, company: str, title: str) -> str:
    if url:
        return url.strip()
    return f"{(company or '').strip().lower()}::{(title or '').strip().lower()}"


def load_company_cache(company: str, ttl_days: int) -> Optional[dict[str, Any]]:
    path = REPO_ROOT / "company_research" / f"{normalize_company(company)}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    fetched = data.get("fetched_date")
    if not fetched:
        return None
    try:
        fetched_d = date.fromisoformat(fetched)
    except ValueError:
        return None
    if date.today() - fetched_d > timedelta(days=ttl_days):
        return None
    return data


def save_company_cache(company: str, summary: str, source_url: str = "") -> dict[str, Any]:
    path = REPO_ROOT / "company_research" / f"{normalize_company(company)}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "company": company,
        "fetched_date": date.today().isoformat(),
        "summary": summary,
        "sources": {
            "website": {"url": source_url, "notes": summary},
            "reviews": {"url": "", "notes": ""},
            "linkedin": {"url": "", "notes": ""},
            "media": {"url": "", "notes": ""},
        },
        "network_contacts_note": "",
    }
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return data


def research_company(company: str, ttl_days: int) -> str:
    if not company or company.lower() in {"unknown", "n/a"}:
        return "Company research unavailable"
    cached = load_company_cache(company, ttl_days)
    if cached:
        return cached.get("summary") or (cached.get("sources") or {}).get("website", {}).get(
            "notes"
        ) or "Company research unavailable"

    query = urllib.parse.quote(f"{company} official website")
    search_url = f"https://duckduckgo.com/html/?q={query}"
    source_url = ""
    summary = "Company research unavailable"
    try:
        req = urllib.request.Request(
            search_url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
                )
            },
        )
        with urllib.request.urlopen(req, timeout=25) as resp:
            page = resp.read().decode("utf-8", errors="replace")
        # Prefer first result link that is not duckduckgo
        for match in re.finditer(r'uddg=([^&"]+)', page):
            candidate = urllib.parse.unquote(match.group(1))
            if "duckduckgo.com" in candidate:
                continue
            source_url = candidate
            break
        if source_url:
            about = _fetch_text(source_url, max_chars=4000)
            if about:
                summary = truncate(about, 400)
            else:
                summary = f"{company}: company website located; summary text unavailable."
        else:
            summary = f"{company}: no reliable company page found in search."
    except Exception:
        summary = "Company research unavailable"

    save_company_cache(company, summary, source_url)
    return summary


def _fetch_text(url: str, max_chars: int = 4000) -> str:
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except Exception:
        return ""
    raw = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", raw)
    text = re.sub(r"(?s)<[^>]+>", " ", raw)
    text = html.unescape(text)
    text = re.sub(r"[ \t\xa0]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text).strip()
    return truncate(text, max_chars)


def fetch_detail(portal: str, cli: str, job_id: str, lang: str = "en") -> dict[str, Any]:
    if portal == "jobs-ch-search":
        return run_bun_cli(cli, ["detail", job_id, "--lang", lang, "--format", "json"])
    return run_bun_cli(cli, ["detail", job_id, "--format", "json"])


def enrich_portal(
    portal_name: str,
    cards: list[dict[str, Any]],
    cfg: dict[str, Any],
    seen: dict[str, Any],
    detail_budget: list[int],
) -> PortalResult:
    conf = cfg["portals"][portal_name]
    cli = conf["cli"]
    lang = conf.get("lang", "en")
    keywords = cfg.get("fit_keywords") or []
    max_desc = int(cfg.get("description_max_chars", 800))
    ttl = int(cfg.get("company_research_ttl_days", 30))
    cap = int(cfg.get("detail_fetch_cap", 30))

    rows: list[DigestRow] = []
    for card in cards:
        title = str(card.get("title") or "").strip()
        company = str(card.get("company") or "").strip()
        url = str(card.get("url") or "").strip()
        location = str(card.get("location") or "").strip()
        date_posted = str(card.get("date") or "").strip()
        job_id = str(card.get("id") or "").strip()
        key = seen_key(url, company, title)
        if key in seen["seen"]:
            continue
        if not passes_fit({**card, "description": ""}, keywords):
            # Still mark as seen? Prefer not — may match later with different framing.
            # Keep unseen so a broader query can surface it; skip for this digest.
            continue

        description = ""
        if detail_budget[0] < cap and job_id:
            try:
                detail = fetch_detail(portal_name, cli, job_id if portal_name == "linkedin-search" else (job_id or url), lang)
                description = truncate(str(detail.get("description") or ""), max_desc)
                if not date_posted:
                    date_posted = str(detail.get("date") or "").strip()
                if not url:
                    url = str(detail.get("url") or "").strip()
                detail_budget[0] += 1
            except PortalQualityError:
                description = ""

        if not description:
            # Quality: included rows need a description. Skip without failing whole run,
            # unless we never get any detail-capable rows — handled by caller.
            continue

        company_summary = research_company(company or "Unknown", ttl)
        row = DigestRow(
            title=title or "(no title)",
            location=location or "(no location)",
            description=description,
            date_posted=date_posted or "(unknown)",
            company_summary=company_summary,
            apply_url=url or "(no url)",
            company=company,
            portal=portal_name,
            id=job_id,
        )
        rows.append(row)
        seen["seen"][key] = {
            "title": title,
            "company": company,
            "url": url,
            "first_seen": date.today().isoformat(),
            "portal": portal_name,
            "status": "digested",
            "source": "cli",
        }

    return PortalResult(name=portal_name, ok=True, searched=len(cards), rows=rows)


def render_table(portal_name: str, rows: list[DigestRow]) -> str:
    label = "LinkedIn" if portal_name.startswith("linkedin") else "jobs.ch"
    parts = [f"<h2>{html.escape(label)}</h2>"]
    if not rows:
        parts.append("<p><em>No new matches today.</em></p>")
        return "\n".join(parts)

    parts.append(
        "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px'>"
    )
    parts.append(
        "<thead><tr>"
        "<th>Job Title</th><th>Job Location</th><th>Job description</th>"
        "<th>Date of posting</th><th>Company Summary</th><th>Link to apply</th>"
        "</tr></thead><tbody>"
    )
    for r in rows:
        parts.append(
            "<tr>"
            f"<td>{html.escape(r.title)}</td>"
            f"<td>{html.escape(r.location)}</td>"
            f"<td>{html.escape(r.description)}</td>"
            f"<td>{html.escape(r.date_posted)}</td>"
            f"<td>{html.escape(r.company_summary)}</td>"
            f"<td><a href='{html.escape(r.apply_url)}'>{html.escape(r.apply_url)}</a></td>"
            "</tr>"
        )
    parts.append("</tbody></table>")
    return "\n".join(parts)


def render_success_email(
    day: str,
    linkedin: PortalResult,
    jobsch: PortalResult,
    source: str,
) -> tuple[str, str]:
    n = len(linkedin.rows) + len(jobsch.rows)
    prefix = "BACKUP — " if source == "backup" else ""
    subject = f"{prefix}Job digest {day} — {n} new (LinkedIn + jobs.ch)"
    body = [
        f"<p>Daily digest for <strong>{html.escape(day)}</strong> "
        f"(source: {html.escape(source)}).</p>",
        f"<p>New roles: <strong>{n}</strong> "
        f"(LinkedIn {len(linkedin.rows)}, jobs.ch {len(jobsch.rows)}).</p>",
        render_table(linkedin.name, linkedin.rows),
        render_table(jobsch.name, jobsch.rows),
    ]
    return subject, "\n".join(body)


def render_failure_email(day: str, errors: list[str], source: str) -> tuple[str, str]:
    reason = errors[0][:80] if errors else "unknown"
    prefix = "BACKUP — " if source == "backup" else ""
    subject = f"{prefix}Job digest FAILED {day} — {reason}"
    items = "".join(f"<li><pre>{html.escape(e)}</pre></li>" for e in errors)
    body = (
        f"<p>Daily digest <strong>failed</strong> for {html.escape(day)} "
        f"(source: {html.escape(source)}).</p>"
        f"<p>Quality gate: both LinkedIn and jobs.ch must succeed.</p>"
        f"<ul>{items}</ul>"
    )
    return subject, body


def write_heartbeat(day: str, dry_run: bool) -> Path:
    hb_dir = REPO_ROOT / "digest_runs"
    hb_dir.mkdir(parents=True, exist_ok=True)
    path = hb_dir / f"{day}.ok"
    if not dry_run:
        path.write_text(
            json.dumps(
                {
                    "date": day,
                    "status": "ok",
                    "written_at": datetime.now(timezone.utc).isoformat(),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    return path


def collect_cards(portal_name: str, cfg: dict[str, Any], jobage: int) -> list[dict[str, Any]]:
    conf = cfg["portals"][portal_name]
    cli = conf["cli"]
    collected: dict[str, dict[str, Any]] = {}
    for q in conf["queries"]:
        args = [
            "search",
            "--query",
            q["query"],
            "--jobage",
            str(jobage),
            "--limit",
            str(q.get("limit", 10)),
            "--format",
            "json",
        ]
        if portal_name == "linkedin-search":
            args.extend(["--location", q["location"]])
            if q.get("remote"):
                args.extend(["--remote", str(q["remote"])])
        else:
            args.extend(["--location", q["location"], "--lang", conf.get("lang", "en")])
        payload = run_bun_cli(cli, args)
        if "results" not in payload or not isinstance(payload["results"], list):
            raise PortalQualityError(f"{portal_name}: invalid search payload")
        for item in payload["results"]:
            url = item.get("url") or ""
            key = url or f"{item.get('company')}|{item.get('title')}|{item.get('id')}"
            collected[key] = item
    return list(collected.values())


def run_digest(
    *,
    config_path: Path,
    dry_run: bool,
    send: bool,
    source: str,
    jobage_override: Optional[int] = None,
) -> int:
    cfg = load_config(config_path)
    day = date.today().isoformat()
    jobage = int(jobage_override if jobage_override is not None else cfg.get("jobage_days", 1))
    email_cfg = cfg.get("email") or {}
    to_addr = email_cfg.get("to") or os.environ.get("DIGEST_TO") or "md@michaldub.com"
    from_addr = os.environ.get("RESEND_FROM") or email_cfg.get("from")
    seen_path = REPO_ROOT / "job_scraper" / "seen_jobs.json"
    seen = load_seen(seen_path)
    errors: list[str] = []

    linkedin_cards: list[dict[str, Any]] = []
    jobsch_cards: list[dict[str, Any]] = []

    try:
        linkedin_cards = collect_cards("linkedin-search", cfg, jobage)
    except PortalQualityError as exc:
        errors.append(f"linkedin-search: {exc}")

    try:
        jobsch_cards = collect_cards("jobs-ch-search", cfg, jobage)
    except PortalQualityError as exc:
        errors.append(f"jobs-ch-search: {exc}")

    if errors:
        subject, body = render_failure_email(day, errors, source)
        out_dir = REPO_ROOT / "digests"
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / f"{day}.failed.html").write_text(body, encoding="utf-8")
        (out_dir / f"{day}.failed.json").write_text(
            json.dumps({"date": day, "errors": errors, "source": source}, indent=2),
            encoding="utf-8",
        )
        if send and not dry_run:
            send_html_email(
                to_addr=to_addr,
                subject=subject,
                html_body=body,
                from_addr=from_addr,
            )
        elif dry_run:
            print(f"[dry-run] would send FAILED: {subject}")
        print("\n".join(errors), file=sys.stderr)
        return 2

    detail_budget = [0]
    linkedin = enrich_portal("linkedin-search", linkedin_cards, cfg, seen, detail_budget)
    jobsch = enrich_portal("jobs-ch-search", jobsch_cards, cfg, seen, detail_budget)

    subject, body = render_success_email(day, linkedin, jobsch, source)
    out_dir = REPO_ROOT / "digests"
    out_dir.mkdir(parents=True, exist_ok=True)
    preview = out_dir / f"{day}.html"
    preview.write_text(body, encoding="utf-8")
    payload = {
        "date": day,
        "source": source,
        "linkedin": {
            "searched": linkedin.searched,
            "new": [asdict(r) for r in linkedin.rows],
        },
        "jobs_ch": {
            "searched": jobsch.searched,
            "new": [asdict(r) for r in jobsch.rows],
        },
    }
    (out_dir / f"{day}.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    if not dry_run:
        save_seen(seen_path, seen)
        write_heartbeat(day, dry_run=False)

    if dry_run:
        print(f"[dry-run] wrote {preview}")
        print(f"[dry-run] subject: {subject}")
        print(f"[dry-run] new rows: linkedin={len(linkedin.rows)} jobs.ch={len(jobsch.rows)}")
        return 0

    if send:
        result = send_html_email(
            to_addr=to_addr,
            subject=subject,
            html_body=body,
            from_addr=from_addr,
        )
        print(f"Sent via Resend: {subject} id={result.get('id', '?')}")
    else:
        print(f"Prepared (not sent): {subject} -> {preview}")
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Daily LinkedIn + jobs.ch digest")
    parser.add_argument(
        "--config",
        default=str(REPO_ROOT / "digest" / "config.yaml"),
        help="Path to digest/config.yaml",
    )
    parser.add_argument("--dry-run", action="store_true", help="Write preview HTML/JSON, no email, no seen update")
    parser.add_argument("--send", action="store_true", help="Send email via Resend API")
    parser.add_argument("--send-once", action="store_true", help="Alias for --send")
    parser.add_argument("--source", default="primary", choices=["primary", "backup"])
    parser.add_argument("--jobage", type=int, default=None, help="Override jobage days")
    args = parser.parse_args(argv)

    send = args.send or args.send_once
    try:
        return run_digest(
            config_path=Path(args.config),
            dry_run=args.dry_run,
            send=send,
            source=args.source,
            jobage_override=args.jobage,
        )
    except DigestMailError as exc:
        print(f"Mail error: {exc}", file=sys.stderr)
        return 3
    except Exception as exc:  # pragma: no cover
        print(f"Fatal: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
