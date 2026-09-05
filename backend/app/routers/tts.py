import hashlib
import logging
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Literal
from xml.sax.saxutils import escape

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import BriefingUsage, TtsUsage, User
from app.tiers import require_tier

router = APIRouter(prefix="/api/tts", tags=["tts"])
logger = logging.getLogger("uvicorn.error")

_TIMEOUT = httpx.Timeout(10.0)
# Azure's WAV output format — real RIFF/PCM straight off the wire, which is
# also what iOS's UNNotificationSound requires (see reminderAudio.ts).
_OUTPUT_FORMAT = "riff-24khz-16bit-mono-pcm"

# Two independent buckets, not one shared pool (see models.BriefingUsage for
# why): "briefing" gets a small guaranteed daily allowance on the premium HD
# voice that nothing else can crowd out; "routine" (reminders, chat replies,
# weekly/monthly recaps) shares a larger monthly character budget on the
# cheaper Standard voice instead, since that's where volume actually scales
# with how much someone chats. No billing exists yet, so every account
# resolves to "pro" via User.subscription_tier's own default — these numbers
# take effect once real tiers do. "free" is unreachable in practice: this
# whole route is gated at require_tier("plus").
_GUARANTEED_BRIEFINGS_PER_DAY = 1
_ROUTINE_MONTHLY_CHAR_QUOTA = {"free": 0, "plus": 55_000, "pro": 75_000}
_DEFAULT_TIER = "pro"


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _current_year_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


async def _briefing_quota_ok(db: AsyncSession, user: User) -> bool:
    usage = await db.get(BriefingUsage, (user.id, _today()))
    used = usage.count if usage else 0
    return used < _GUARANTEED_BRIEFINGS_PER_DAY


async def _record_briefing_usage(db: AsyncSession, user: User) -> None:
    today = _today()
    usage = await db.get(BriefingUsage, (user.id, today))
    if usage is None:
        db.add(BriefingUsage(user_id=user.id, date=today, count=1))
    else:
        usage.count += 1
    await db.commit()


async def _routine_quota_ok(db: AsyncSession, user: User, chars: int) -> bool:
    quota = _ROUTINE_MONTHLY_CHAR_QUOTA.get(
        user.subscription_tier, _ROUTINE_MONTHLY_CHAR_QUOTA[_DEFAULT_TIER]
    )
    usage = await db.get(TtsUsage, (user.id, _current_year_month()))
    used = usage.chars_used if usage else 0
    return used + chars <= quota


async def _record_routine_usage(db: AsyncSession, user: User, chars: int) -> None:
    year_month = _current_year_month()
    usage = await db.get(TtsUsage, (user.id, year_month))
    if usage is None:
        db.add(TtsUsage(user_id=user.id, year_month=year_month, chars_used=chars))
    else:
        usage.chars_used += chars
    await db.commit()


class TTSRequest(BaseModel):
    # Long enough for a full day briefing (~110 words, ~700 chars per its own
    # prompt cap in gemini.py) with real headroom, short enough to bound the
    # worst-case cost of a single call.
    text: str = Field(min_length=1, max_length=800)
    # Only meaningful for purpose="briefing" (see below) — None uses
    # settings.azure_tts_voice. Ignored for "routine": that bucket always
    # uses the cheaper Standard voice regardless of what's passed here, since
    # letting the caller pick would defeat the whole point of the split.
    voice: str | None = None
    # "briefing" draws from the small guaranteed daily allowance on the
    # premium HD voice; "routine" (the default — reminders, chat replies,
    # weekly/monthly recaps) shares the larger monthly Standard-voice budget.
    purpose: Literal["briefing", "routine"] = "routine"


# Synthesized audio, keyed by (voice, text). Repeat requests — page reloads,
# several devices asking for the same day briefing — cost no quota at all.
# In-memory LRU: a restart just means one fresh synthesis.
_audio_cache: OrderedDict[str, bytes] = OrderedDict()
_AUDIO_CACHE_MAX = 24  # WAVs run ~0.3–1 MB, so worst case a few dozen MB


def _cache_key(voice: str, text: str) -> str:
    raw = f"{voice}|{text}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _language_code(voice: str) -> str:
    """"en-US-Ava:DragonHDLatestNeural" -> "en-US"."""
    parts = voice.split("-")
    return "-".join(parts[:2]) if len(parts) >= 2 else "en-US"


async def _synthesize_azure(text: str, voice: str | None) -> bytes:
    if not settings.azure_speech_key or not settings.azure_speech_region:
        raise HTTPException(
            status_code=503,
            detail="AZURE_SPEECH_KEY / AZURE_SPEECH_REGION is not set (see backend/.env.example)",
        )
    voice_name = voice or settings.azure_tts_voice
    lang = _language_code(voice_name)
    ssml = (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{lang}">'
        f'<voice name="{escape(voice_name)}">{escape(text)}</voice></speak>'
    )
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"https://{settings.azure_speech_region}.tts.speech.microsoft.com"
                "/cognitiveservices/v1",
                headers={
                    "Ocp-Apim-Subscription-Key": settings.azure_speech_key,
                    "Content-Type": "application/ssml+xml",
                    "X-Microsoft-OutputFormat": _OUTPUT_FORMAT,
                },
                content=ssml.encode("utf-8"),
            )
        resp.raise_for_status()
        return resp.content
    except httpx.HTTPStatusError as exc:
        logger.exception("TTS Azure Speech error")
        raise HTTPException(
            status_code=502, detail=f"Text-to-speech failed ({exc.response.status_code})."
        )


@router.post("")
async def tts(
    body: TTSRequest,
    user: User = Depends(require_tier("plus")),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Natural-voice speech for reminders, chat replies, and the day
    briefing, via Azure AI Speech. The client falls back to the device's
    local voice whenever this endpoint is unreachable or errors."""
    is_briefing = body.purpose == "briefing"
    # Purpose decides the voice server-side, not the caller — a "routine"
    # request can't get the HD voice just by passing a different `voice`,
    # which would defeat the entire cost split.
    voice = (body.voice or settings.azure_tts_voice) if is_briefing else settings.azure_tts_voice_standard
    key = _cache_key(voice, body.text)
    cached = _audio_cache.get(key)
    if cached is not None:
        _audio_cache.move_to_end(key)
        return Response(content=cached, media_type="audio/wav")

    # Checked before spending money, recorded only after a successful spend —
    # a failed upstream call shouldn't count against the user's quota.
    if is_briefing:
        if not await _briefing_quota_ok(db, user):
            raise HTTPException(
                status_code=429,
                detail="Today's briefing has already been read — try again tomorrow.",
            )
    elif not await _routine_quota_ok(db, user, len(body.text)):
        raise HTTPException(
            status_code=429,
            detail="Monthly voice quota reached — resets at the start of next month.",
        )

    try:
        wav = await _synthesize_azure(body.text, voice)
    except HTTPException:
        raise
    except Exception:
        logger.exception("TTS failed")
        raise HTTPException(status_code=502, detail="Text-to-speech failed.")

    if is_briefing:
        await _record_briefing_usage(db, user)
    else:
        await _record_routine_usage(db, user, len(body.text))

    _audio_cache[key] = wav
    while len(_audio_cache) > _AUDIO_CACHE_MAX:
        _audio_cache.popitem(last=False)
    return Response(content=wav, media_type="audio/wav")
