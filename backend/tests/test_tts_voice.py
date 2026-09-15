"""Voice selection for /api/tts.

Guards the 2026-09-15 bug where "routine" speech ignored the user's pick and
always used a female Standard voice, so "Frank" (Andrew) sounded like "Amy".
"""

import pytest

from app.config import settings
from app.routers.tts import _ALLOWED_VOICES, _STANDARD_TWIN, _resolve_voice

AVA_HD = "en-US-Ava:DragonHDLatestNeural"
ANDREW_HD = "en-US-Andrew:DragonHDLatestNeural"


def test_every_allowed_voice_has_a_standard_twin():
    assert set(_STANDARD_TWIN) == _ALLOWED_VOICES


@pytest.mark.parametrize(
    "voice,expected",
    [(AVA_HD, "en-US-AvaNeural"), (ANDREW_HD, "en-US-AndrewNeural")],
)
def test_routine_keeps_the_chosen_speaker_on_the_standard_voice(voice, expected):
    assert _resolve_voice("routine", voice) == expected


def test_routine_without_a_voice_falls_back_to_the_configured_standard():
    assert _resolve_voice("routine", None) == settings.azure_tts_voice_standard


@pytest.mark.parametrize("voice", [AVA_HD, ANDREW_HD])
def test_briefing_uses_the_chosen_hd_voice(voice):
    assert _resolve_voice("briefing", voice) == voice


def test_briefing_without_a_voice_falls_back_to_the_configured_hd_voice():
    assert _resolve_voice("briefing", None) == settings.azure_tts_voice
