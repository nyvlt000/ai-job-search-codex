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
        self.assertEqual(daily_digest.normalize_company("  Straumann Group "), "straumann-group")

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
        self.assertFalse(
            daily_digest.passes_fit(
                {"title": "Junior Barista", "company": "Cafe"},
                ["project manager", "contact center"],
            )
        )

    def test_truncate(self):
        self.assertEqual(daily_digest.truncate("abcdef", 4), "abc…")
        self.assertEqual(daily_digest.truncate("abc", 10), "abc")

    def test_render_table_empty(self):
        html = daily_digest.render_table("linkedin-search", [])
        self.assertIn("No new matches today", html)
        self.assertIn("LinkedIn", html)

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

    def test_render_failure_email(self):
        subject, body = daily_digest.render_failure_email(
            "2026-11-08", ["linkedin-search: timeout"], "primary"
        )
        self.assertIn("FAILED", subject)
        self.assertIn("linkedin-search: timeout", body)

    def test_html_to_text(self):
        text = html_to_text("<p>Hello</p><br>World")
        self.assertIn("Hello", text)
        self.assertIn("World", text)

    def test_resend_mailer_requires_api_key(self):
        from digest_mail import DigestMailError, send_html_email

        with self.assertRaises(DigestMailError) as ctx:
            send_html_email(
                to_addr="md@michaldub.com",
                subject="t",
                html_body="<p>x</p>",
                from_addr="Job Digest <test@example.com>",
                api_key="",
            )
        self.assertIn("RESEND_API_KEY", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
