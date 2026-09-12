"""Guards on what the assistant is allowed to propose and execute.

Confirming a proposed action runs it with no model in the loop (see
routers/chat.confirm_actions), so a malformed call that reaches the Yes
button is executed as-is. These cover the two ways one got there in
practice: parameters borrowed from a sibling tool, which the executors used
to drop silently, and an id for an item that was only ever *proposed*.
"""

from app.models import Event
from app.services.tools import (
    TOOL_PARAMS,
    execute_tool,
    missing_target_error,
    validate_tool_args,
)


async def _event(db, user, **overrides) -> Event:
    row = Event(
        title="Dentist",
        date="2026-09-16",
        start_minutes=840,
        duration_minutes=60,
        user_id=user.id,
        **overrides,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


def test_every_executable_tool_has_declared_params():
    from app.services.tools import _EXECUTORS

    assert set(_EXECUTORS) <= set(TOOL_PARAMS)


def test_valid_args_pass():
    assert validate_tool_args("update_event", {"event_id": "e1", "duration_minutes": 120}) is None


def test_rejects_params_borrowed_from_another_tool():
    # The real failure: the model answered "start at 1:45 for two hours" with
    # update_event carrying move_event's fields. update_event ignores them, so
    # confirming it would have resized an event without moving it.
    err = validate_tool_args(
        "update_event",
        {
            "event_id": "e1",
            "duration_minutes": 120,
            "new_date": "2026-09-16",
            "new_start_minutes": 105,
        },
    )
    assert err is not None
    assert err["error"] == "bad_arguments"
    assert "new_date" in err["message"] and "new_start_minutes" in err["message"]
    assert "move_event" in err["message"]


def test_rejects_missing_required_param():
    err = validate_tool_args("move_event", {"new_start_minutes": 600})
    assert err is not None
    assert "event_id" in err["message"]


def test_unknown_tool_is_rejected():
    assert validate_tool_args("delete_everything", {})["error"].startswith("Unknown tool")


async def test_execute_tool_refuses_malformed_args(db, user):
    event = await _event(db, user)
    result = await execute_tool(
        db,
        user.id,
        "update_event",
        {"event_id": event.id, "duration_minutes": 120, "new_date": "2026-09-17"},
    )
    assert result["error"] == "bad_arguments"
    await db.refresh(event)
    # Nothing applied — not even the half of the call that was valid.
    assert (event.duration_minutes, event.date) == (60, "2026-09-16")


async def test_missing_target_error_flags_unknown_event_id(db, user):
    err = await missing_target_error(db, user.id, "update_event", {"event_id": "d742d873"})
    assert err is not None
    assert "d742d873" in err["error"]


async def test_missing_target_error_passes_a_real_event(db, user):
    event = await _event(db, user)
    assert await missing_target_error(db, user.id, "update_event", {"event_id": event.id}) is None


async def test_missing_target_error_flags_another_users_event(db, user, make_user):
    event = await _event(db, user)
    other = await make_user("other@example.com")
    assert await missing_target_error(db, other.id, "delete_event", {"event_id": event.id})


async def test_missing_target_error_ignores_tools_without_ids(db, user):
    args = {"title": "Dentist", "date": "2026-09-16"}
    assert await missing_target_error(db, user.id, "create_event", args) is None
