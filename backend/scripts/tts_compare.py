"""Generate the same briefing line in Google Chirp3-HD (current), Azure Neural
HD, OpenAI gpt-4o-mini-tts, and OpenAI tts-1, so you can listen side by side
before picking a replacement.

Setup:
  1. Add these to backend/.env (GOOGLE_TTS_API_KEY is already there):
       AZURE_SPEECH_KEY=...
       AZURE_SPEECH_REGION=...      (e.g. eastus)
       OPENAI_API_KEY=sk-...
  2. From backend/: python -m scripts.tts_compare
     (or: python scripts/tts_compare.py)

Output lands in backend/scripts/tts_samples/ as .wav/.mp3 files — open the
folder and play them. Nothing here touches the running app or its database.
"""

import asyncio
import os
import sys
from pathlib import Path

import httpx

_HERE = Path(__file__).resolve().parent
_ENV_FILE = _HERE.parent / ".env"
_OUT_DIR = _HERE / "tts_samples"

# Same length/register as the real day-briefing prompt (see
# app/services/gemini.py BRIEFING_INSTRUCTION) — short, spoken, ~40 words —
# so the comparison reflects what this app actually sends to TTS.
SAMPLE_TEXT = (
    "Morning. You've got a light day — just the 10 AM design review and lunch "
    "with Priya at noon. Your afternoon's wide open, so it's a good day to "
    "finally tackle that backlog of expense reports before they pile up further."
)


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


async def synth_google(client: httpx.AsyncClient) -> None:
    api_key = os.environ.get("GOOGLE_TTS_API_KEY")
    if not api_key:
        print("  skip: GOOGLE_TTS_API_KEY not set")
        return
    voice = "en-US-Chirp3-HD-Aoede"
    resp = await client.post(
        "https://texttospeech.googleapis.com/v1/text:synthesize",
        params={"key": api_key},
        json={
            "input": {"text": SAMPLE_TEXT},
            "voice": {"languageCode": "en-US", "name": voice},
            "audioConfig": {"audioEncoding": "LINEAR16", "sampleRateHertz": 24000},
        },
    )
    resp.raise_for_status()
    import base64

    pcm = base64.b64decode(resp.json()["audioContent"])
    (_OUT_DIR / "1_google_chirp3hd_current.wav").write_bytes(pcm)
    print("  wrote 1_google_chirp3hd_current.wav (current)")


async def synth_azure(client: httpx.AsyncClient) -> None:
    key = os.environ.get("AZURE_SPEECH_KEY")
    region = os.environ.get("AZURE_SPEECH_REGION")
    if not key or not region:
        print("  skip: AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set")
        return
    voice = "en-US-Ava:DragonHDLatestNeural"
    ssml = (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">'
        f'<voice name="{voice}">{SAMPLE_TEXT}</voice></speak>'
    )
    resp = await client.post(
        f"https://{region}.tts.speech.azure.com/cognitiveservices/v1",
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
        },
        content=ssml.encode("utf-8"),
    )
    resp.raise_for_status()
    (_OUT_DIR / "2_azure_neural_hd.mp3").write_bytes(resp.content)
    print("  wrote 2_azure_neural_hd.mp3")


async def _synth_openai(client: httpx.AsyncClient, model: str, filename: str) -> None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("  skip: OPENAI_API_KEY not set")
        return
    resp = await client.post(
        "https://api.openai.com/v1/audio/speech",
        headers={"Authorization": f"Bearer {api_key}"},
        json={"model": model, "input": SAMPLE_TEXT, "voice": "nova"},
    )
    resp.raise_for_status()
    (_OUT_DIR / filename).write_bytes(resp.content)
    print(f"  wrote {filename}")


async def main() -> None:
    _load_dotenv(_ENV_FILE)
    _OUT_DIR.mkdir(exist_ok=True)

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        print("Google Chirp3-HD (current)...")
        await _run(synth_google(client))
        print("Azure Neural HD...")
        await _run(synth_azure(client))
        print("OpenAI gpt-4o-mini-tts...")
        await _run(_synth_openai(client, "gpt-4o-mini-tts", "3_openai_gpt4o_mini_tts.mp3"))
        print("OpenAI tts-1...")
        await _run(_synth_openai(client, "tts-1", "4_openai_tts1.mp3"))

    print(f"\nDone. Samples are in {_OUT_DIR}")


async def _run(coro) -> None:
    try:
        await coro
    except httpx.HTTPStatusError as exc:
        print(f"  FAILED ({exc.response.status_code}): {exc.response.text[:300]}")
    except Exception as exc:  # noqa: BLE001 - this is a throwaway comparison script
        print(f"  FAILED: {exc}")


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
