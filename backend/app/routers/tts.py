import base64
import hashlib
import io
import logging
import wave
from collections import OrderedDict

from fastapi import APIRouter, Depends, HTTPException, Response
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.config import settings
from app.models import User
from app.services.gemini import get_client

router = APIRouter(prefix="/api/tts", tags=["tts"])
logger = logging.getLogger("uvicorn.error")


class TTSRequest(BaseModel):
    # Long enough for a full day briefing, short enough to bound cost/latency.
    text: str = Field(min_length=1, max_length=1500)


# Synthesized audio, keyed by (model, voice, text). Repeat requests — page
# reloads, several devices asking for the same day briefing — cost no Gemini
# quota at all. In-memory LRU: a restart just means one fresh synthesis.
_audio_cache: OrderedDict[str, bytes] = OrderedDict()
_AUDIO_CACHE_MAX = 24  # WAVs run ~0.3–2 MB, so worst case a few dozen MB


def _cache_key(text: str) -> str:
    raw = f"{settings.gemini_tts_model}|{settings.gemini_tts_voice}|{text}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _pcm_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    """Gemini TTS returns raw 16-bit mono PCM; wrap it in a WAV container so
    browsers can play it directly."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


@router.post("")
async def tts(body: TTSRequest, user: User = Depends(get_current_user)) -> Response:
    """Natural-voice speech for reminder lines. The client falls back to the
    device's local voice whenever this endpoint is unreachable or errors."""
    key = _cache_key(body.text)
    cached = _audio_cache.get(key)
    if cached is not None:
        _audio_cache.move_to_end(key)
        return Response(content=cached, media_type="audio/wav")

    try:
        client = get_client()
        response = await client.aio.models.generate_content(
            model=settings.gemini_tts_model,
            contents=body.text,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=settings.gemini_tts_voice
                        )
                    )
                ),
            ),
        )
        part = response.candidates[0].content.parts[0]
        data = part.inline_data.data
        if isinstance(data, str):
            data = base64.b64decode(data)
        wav = _pcm_to_wav(data)
        _audio_cache[key] = wav
        while len(_audio_cache) > _AUDIO_CACHE_MAX:
            _audio_cache.popitem(last=False)
        return Response(content=wav, media_type="audio/wav")
    except RuntimeError as exc:  # missing API key
        raise HTTPException(status_code=503, detail=str(exc))
    except genai_errors.APIError as exc:
        logger.exception("TTS Gemini error")
        raise HTTPException(status_code=502, detail=f"Text-to-speech failed ({exc.code}).")
    except Exception:
        logger.exception("TTS failed")
        raise HTTPException(status_code=502, detail="Text-to-speech failed.")
