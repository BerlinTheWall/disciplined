"""Transactional email via Resend's HTTP API — no SDK needed, httpx already
ships with the app. See app/config.py for the no-key dev fallback."""

import logging

import httpx

from app.config import settings

log = logging.getLogger("app.email")


async def send_email(to: str, subject: str, html: str) -> None:
    if not settings.resend_api_key:
        log.info("EMAIL (no RESEND_API_KEY set) to=%s subject=%r\n%s", to, subject, html)
        return
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": settings.email_from, "to": [to], "subject": subject, "html": html},
        )
    # Best-effort: a failed send shouldn't fail the request that triggered it
    # (registration, forgot-password) — the user can always hit resend.
    if resp.status_code >= 400:
        log.error("resend send to %s failed (%s): %s", to, resp.status_code, resp.text)


def code_email_html(code: str, action: str) -> str:
    return f"""
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:420px;margin:0 auto">
      <h2 style="margin-bottom:4px">Disciplined</h2>
      <p style="color:#6b7280;margin-top:0">{action}</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:24px 0">{code}</p>
      <p style="color:#6b7280;font-size:14px">
        This code expires in 15 minutes. If you didn't request this, you can ignore this email.
      </p>
    </div>
    """
