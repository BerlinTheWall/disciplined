import logging

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.observability import (
    REQUEST_ID_HEADER,
    RequestIdFilter,
    RequestIdMiddleware,
    _scrub,
    get_request_id,
)


def _app() -> FastAPI:
    """A minimal app with the middleware, rather than importing app.main —
    these tests are about the middleware, not about every router importing
    cleanly (the CI import smoke test covers that)."""
    app = FastAPI()
    app.add_middleware(RequestIdMiddleware)

    @app.get("/echo")
    async def echo():
        # Read the ContextVar from inside the endpoint: the value has to
        # survive into the handler's task, which is the whole reason this
        # middleware is raw ASGI instead of BaseHTTPMiddleware.
        return {"request_id": get_request_id()}

    return app


def test_generates_a_request_id_and_returns_it():
    res = TestClient(_app()).get("/echo")
    header = res.headers[REQUEST_ID_HEADER]
    assert header
    # The id the handler saw is the id the client is told about — otherwise
    # a user quoting the header can't be matched to the logs.
    assert res.json()["request_id"] == header


def test_honours_an_inbound_request_id():
    res = TestClient(_app()).get("/echo", headers={"X-Request-ID": "from-the-edge"})
    assert res.headers[REQUEST_ID_HEADER] == "from-the-edge"
    assert res.json()["request_id"] == "from-the-edge"


def test_truncates_an_oversized_inbound_request_id():
    # The id goes into log lines, so an unbounded client-controlled string is
    # a log-injection vector.
    res = TestClient(_app()).get("/echo", headers={"X-Request-ID": "A" * 500})
    assert len(res.headers[REQUEST_ID_HEADER]) == 64


def test_each_request_gets_a_distinct_id():
    client = TestClient(_app())
    first = client.get("/echo").json()["request_id"]
    second = client.get("/echo").json()["request_id"]
    assert first != second


def test_request_id_is_a_placeholder_outside_a_request():
    # Startup and scripts still log, and the formatter needs a value.
    assert get_request_id() == "-"


def test_filter_puts_a_request_id_on_every_record():
    record = logging.LogRecord("x", logging.INFO, __file__, 1, "msg", None, None)
    assert RequestIdFilter().filter(record) is True
    # Without this attribute the "%(request_id)s" format string raises on any
    # record from a library that knows nothing about our middleware.
    assert record.request_id == "-"


def test_scrub_removes_credentials_and_bodies():
    event = _scrub(
        {
            "request": {
                "headers": {
                    "Authorization": "Bearer real-token",
                    "Cookie": "session=real-session",
                    "User-Agent": "keep-me",
                },
                "data": {"message": "my private schedule"},
                "cookies": {"session": "real-session"},
                "query_string": "code=oauth-code&state=abc",
            }
        },
        {},
    )
    request = event["request"]
    assert request["headers"]["Authorization"] == "[scrubbed]"
    assert request["headers"]["Cookie"] == "[scrubbed]"
    assert request["headers"]["User-Agent"] == "keep-me"
    # The request body is the chat message / goal / schedule itself.
    assert "data" not in request
    assert "cookies" not in request
    # An OAuth callback carries its authorization code in the URL.
    assert request["query_string"] == "[scrubbed]"


def test_scrub_tolerates_an_event_with_no_request():
    # Errors raised at startup or in a background task have no request.
    assert _scrub({"level": "error"}, {}) == {"level": "error"}
