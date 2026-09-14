"""The AI tools may only hand out icons the frontend can draw.

ICON_KEYS in app/services/tools.py is a hand-kept copy of the keys of ICONS in
frontend/src/lib/icons.ts. An icon missing from the backend is one the
assistant can never pick; one missing from the frontend renders as a blank
circle on every row the assistant creates with it.
"""

import re
from pathlib import Path

import pytest

from app.services.tools import ICON_KEYS

ICONS_TS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "icons.ts"


def _frontend_icon_keys() -> list[str]:
    source = ICONS_TS.read_text(encoding="utf-8")
    block = re.search(r"export const ICONS = \{(.*?)\} as const;", source, re.S)
    assert block, "could not find the ICONS object in icons.ts"
    return re.findall(r"^\s*(\w+):", block.group(1), re.M)


@pytest.mark.skipif(not ICONS_TS.exists(), reason="frontend not checked out")
def test_backend_icon_keys_match_frontend():
    assert list(ICON_KEYS) == _frontend_icon_keys()
