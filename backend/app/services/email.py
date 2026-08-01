"""Transactional email via Resend's HTTP API — no SDK needed, httpx already
ships with the app. See app/config.py for the no-key dev fallback."""

import asyncio
import logging

import httpx

from app.config import settings

log = logging.getLogger("app.email")

# 429 (rate limit) and 5xx are transient — worth a couple of retries with
# backoff. Everything else (4xx like a bad "to" address or bad API key) won't
# succeed on retry.
_RETRY_DELAYS_SECONDS = (1, 3)


async def send_email(to: str, subject: str, html: str) -> None:
    if not settings.resend_api_key:
        log.info("EMAIL (no RESEND_API_KEY set) to=%s subject=%r\n%s", to, subject, html)
        return
    payload = {"from": settings.email_from, "to": [to], "subject": subject, "html": html}
    attempts = len(_RETRY_DELAYS_SECONDS) + 1
    for attempt in range(1, attempts + 1):
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                    json=payload,
                )
            except httpx.HTTPError as exc:
                log.error("resend send to %s raised on attempt %d/%d: %s", to, attempt, attempts, exc)
                resp = None
        if resp is not None and resp.status_code < 400:
            return
        retryable = resp is None or resp.status_code == 429 or resp.status_code >= 500
        if resp is not None:
            log.error(
                "resend send to %s failed on attempt %d/%d (%s): %s",
                to, attempt, attempts, resp.status_code, resp.text,
            )
        if not retryable or attempt == attempts:
            break
        await asyncio.sleep(_RETRY_DELAYS_SECONDS[attempt - 1])
    log.error("resend send to %s gave up after %d attempts — email not delivered", to, attempts)


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
