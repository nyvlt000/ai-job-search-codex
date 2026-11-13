#!/usr/bin/env python3
"""Daily multi-portal job digest orchestrator (quality-gated).

Configured portals (see digest/config.yaml): LinkedIn, jobs.ch, JobScout24.
Primary runner: GitHub Actions. Emails via Resend (RESEND_API_KEY / RESEND_FROM).
"""

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
    skipped_location: int = 0
    skipped_title: int = 0


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


def normalize_fit_text(text: str) -> str:
    """Lowercase and flatten spelling variants before keyword matching.

    German gender markers are dropped ("Projektmanager:in" -> "projektmanager")
    and hyphens become spaces ("IT-Projektleiter" -> "it projektleiter"), so one
    keyword covers every spelling of the same title.
    """
    text = (text or "").lower()
    text = re.sub(r"[:*/_]in(?:nen)?\b", "", text)
    text = re.sub(r"[-\u2010-\u2015]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def passes_fit(row: dict[str, Any], keywords: list[str]) -> bool:
    """True when a keyword appears as whole words in the row text.

    Whole-word matching keeps "it projektmanager" from matching
    "Audit Projektmanager"; a trailing -in / -innen / -s is still accepted.
    """
    if not keywords:
        return True
    blob = normalize_fit_text(
        " ".join(
            str(row.get(k) or "")
            for k in ("title", "company", "location", "description")
        )
    )
    for keyword in keywords:
        needle = normalize_fit_text(str(keyword))
        if not needle:
            continue
        pattern = rf"(?<!\w){re.escape(needle)}(?:in|innen|s)?(?!\w)"
        if re.search(pattern, blob):
            return True
    return False


def location_allowed(location: str, cfg: dict[str, Any]) -> bool:
    """True when the job location passes digest/config.yaml `location_filter`.

    No filter configured -> everything passes. With a filter, a job needs a
    non-empty location that matches an `allow` pattern and no `deny` pattern.
    `ignore` strings are removed first, so a region name such as the canton
    "Basel-Country" does not count as the city of Basel.
    """
    lf = cfg.get("location_filter")
    if not lf:
        return True
    text = (location or "").strip().lower()
    if not text:
        return False
    for token in lf.get("ignore") or []:
        text = text.replace(str(token).lower(), " ")
    if any(re.search(str(p), text, re.IGNORECASE) for p in lf.get("deny") or []):
        return False
    return any(re.search(str(p), text, re.IGNORECASE) for p in lf.get("allow") or [])


def search_phrases(cfg: dict[str, Any]) -> list[str]:
    """Unique search phrases from config, in first-seen order."""
    phrases: list[str] = []
    for conf in (cfg.get("portals") or {}).values():
        for q in conf.get("queries") or []:
            p = str(q.get("query") or "").strip()
            if p and p not in phrases:
                phrases.append(p)
    return phrases


def fit_keyword_list(cfg: dict[str, Any]) -> list[str]:
    """Prefer exact configured phrases, then extra fit_keywords anchors."""
    phrases = [p.lower() for p in search_phrases(cfg)]
    extras = [
        str(k).strip().lower()
        for k in (cfg.get("fit_keywords") or [])
        if str(k).strip()
    ]
    out = list(phrases)
    for k in extras:
        if k not in out:
            out.append(k)
    return out


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


PORTAL_LABELS = {
    "linkedin-search": "LinkedIn",
    "jobs-ch-search": "jobs.ch",
    "jobscout24-search": "JobScout24",
}

# Portals whose detail CLI takes --lang.
LANG_DETAIL_PORTALS = frozenset({"jobs-ch-search", "jobscout24-search"})


def portal_label(portal_name: str) -> str:
    return PORTAL_LABELS.get(portal_name, portal_name)


def fetch_detail(portal: str, cli: str, job_id: str, lang: str = "en") -> dict[str, Any]:
    if portal in LANG_DETAIL_PORTALS:
        return run_bun_cli(cli, ["detail", job_id, "--lang", lang, "--format", "json"])
    return run_bun_cli(cli, ["detail", job_id, "--format", "json"])


def portal_detail_cap(cfg: dict[str, Any], portal_name: str) -> int:
    per = cfg.get("detail_fetch_cap_per_portal") or {}
    if portal_name in per:
        return int(per[portal_name])
    return int(cfg.get("detail_fetch_cap", 30))


def enrich_portal(
    portal_name: str,
    cards: list[dict[str, Any]],
    cfg: dict[str, Any],
    seen: dict[str, Any],
) -> PortalResult:
    """Enrich one portal with its own detail-fetch budget (no cross-portal starvation)."""
    conf = cfg["portals"][portal_name]
    cli = conf["cli"]
    lang = conf.get("lang", "en")
    keywords = fit_keyword_list(cfg)
    max_desc = int(cfg.get("description_max_chars", 800))
    ttl = int(cfg.get("company_research_ttl_days", 30))
    cap = portal_detail_cap(cfg, portal_name)
    used = 0
    skipped_location = 0
    skipped_title = 0

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

        # Hard location gate: portals return the wider region (or the whole
        # world for remote searches), so every result is checked here.
        if not location_allowed(location, cfg):
            skipped_location += 1
            continue

        # Title must match a configured phrase/keyword first — description-only
        # hits (e.g. "Kundenkontakt" in sales ads) are too noisy for digests.
        title_fit = passes_fit(
            {"title": title, "company": "", "location": "", "description": ""},
            keywords,
        )
        if not title_fit:
            skipped_title += 1
            continue

        description = ""
        if used < cap and job_id:
            try:
                detail = fetch_detail(
                    portal_name,
                    cli,
                    job_id if portal_name == "linkedin-search" else (job_id or url),
                    lang,
                )
                description = truncate(str(detail.get("description") or ""), max_desc)
                if not date_posted:
                    date_posted = str(detail.get("date") or "").strip()
                if not url:
                    url = str(detail.get("url") or "").strip()
                used += 1
            except PortalQualityError:
                description = ""

        if not description:
            # Quality: included rows need a description.
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

    print(
        f"[digest] {portal_name}: cards={len(cards)} kept={len(rows)} "
        f"skipped_location={skipped_location} skipped_title={skipped_title}",
        flush=True,
    )
    return PortalResult(
        name=portal_name,
        ok=True,
        searched=len(cards),
        rows=rows,
        skipped_location=skipped_location,
        skipped_title=skipped_title,
    )


def render_table(portal_name: str, rows: list[DigestRow]) -> str:
    label = portal_label(portal_name)
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
    results: list[PortalResult],
    source: str,
) -> tuple[str, str]:
    n = sum(len(r.rows) for r in results)
    prefix = "BACKUP — " if source == "backup" else ""
    counts = ", ".join(
        f"{portal_label(r.name)} {len(r.rows)}" for r in results
    )
    labels = " + ".join(portal_label(r.name) for r in results)
    subject = f"{prefix}Job digest {day} — {n} new ({labels})"
    body = [
        f"<p>Daily digest for <strong>{html.escape(day)}</strong> "
        f"(source: {html.escape(source)}).</p>",
        f"<p>New roles: <strong>{n}</strong> ({html.escape(counts)}).</p>",
    ]
    body.extend(render_table(r.name, r.rows) for r in results)
    return subject, "\n".join(body)


def render_failure_email(day: str, errors: list[str], source: str) -> tuple[str, str]:
    reason = errors[0][:80] if errors else "unknown"
    prefix = "BACKUP — " if source == "backup" else ""
    subject = f"{prefix}Job digest FAILED {day} — {reason}"
    items = "".join(f"<li><pre>{html.escape(e)}</pre></li>" for e in errors)
    body = (
        f"<p>Daily digest <strong>failed</strong> for {html.escape(day)} "
        f"(source: {html.escape(source)}).</p>"
        f"<p>Quality gate: every configured portal must succeed "
        f"(LinkedIn, jobs.ch, JobScout24).</p>"
        f"<ul>{items}</ul>"
    )
    return subject, body


def portal_enrich_order(cfg: dict[str, Any]) -> list[str]:
    configured = list((cfg.get("portals") or {}).keys())
    preferred = cfg.get("portal_enrich_order") or []
    ordered: list[str] = []
    for name in preferred:
        if name in configured and name not in ordered:
            ordered.append(name)
    for name in configured:
        if name not in ordered:
            ordered.append(name)
    return ordered


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


def collect_cards(
    portal_name: str, cfg: dict[str, Any], jobage: int
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Run every configured query; return (deduped cards, per-query stats)."""
    conf = cfg["portals"][portal_name]
    cli = conf["cli"]
    collected: dict[str, dict[str, Any]] = {}
    query_stats: list[dict[str, Any]] = []
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
            # jobs.ch + JobScout24: location + lang
            args.extend(["--location", q["location"], "--lang", conf.get("lang", "en")])
        payload = run_bun_cli(cli, args)
        if "results" not in payload or not isinstance(payload["results"], list):
            raise PortalQualityError(f"{portal_name}: invalid search payload")
        results = payload["results"]
        query_stats.append(
            {
                "query": q["query"],
                "location": q.get("location"),
                "result_count": len(results),
            }
        )
        print(
            f"[digest] {portal_name}: query={q['query']!r} "
            f"location={q.get('location')!r} results={len(results)}",
            flush=True,
        )
        for item in results:
            url = item.get("url") or ""
            key = url or f"{item.get('company')}|{item.get('title')}|{item.get('id')}"
            if key not in collected:
                tagged = dict(item)
                tagged["_search_query"] = q["query"]
                tagged["_search_location"] = q.get("location")
                collected[key] = tagged
    return list(collected.values()), query_stats


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

    portal_names = portal_enrich_order(cfg)
    if not portal_names:
        raise PortalQualityError("No portals configured in digest/config.yaml")

    cards_by: dict[str, list[dict[str, Any]]] = {}
    query_stats_by: dict[str, list[dict[str, Any]]] = {}
    print(
        f"[digest] configured phrases: {search_phrases(cfg)}",
        flush=True,
    )
    for name in portal_names:
        try:
            cards, qstats = collect_cards(name, cfg, jobage)
            cards_by[name] = cards
            query_stats_by[name] = qstats
        except PortalQualityError as exc:
            errors.append(f"{name}: {exc}")

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

    results = [
        enrich_portal(name, cards_by[name], cfg, seen) for name in portal_names
    ]

    subject, body = render_success_email(day, results, source)
    out_dir = REPO_ROOT / "digests"
    out_dir.mkdir(parents=True, exist_ok=True)
    preview = out_dir / f"{day}.html"
    preview.write_text(body, encoding="utf-8")
    payload: dict[str, Any] = {
        "date": day,
        "source": source,
        "phrases": search_phrases(cfg),
        "portals": {
            r.name: {
                "searched": r.searched,
                "skipped_location": r.skipped_location,
                "skipped_title": r.skipped_title,
                "queries": query_stats_by.get(r.name, []),
                "new": [asdict(row) for row in r.rows],
            }
            for r in results
        },
    }
    (out_dir / f"{day}.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    if dry_run:
        counts = " ".join(f"{r.name}={len(r.rows)}" for r in results)
        print(f"[dry-run] wrote {preview}")
        print(f"[dry-run] subject: {subject}")
        print(f"[dry-run] new rows: {counts}")
        return 0

    if send:
        result = send_html_email(
            to_addr=to_addr,
            subject=subject,
            html_body=body,
            from_addr=from_addr,
        )
        # Persist seen/heartbeat only after a successful send.
        save_seen(seen_path, seen)
        write_heartbeat(day, dry_run=False)
        print(f"Sent via Resend: {subject} id={result.get('id', '?')}")
    else:
        print(f"Prepared (not sent): {subject} -> {preview}")
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Daily multi-portal job digest (LinkedIn, jobs.ch, JobScout24)"
    )
    parser.add_argument(
        "--config",
        default=str(REPO_ROOT / "digest" / "config.yaml"),
        help="Path to digest/config.yaml",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Write preview HTML/JSON, no email, no seen update",
    )
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
