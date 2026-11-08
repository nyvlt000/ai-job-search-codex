"""Resend API mailer for the daily job digest."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Optional


class DigestMailError(RuntimeError):
    pass


RESEND_API_URL = "https://api.resend.com/emails"


def send_html_email(
    *,
    to_addr: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    from_addr: Optional[str] = None,
    api_key: Optional[str] = None,
) -> dict:
    """Send an HTML email via the Resend HTTP API.

    Credentials (never commit):
      RESEND_API_KEY  — Resend API key (re_...)
      RESEND_FROM     — verified sender, e.g. "Job Digest <digest@yourdomain.com>"
                        or Resend onboarding address while testing
    """
    key = api_key or os.environ.get("RESEND_API_KEY")
    sender = from_addr or os.environ.get("RESEND_FROM")
    if not key:
        raise DigestMailError("Missing RESEND_API_KEY.")
    if not sender:
        raise DigestMailError(
            "Missing RESEND_FROM (verified sender address, e.g. "
            "'Job Digest <noreply@yourdomain.com>')."
        )
    if not to_addr:
        raise DigestMailError("Missing recipient address.")

    payload = {
        "from": sender,
        "to": [to_addr],
        "subject": subject,
        "html": html_body,
        "text": text_body if text_body is not None else html_to_text(html_body),
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        RESEND_API_URL,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            # Cloudflare on api.resend.com bans the default Python-urllib UA (Error 1010).
            "User-Agent": "ai-job-search-digest/1.0 (+https://github.com/nyvlt000/ai-job-search-codex)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        raise DigestMailError(f"Resend API HTTP {exc.code}: {err_body}") from exc
    except urllib.error.URLError as exc:
        raise DigestMailError(f"Resend API request failed: {exc}") from exc


def html_to_text(html: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", html)
    text = re.sub(r"(?s)<br\s*/?>", "\n", text)
    text = re.sub(r"(?s)</p>", "\n\n", text)
    text = re.sub(r"(?s)</tr>", "\n", text)
    text = re.sub(r"(?s)</(td|th)>", " | ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()
