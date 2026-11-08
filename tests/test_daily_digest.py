"""Unit tests for daily digest helpers (no live network)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import daily_digest  # noqa: E402
from digest_mail import html_to_text  # noqa: E402


class DailyDigestHelpersTest(unittest.TestCase):
    def test_normalize_company(self):
        self.assertEqual(daily_digest.normalize_company("Acme Corp"), "acme-corp")
        self.assertEqual(
            daily_digest.normalize_company("  Straumann Group "), "straumann-group"
        )

    def test_seen_key_prefers_url(self):
        self.assertEqual(
            daily_digest.seen_key("https://example.com/job/1", "Acme", "PM"),
            "https://example.com/job/1",
        )
        self.assertEqual(
            daily_digest.seen_key("", "Acme", "Project Manager"),
            "acme::project manager",
        )

    def test_passes_fit(self):
        self.assertTrue(
            daily_digest.passes_fit(
                {"title": "Digital Transformation Project Manager", "company": "X"},
                ["project manager", "contact center"],
            )
        )
        self.assertTrue(
            daily_digest.passes_fit(
                {"title": "IT-Projektleiter (m/w/d)", "company": "Acme"},
                ["projektleiter", "project manager"],
            )
        )
        self.assertFalse(
            daily_digest.passes_fit(
                {"title": "Junior Barista", "company": "Cafe"},
                ["project manager", "contact center"],
            )
        )

    def test_portal_detail_cap(self):
        cfg = {
            "detail_fetch_cap": 30,
            "detail_fetch_cap_per_portal": {
                "linkedin-search": 20,
                "jobs-ch-search": 20,
                "jobscout24-search": 15,
            },
        }
        self.assertEqual(daily_digest.portal_detail_cap(cfg, "jobs-ch-search"), 20)
        self.assertEqual(daily_digest.portal_detail_cap(cfg, "linkedin-search"), 20)
        self.assertEqual(daily_digest.portal_detail_cap(cfg, "jobscout24-search"), 15)
        self.assertEqual(daily_digest.portal_detail_cap({"detail_fetch_cap": 15}, "x"), 15)

    def test_portal_enrich_order(self):
        cfg = {
            "portals": {
                "linkedin-search": {},
                "jobs-ch-search": {},
                "jobscout24-search": {},
            },
            "portal_enrich_order": [
                "jobs-ch-search",
                "jobscout24-search",
                "linkedin-search",
            ],
        }
        self.assertEqual(
            daily_digest.portal_enrich_order(cfg),
            ["jobs-ch-search", "jobscout24-search", "linkedin-search"],
        )

    def test_truncate(self):
        self.assertEqual(daily_digest.truncate("abcdef", 4), "abc…")
        self.assertEqual(daily_digest.truncate("abc", 10), "abc")

    def test_render_table_empty(self):
        html = daily_digest.render_table("linkedin-search", [])
        self.assertIn("No new matches today", html)
        self.assertIn("LinkedIn", html)

    def test_render_table_jobscout24(self):
        html = daily_digest.render_table("jobscout24-search", [])
        self.assertIn("JobScout24", html)

    def test_render_table_rows(self):
        row = daily_digest.DigestRow(
            title="PM",
            location="Basel",
            description="Owns delivery",
            date_posted="2026-11-08",
            company_summary="Medical devices firm",
            apply_url="https://example.com/a",
            company="Acme",
            portal="jobs-ch-search",
        )
        html = daily_digest.render_table("jobs-ch-search", [row])
        self.assertIn("Job Title", html)
        self.assertIn("Basel", html)
        self.assertIn("https://example.com/a", html)
        self.assertIn("jobs.ch", html)

    def test_render_success_email_multi_portal(self):
        empty = daily_digest.PortalResult(name="linkedin-search", ok=True, searched=0)
        js24 = daily_digest.PortalResult(
            name="jobscout24-search",
            ok=True,
            searched=3,
            rows=[
                daily_digest.DigestRow(
                    title="Digital Project Manager",
                    location="Basel",
                    description="Owns FOOBY platform",
                    date_posted="2026-11-07",
                    company_summary="Retail",
                    apply_url="https://www.jobscout24.ch/de/job/x/",
                    company="COOP",
                    portal="jobscout24-search",
                )
            ],
        )
        jobsch = daily_digest.PortalResult(name="jobs-ch-search", ok=True, searched=1)
        subject, body = daily_digest.render_success_email(
            "2026-11-08", [jobsch, js24, empty], "primary"
        )
        self.assertIn("1 new", subject)
        self.assertIn("JobScout24", subject)
        self.assertIn("jobs.ch", subject)
        self.assertIn("LinkedIn", subject)
        self.assertIn("Digital Project Manager", body)
        self.assertIn("JobScout24", body)

    def test_render_failure_email(self):
        subject, body = daily_digest.render_failure_email(
            "2026-11-08", ["linkedin-search: timeout"], "primary"
        )
        self.assertIn("FAILED", subject)
        self.assertIn("linkedin-search: timeout", body)
        self.assertIn("JobScout24", body)

    def test_html_to_text(self):
        text = html_to_text("<p>Hello</p><br>World")
        self.assertIn("Hello", text)
        self.assertIn("World", text)

    def test_resend_mailer_requires_api_key(self):
        import os

        from digest_mail import DigestMailError, send_html_email

        previous = os.environ.pop("RESEND_API_KEY", None)
        try:
            with self.assertRaises(DigestMailError) as ctx:
                send_html_email(
                    to_addr="md@michaldub.com",
                    subject="t",
                    html_body="<p>x</p>",
                    from_addr="Job Digest <test@example.com>",
                    api_key=None,
                )
            self.assertIn("RESEND_API_KEY", str(ctx.exception))
        finally:
            if previous is not None:
                os.environ["RESEND_API_KEY"] = previous

    def test_config_includes_jobscout24(self):
        cfg = daily_digest.load_config(ROOT / "digest" / "config.yaml")
        self.assertIn("jobscout24-search", cfg["portals"])
        self.assertEqual(
            cfg["portals"]["jobscout24-search"]["cli"],
            ".agents/skills/jobscout24-search/cli/src/cli.ts",
        )
        self.assertIn("jobscout24-search", cfg["portal_enrich_order"])

    def test_run_digest_multi_portal_dry_run(self):
        """Orchestrator walks all configured portals without live network."""
        import tempfile
        from unittest import mock

        cfg_text = """
timezone: Europe/Berlin
email:
  to: md@michaldub.com
  from: "Job Digest <test@example.com>"
jobage_days: 3
detail_fetch_cap: 5
portal_enrich_order:
  - jobs-ch-search
  - jobscout24-search
  - linkedin-search
fit_keywords:
  - project manager
portals:
  linkedin-search:
    cli: .agents/skills/linkedin-search/cli/src/cli.ts
    queries:
      - query: "Project Manager"
        location: "Basel"
        limit: 1
  jobs-ch-search:
    cli: .agents/skills/jobs-ch-search/cli/src/cli.ts
    lang: en
    queries:
      - query: "project manager"
        location: "Basel"
        limit: 1
  jobscout24-search:
    cli: .agents/skills/jobscout24-search/cli/src/cli.ts
    lang: de
    queries:
      - query: "project manager"
        location: "Basel"
        limit: 1
"""

        def fake_collect(name, cfg, jobage):
            return [
                {
                    "id": f"{name}-1",
                    "title": "Project Manager",
                    "company": "Acme",
                    "location": "Basel",
                    "date": "2026-11-08",
                    "url": f"https://example.com/{name}/1",
                }
            ]

        def fake_enrich(name, cards, cfg, seen):
            rows = [
                daily_digest.DigestRow(
                    title=c["title"],
                    location=c["location"],
                    description="Delivery ownership",
                    date_posted=c["date"],
                    company_summary="Test co",
                    apply_url=c["url"],
                    company=c["company"],
                    portal=name,
                    id=c["id"],
                )
                for c in cards
            ]
            return daily_digest.PortalResult(
                name=name, ok=True, searched=len(cards), rows=rows
            )

        with tempfile.TemporaryDirectory() as tmp:
            cfg_path = Path(tmp) / "config.yaml"
            cfg_path.write_text(cfg_text, encoding="utf-8")
            with mock.patch.object(daily_digest, "REPO_ROOT", Path(tmp)):
                with mock.patch.object(
                    daily_digest, "collect_cards", side_effect=fake_collect
                ):
                    with mock.patch.object(
                        daily_digest, "enrich_portal", side_effect=fake_enrich
                    ):
                        code = daily_digest.run_digest(
                            config_path=cfg_path,
                            dry_run=True,
                            send=False,
                            source="primary",
                        )
            self.assertEqual(code, 0)
            preview = Path(tmp) / "digests" / f"{__import__('datetime').date.today().isoformat()}.html"
            self.assertTrue(preview.exists())
            html = preview.read_text(encoding="utf-8")
            self.assertIn("JobScout24", html)
            self.assertIn("jobs.ch", html)
            self.assertIn("LinkedIn", html)


if __name__ == "__main__":
    unittest.main()
