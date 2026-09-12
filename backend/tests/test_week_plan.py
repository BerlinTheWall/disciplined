"""What the week planner tells the model about a goal, and how it maps the
model's answer back.

A goal used to reach the planner as a bare title, so the best it could do was
a week of blocks named after the goal — unlinked to anything, and piled on
top of whatever the goal scheduler had already booked. These cover the
context that fixes that, and the plan_item_id round-trip that lets a
confirmed session be linked back to the milestone it was proposed for.
"""

from app.schemas import WeekPlanMilestone, WeekPlanPreference
from app.services.tools import validate_tool_args
from app.services.week_plan import (
    _PLAN_ITEM_ID,
    _WEEK_PLAN_DECLARATIONS,
    WEEK_PLAN_INSTRUCTION,
    _format_preferences,
)


def _interest(**overrides) -> WeekPlanPreference:
    return WeekPlanPreference(
        kind="interest", id="i1", title="Reading", times_per_week=3, time_of_day="evening",
        **overrides,
    )


def _goal(**overrides) -> WeekPlanPreference:
    body = {
        "kind": "goal",
        "id": "g1",
        "title": "Write a book",
        "times_per_week": 3,
        "time_of_day": "morning",
    }
    body.update(overrides)
    return WeekPlanPreference(**body)


def test_interest_renders_exactly_as_before_plus_its_key():
    text, _ = _format_preferences([_interest()])
    assert text == '- item_1: Interest "Reading" — 3x this week, sometime between 5:00 PM and 9:00 PM'


def test_goal_context_reaches_the_prompt():
    pref = _goal(
        deadline="2026-12-31",
        progress_label="2 of 6 milestones done",
        open_milestones=[WeekPlanMilestone(id="m3", label="Draft chapter 3")],
        scheduled_this_week=["Mon 2026-09-14 09:00 — Draft: chapter 2"],
    )
    text, _ = _format_preferences([pref])
    assert "progress: 2 of 6 milestones done" in text
    assert "due: 2026-12-31" in text
    assert "next step item_1a: Draft chapter 3" in text
    assert "already scheduled: Mon 2026-09-14 09:00 — Draft: chapter 2" in text


def test_each_open_milestone_gets_its_own_key():
    pref = _goal(
        open_milestones=[
            WeekPlanMilestone(id="m3", label="Draft chapter 3"),
            WeekPlanMilestone(id="m4", label="Draft chapter 4"),
        ]
    )
    _, by_key = _format_preferences([_interest(), pref])
    assert by_key["item_1"].preference.id == "i1"
    assert by_key["item_1"].milestone_id is None
    # The goal itself, then one key per next step — all pointing at the goal.
    assert (by_key["item_2"].preference.id, by_key["item_2"].milestone_id) == ("g1", None)
    assert (by_key["item_2a"].preference.id, by_key["item_2a"].milestone_id) == ("g1", "m3")
    assert (by_key["item_2b"].preference.id, by_key["item_2b"].milestone_id) == ("g1", "m4")


def test_a_key_the_model_invents_resolves_to_nothing():
    _, by_key = _format_preferences([_goal()])
    assert by_key.get("item_7c") is None


def test_week_plan_create_event_declares_plan_item_id():
    create = next(d for d in _WEEK_PLAN_DECLARATIONS if d.name == "create_event")
    assert _PLAN_ITEM_ID in create.parameters.properties
    assert _PLAN_ITEM_ID in create.parameters.required


def test_plan_item_id_must_be_stripped_before_the_call_is_proposed():
    # The shared create_event has never heard of it — the arg only exists on
    # this feature's copy of the declaration, so leaving it on would turn
    # every proposal into a bad_arguments rejection.
    assert validate_tool_args("create_event", {"title": "x", "date": "2026-09-16"}) is None
    err = validate_tool_args(
        "create_event", {"title": "x", "date": "2026-09-16", _PLAN_ITEM_ID: "item_1"}
    )
    assert err is not None and err["error"] == "bad_arguments"


def test_instruction_covers_the_new_context():
    for phrase in ("plan_item_id", "already scheduled", "next step", "due"):
        assert phrase in WEEK_PLAN_INSTRUCTION
