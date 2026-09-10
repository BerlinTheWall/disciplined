"""Error reporting, request IDs and log correlation.

Three things that only matter once other people use the app: knowing that
something broke (Sentry), knowing which request broke (a request ID on every
log line and every event), and being able to read the logs at all.

All of it degrades to a no-op without SENTRY_DSN, so local development and
CI behave exactly as they did before.

Privacy is the constraint that shapes the Sentry configuration here. This
service handles people's calendars, goals and chat messages, plus OAuth
refresh tokens for their Google and Microsoft accounts. An error reporter
that helpfully attaches the request body would ship all of that to a third
party, so request bodies are never captured and headers are scrubbed --
see _scrub below.
"""

import logging
import os
import uuid
from contextvars import ContextVar

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import settings

# The id of the request being handled on this task. A ContextVar (not a
# global) because the server is async: many requests are in flight in the
# same process, and each await point can switch between them.
_request_id: ContextVar[str] = ContextVar("request_id", default="-")

REQUEST_ID_HEADER = "x-request-id"


def get_request_id() -> str:
    """The current request's id, or "-" outside a request (startup, scripts)."""
    return _request_id.get()


def environment_name() -> str:
    """Which deployment this is. RAILWAY_ENVIRONMENT_NAME is injected on every
    Railway service; its absence means someone's laptop."""
    return os.environ.get("RAILWAY_ENVIRONMENT_NAME") or "local"


def release_name() -> str | None:
    """The deployed commit, so an error points at the code that caused it.
    Railway injects the SHA; locally there is no release to name."""
    sha = os.environ.get("RAILWAY_GIT_COMMIT_SHA")
    return sha[:12] if sha else None


class RequestIdMiddleware:
    """Assigns every request an id, echoes it back, and puts it on the log
    records and Sentry events produced while handling it.

    Written as raw ASGI rather than BaseHTTPMiddleware on purpose:
    BaseHTTPMiddleware runs the endpoint in a separate task, which loses the
    ContextVar set here -- the request id would be correct in the middleware
    and "-" everywhere it actually matters.

    An inbound X-Request-ID is honoured so a trace can be followed across a
    proxy or from the client, but truncated: it lands in log lines, and an
    unbounded client-controlled string in a log file is how log injection
    starts.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = ""
        for key, value in scope.get("headers", []):
            if key.decode("latin-1").lower() == REQUEST_ID_HEADER:
                incoming = value.decode("latin-1")[:64].strip()
                break
        request_id = incoming or uuid.uuid4().hex[:12]

        token = _request_id.set(request_id)
        _tag_sentry_request(request_id, scope)

        async def send_with_header(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                headers.append((REQUEST_ID_HEADER.encode(), request_id.encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_with_header)
        finally:
            _request_id.reset(token)


def _tag_sentry_request(request_id: str, scope: Scope) -> None:
    """Tag the current Sentry scope so an event can be matched to its log
    lines. No-op when Sentry was never initialised."""
    if not settings.sentry_dsn:
        return
    import sentry_sdk

    sentry_sdk.set_tag("request_id", request_id)


class RequestIdFilter(logging.Filter):
    """Makes %(request_id)s usable in the log format. Every record needs the
    attribute or the formatter raises, including records from libraries that
    know nothing about this."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


def configure_logging() -> None:
    """Root logging with the request id on every line.

    uvicorn configures its own loggers and leaves the root alone, so without
    this nothing the app itself logs during startup ever reaches the deploy
    log. force=True replaces any handler a previous call installed, which
    keeps this safe to call more than once (tests, reload).
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)-8s [%(request_id)s] %(name)s: %(message)s",
        force=True,
    )
    for handler in logging.getLogger().handlers:
        handler.addFilter(RequestIdFilter())


_SENSITIVE_HEADERS = {"authorization", "cookie", "set-cookie", "x-api-key"}


def _scrub(event: dict, _hint: dict) -> dict | None:
    """Last line of defence before an event leaves the process.

    max_request_body_size="never" already stops bodies being collected, so
    this covers headers and query strings -- the places a token still shows
    up (an OAuth callback carries `code` and `state` in the URL).
    """
    request = event.get("request")
    if isinstance(request, dict):
        headers = request.get("headers")
        if isinstance(headers, dict):
            for name in list(headers):
                if name.lower() in _SENSITIVE_HEADERS:
                    headers[name] = "[scrubbed]"
        request.pop("data", None)
        request.pop("cookies", None)
        if isinstance(request.get("query_string"), str):
            request["query_string"] = "[scrubbed]"
    return event


def init_sentry() -> None:
    """Start error reporting, if a DSN is configured.

    Called before the FastAPI app is constructed so the integrations can
    instrument it. Without SENTRY_DSN this returns immediately and nothing
    downstream behaves differently.
    """
    if not settings.sentry_dsn:
        logging.getLogger(__name__).info(
            "SENTRY_DSN not set — error reporting disabled (%s)", environment_name()
        )
        return

    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=environment_name(),
        release=release_name(),
        # Never attach usernames, emails or IP addresses to an event, and
        # never collect a request body: this API's bodies are chat messages,
        # goals and schedules -- the most personal data the product holds.
        send_default_pii=False,
        max_request_body_size="never",
        before_send=_scrub,
        # Performance tracing is sampled separately and defaults to off:
        # it is billed per transaction and this is a small service. Raise
        # SENTRY_TRACES_SAMPLE_RATE (0.0-1.0) when there is a latency
        # question worth paying to answer.
        traces_sample_rate=settings.sentry_traces_sample_rate,
    )
    logging.getLogger(__name__).info(
        "Sentry initialised (environment=%s release=%s)", environment_name(), release_name() or "-"
    )
