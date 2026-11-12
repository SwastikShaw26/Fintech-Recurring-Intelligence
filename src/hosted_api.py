"""Opt-in hosted statement API for operator-provisioned credentials."""

import asyncio
import json
import logging
import os
import re
from collections import deque
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from hashlib import sha256
from math import ceil
from time import monotonic
from urllib.parse import urlsplit
from uuid import UUID

from cryptography.exceptions import InvalidTag
from fastapi import HTTPException, Request
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool

from src.hosted_storage import (
    MAX_FALLBACK_KEYS, PURGE_BATCH_SIZE, HostedHistoryConflict, HostedQuotaExceeded, HostedStatements, sessions, statements,
)
from src.private_statement import map_statement, parse_statement

logger = logging.getLogger("uvicorn.error")
RETENTION_INTERVAL_SECONDS = 15 * 60
OWNER_REQUESTS_PER_MINUTE = 60
OWNER_CONCURRENCY = 2
WORKER_CONCURRENCY = 8


def _statement_id(value):
    try:
        return UUID(value)
    except (TypeError, ValueError, AttributeError):
        raise ValueError("Choose a valid hosted statement ID.") from None


def _statement_date(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Enter statement dates in YYYY-MM-DD format.")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError("Enter valid statement dates.") from None


def _history_fields(payload, transactions, currency):
    name = payload.get("name", "")
    if not isinstance(name, str) or len(name) > 80 or any(not character.isprintable() for character in name):
        raise ValueError("Enter a statement name of up to 80 printable characters.")
    observed = sorted(row["date"] for row in transactions)
    start, end = observed[0], observed[-1]
    declared = payload.get("start_date") is not None or payload.get("end_date") is not None
    if declared:
        start = _statement_date(payload.get("start_date")).isoformat()
        end = _statement_date(payload.get("end_date")).isoformat()
        if not start <= observed[0] <= observed[-1] <= end:
            raise ValueError("The statement period must contain all observed transactions.")
    return {"name": name.strip(), "start_date": start, "end_date": end,
            "period_source": "declared" if declared else "observed", "currency": currency}


def _compare_history(store, owner, values, now):
    if not isinstance(values, list) or not 2 <= len(values) <= 4:
        raise ValueError("Select two to four hosted statements to compare.")
    identifiers = [_statement_id(value) for value in values]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("Select different hosted statements to compare.")
    loaded = store.load_history_batch(owner, identifiers, now=now)
    if len(loaded) != len(identifiers):
        raise HTTPException(status_code=404, detail="A selected hosted statement was not found.")
    sources = []
    for identifier, saved, history in loaded:
        columns, rows = parse_statement(saved["csv"])
        transactions = map_statement(columns, rows, saved["mapping"], saved["currency"])
        observed = _history_fields({}, [{"date": row["date"].isoformat()} for row in transactions], saved["currency"])
        sources.append((identifier, transactions, history or observed))
    start = max(history["start_date"] for _, _, history in sources)
    end = min(history["end_date"] for _, _, history in sources)
    if start > end:
        raise ValueError("The selected statement periods do not overlap.")
    groups = {}
    for identifier, transactions, history in sources:
        currency = history["currency"]
        included = [row for row in transactions if start <= row["date"].isoformat() <= end]
        debits = sum((Decimal(str(row["amount"])) for row in included if row["direction"] == "debit"), Decimal())
        credits = sum((Decimal(str(row["amount"])) for row in included if row["direction"] == "credit"), Decimal())
        groups.setdefault(currency, []).append({
            "statement_id": identifier, "name": history["name"], "transaction_count": len(included),
            "debits": str(debits), "credits": str(credits), "net_outflow": str(debits - credits),
        })
    return {"start_date": start, "end_date": end, "includes_observed_period": any(
        history["period_source"] == "observed" for _, _, history in sources
    ), "groups": [{"currency": currency, "statements": items} for currency, items in groups.items()]}


async def run_retention(store, stop):
    while not stop.is_set():
        try:
            count = await run_in_threadpool(store.purge_expired, now=datetime.now(timezone.utc))
            logger.info("Hosted retention batch completed: deleted=%d full_batch=%s",
                        count, count == PURGE_BATCH_SIZE)
        except SQLAlchemyError:
            logger.warning("Hosted retention batch failed; retrying on next interval")
        try:
            await run_in_threadpool(store.purge_sessions, now=datetime.now(timezone.utc))
        except SQLAlchemyError:
            logger.warning("Hosted session cleanup failed; retrying on next interval")
        try:
            await asyncio.wait_for(stop.wait(), timeout=RETENTION_INTERVAL_SECONDS)
        except TimeoutError:
            continue


@dataclass
class HostedRuntime:
    store: HostedStatements
    credentials: dict[bytes, UUID]
    origin: str
    _active: dict[UUID, int] = field(default_factory=dict, init=False, repr=False)
    _requests: dict[UUID, deque[float]] = field(default_factory=dict, init=False, repr=False)
    _auth_active: int = field(default=0, init=False, repr=False)

    @contextmanager
    def admit(self, owner):
        # Called on the worker's event loop. Admission and release contain no await.
        active = self._active.get(owner, 0)
        if active >= OWNER_CONCURRENCY or sum(self._active.values()) >= WORKER_CONCURRENCY:
            raise HTTPException(status_code=429, detail="Hosted workspace is busy. Try again shortly.",
                                headers={"Retry-After": "1"})
        now = monotonic()
        history = self._requests.setdefault(owner, deque())
        while history and history[0] <= now - 60:
            history.popleft()
        if len(history) >= OWNER_REQUESTS_PER_MINUTE:
            retry = max(1, ceil(history[0] + 60 - now))
            raise HTTPException(status_code=429, detail="Hosted request limit reached. Try again shortly.",
                                headers={"Retry-After": str(retry)})
        history.append(now)
        self._active[owner] = active + 1
        try:
            yield
        finally:
            remaining = self._active[owner] - 1
            if remaining:
                self._active[owner] = remaining
            else:
                del self._active[owner]

    def database_ready(self):
        try:
            with self.store.engine.connect() as connection:
                if connection.dialect.name == "postgresql":
                    connection.exec_driver_sql("SET LOCAL statement_timeout = '3s'")
                connection.execute(select(statements).limit(0))
                connection.execute(select(sessions).limit(0))
        except SQLAlchemyError:
            return False
        return True

    @staticmethod
    def unauthorized():
        return HTTPException(status_code=401, detail="A valid hosted credential is required.",
                             headers={"WWW-Authenticate": "Bearer"})

    def bearer_digest(self, request: Request):
        if (f"{request.url.scheme}://{request.url.netloc}" != self.origin
                or request.headers.get("origin", self.origin) != self.origin):
            raise HTTPException(status_code=403, detail="Use the configured HTTPS FinSight origin.")
        match = re.fullmatch(r"Bearer ([A-Za-z0-9_-]{43})", request.headers.get("authorization", ""), re.IGNORECASE)
        if match is None:
            raise self.unauthorized()
        return sha256(match[1].encode("ascii")).digest()

    async def session_call(self, operation, *args, **kwargs):
        if self._auth_active >= WORKER_CONCURRENCY:
            raise HTTPException(status_code=429, detail="Hosted authentication is busy. Try again shortly.",
                                headers={"Retry-After": "1"})
        self._auth_active += 1
        try:
            return await run_in_threadpool(operation, *args, **kwargs)
        except HostedQuotaExceeded:
            raise HTTPException(status_code=409, detail="Active session limit reached. Sign out or wait for a session to expire.") from None
        except SQLAlchemyError:
            logger.error("Hosted session operation failed")
            raise HTTPException(status_code=503, detail="Hosted storage is unavailable.") from None
        finally:
            self._auth_active -= 1

    async def exchange(self, request):
        owner = self.credentials.get(self.bearer_digest(request))
        if owner is None:
            raise self.unauthorized()
        with self.admit(owner):
            token, expires = await self.session_call(self.store.issue_session, owner, now=datetime.now(timezone.utc))
        return {"token": token, "expires_at": expires}

    async def authenticate(self, request):
        digest = self.bearer_digest(request)
        owner = await self.session_call(self.store.session_owner, digest)
        if owner is None:
            raise self.unauthorized()
        return owner

    def statement_action(self, owner, payload, analyze, snapshot):
        try:
            return self._statement_action(owner, payload, analyze, snapshot)
        except HostedQuotaExceeded:
            raise HTTPException(status_code=409, detail="Saved statement limit reached. Delete a saved copy before saving again.") from None
        except HostedHistoryConflict:
            raise HTTPException(status_code=409, detail="Choose the latest active version of a statement you own.") from None
        except (SQLAlchemyError, InvalidTag):
            logger.error("Hosted statement operation failed")
            raise HTTPException(status_code=503, detail="Hosted storage is unavailable.") from None
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from None

    def _statement_action(self, owner, payload, analyze, snapshot):
        if not isinstance(payload, dict):
            raise ValueError("Choose a hosted statement action.")
        action = payload.get("action")
        now = datetime.now(timezone.utc)
        if action == "analyze":
            return analyze(payload.get("statement"))
        if action == "list":
            if payload.get("include_history") is True:
                history, next_cursor = self.store.list_history(owner, now=now, cursor=payload.get("cursor"))
                return {"statement_ids": [item["statement_id"] for item in history],
                        "history": history, **({"next_cursor": next_cursor} if next_cursor else {})}
            ids, next_cursor = self.store.list_page(owner, now=now, cursor=payload.get("cursor"))
            result = {"statement_ids": ids}
            if next_cursor is not None:
                result["next_cursor"] = next_cursor
            return result
        if action == "compare":
            return _compare_history(self.store, owner, payload.get("statement_ids"), now)
        if action == "save":
            days = payload.get("retention_days", 30)
            if type(days) is not int or not 1 <= days <= 90:
                raise ValueError("Choose a retention period of 1 to 90 days.")
            if payload.get("save_confirmed") is not True:
                raise ValueError("Confirm hosted storage before saving.")
            statement = payload.get("statement")
            if not isinstance(statement, dict) or "mapping" not in statement:
                raise ValueError("Analyze a mapped statement before saving.")
            result = analyze({key: value for key, value in statement.items() if key != "analysis_id"})
            history = _history_fields(payload, result["transactions"], result["summary"]["currency"])
            predecessor = _statement_id(payload["predecessor_id"]) if "predecessor_id" in payload else None
            replace = payload.get("replace") is True
            if replace and (predecessor is None or payload.get("replace_confirmed") is not True):
                raise ValueError("Confirm which saved version to replace.")
            expires_at = now + timedelta(days=days)
            identifier = self.store.save(owner, snapshot(result), expires_at=expires_at,
                                         history=history, predecessor=predecessor, replace=replace)
            return {"statement_id": identifier, "expires_at": expires_at}
        if action not in ("load", "delete"):
            raise ValueError("Choose a hosted statement action.")
        identifier = _statement_id(payload.get("statement_id"))
        if action == "load":
            statement = self.store.load(owner, identifier, now=now)
            if statement is not None:
                return {**analyze(statement), "statement_id": identifier}
        elif self.store.delete(owner, identifier):
            return {"deleted": True}
        raise HTTPException(status_code=404, detail="No hosted statement was found.")


def load_hosted_runtime():
    try:
        database = make_url(os.environ["FINSIGHT_HOSTED_DATABASE_URL"])
        key_hex = os.environ["FINSIGHT_HOSTED_ENCRYPTION_KEY"]
        fallback_hex = json.loads(os.getenv("FINSIGHT_HOSTED_FALLBACK_KEYS", "[]"))
        if not isinstance(fallback_hex, list) or len(fallback_hex) > MAX_FALLBACK_KEYS:
            raise ValueError()
        if any(not isinstance(item, str) or not re.fullmatch(r"[a-fA-F0-9]{64}", item)
               for item in [key_hex, *fallback_hex]):
            raise ValueError()
        key = bytes.fromhex(key_hex)
        fallback_keys = tuple(bytes.fromhex(item) for item in fallback_hex)
        if len({key, *fallback_keys}) != 1 + len(fallback_keys):
            raise ValueError()
        origin = os.environ["FINSIGHT_HOSTED_ORIGIN"]
        url = urlsplit(origin)
        configured = json.loads(os.environ["FINSIGHT_HOSTED_CREDENTIALS"])
        if database.drivername != "postgresql+psycopg":
            raise ValueError()
        if (database.host not in {"127.0.0.1", "::1"}
                and database.query.get("sslmode") != "verify-full"):
            raise ValueError()
        if "host" in database.query or "hostaddr" in database.query:
            raise ValueError()
        if (url.scheme != "https" or not url.hostname or url.username is not None
                or origin != f"https://{url.netloc}" or (url.port is not None and url.port <= 0)):
            raise ValueError()
        if not isinstance(configured, dict) or not configured:
            raise ValueError()
        credentials = {}
        for digest, owner in configured.items():
            if not re.fullmatch(r"[a-f0-9]{64}", digest):
                raise ValueError()
            credentials[bytes.fromhex(digest)] = UUID(owner)
    except (KeyError, ValueError, TypeError, AttributeError, SQLAlchemyError):
        raise RuntimeError("Hosted database, encryption key, HTTPS origin, or credentials are invalid.") from None
    engine = None
    try:
        engine = create_engine(database, pool_pre_ping=True, pool_timeout=5, hide_parameters=True,
                               connect_args={"connect_timeout": 5})
        with engine.connect() as connection:
            connection.execute(select(statements).limit(0))
            connection.execute(select(sessions).limit(0))
    except SQLAlchemyError:
        if engine is not None:
            engine.dispose()
        raise RuntimeError("Hosted database is unavailable or its migrations are missing.") from None
    return HostedRuntime(HostedStatements(engine, key, fallback_keys=fallback_keys), credentials, origin)
