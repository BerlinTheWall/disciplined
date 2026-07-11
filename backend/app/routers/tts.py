import base64
import io
import logging
import wave

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
        return Response(content=_pcm_to_wav(data), media_type="audio/wav")
    except RuntimeError as exc:  # missing API key
        raise HTTPException(status_code=503, detail=str(exc))
    except genai_errors.APIError as exc:
        logger.exception("TTS Gemini error")
        raise HTTPException(status_code=502, detail=f"Text-to-speech failed ({exc.code}).")
    except Exception:
        logger.exception("TTS failed")
        raise HTTPException(status_code=502, detail="Text-to-speech failed.")
