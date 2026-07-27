import base64
import hashlib
import io
import logging
import wave
from collections import OrderedDict

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.config import settings
from app.models import User

router = APIRouter(prefix="/api/tts", tags=["tts"])
logger = logging.getLogger("uvicorn.error")

_SYNTHESIZE_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
_TIMEOUT = httpx.Timeout(10.0)
_SAMPLE_RATE = 24000


class TTSRequest(BaseModel):
    # Long enough for a full day briefing, short enough to bound cost/latency.
    text: str = Field(min_length=1, max_length=1500)
    # None uses settings.google_tts_voice.
    voice: str | None = None


# Synthesized audio, keyed by (voice, text). Repeat requests — page reloads,
# several devices asking for the same day briefing — cost no quota at all.
# In-memory LRU: a restart just means one fresh synthesis.
_audio_cache: OrderedDict[str, bytes] = OrderedDict()
_AUDIO_CACHE_MAX = 24  # WAVs run ~0.3–1 MB, so worst case a few dozen MB


def _cache_key(voice: str, text: str) -> str:
    raw = f"{voice}|{text}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _language_code(voice: str) -> str:
    """"en-US-Chirp3-HD-Aoede" -> "en-US"."""
    parts = voice.split("-")
    return "-".join(parts[:2]) if len(parts) >= 2 else "en-US"


def _pcm_to_wav(pcm: bytes, rate: int = _SAMPLE_RATE) -> bytes:
    """Google's REST API already returns LINEAR16 with a WAV header attached,
    but wrap defensively in case that ever changes — this is also the format
    iOS's UNNotificationSound requires (see reminderAudio.ts), and what every
    caller on the natural-voice path already expects."""
    if pcm[:4] == b"RIFF":
        return pcm
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


async def _synthesize_google(text: str, voice: str | None) -> bytes:
    if not settings.google_tts_api_key:
        raise HTTPException(
            status_code=503, detail="GOOGLE_TTS_API_KEY is not set (see backend/.env.example)"
        )
    voice_name = voice or settings.google_tts_voice
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                _SYNTHESIZE_URL,
                params={"key": settings.google_tts_api_key},
                json={
                    "input": {"text": text},
                    "voice": {
                        "languageCode": _language_code(voice_name),
                        "name": voice_name,
                    },
                    "audioConfig": {
                        "audioEncoding": "LINEAR16",
                        "sampleRateHertz": _SAMPLE_RATE,
                    },
                },
            )
        resp.raise_for_status()
        return _pcm_to_wav(base64.b64decode(resp.json()["audioContent"]))
    except httpx.HTTPStatusError as exc:
        logger.exception("TTS Google Cloud error")
        raise HTTPException(
            status_code=502, detail=f"Text-to-speech failed ({exc.response.status_code})."
        )


@router.post("")
async def tts(body: TTSRequest, user: User = Depends(get_current_user)) -> Response:
    """Natural-voice speech for reminder lines, via Google Cloud Text-to-Speech.
    The client falls back to the device's local voice whenever this endpoint
    is unreachable or errors."""
    voice = body.voice or settings.google_tts_voice
    key = _cache_key(voice, body.text)
    cached = _audio_cache.get(key)
    if cached is not None:
        _audio_cache.move_to_end(key)
        return Response(content=cached, media_type="audio/wav")

    try:
        wav = await _synthesize_google(body.text, voice)
    except HTTPException:
        raise
    except Exception:
        logger.exception("TTS failed")
        raise HTTPException(status_code=502, detail="Text-to-speech failed.")

    _audio_cache[key] = wav
    while len(_audio_cache) > _AUDIO_CACHE_MAX:
        _audio_cache.popitem(last=False)
    return Response(content=wav, media_type="audio/wav")
