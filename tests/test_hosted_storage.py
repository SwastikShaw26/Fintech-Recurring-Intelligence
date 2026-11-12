import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

pytest.importorskip("alembic")
pytest.importorskip("cryptography")
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, update
from sqlalchemy.engine import make_url
from sqlalchemy.schema import CreateSchema, DropSchema

from src.hosted_storage import HostedStatements, statements


@pytest.fixture
def hosted(tmp_path, monkeypatch):
    postgres = os.getenv("FINSIGHT_TEST_POSTGRES_URL")
    database = f"sqlite:///{tmp_path / 'hosted.sqlite3'}"
    admin = None
    if postgres:
        admin = create_engine(postgres)
        schema = f"finsight_test_{uuid4().hex}"
        with admin.begin() as connection:
            connection.execute(CreateSchema(schema))
        database = make_url(postgres).update_query_dict({"options": f"-csearch_path={schema}"})
    database_url = make_url(database).render_as_string(hide_password=False)
    monkeypatch.setenv("FINSIGHT_HOSTED_DATABASE_URL", database_url)
    engine = create_engine(database)
    try:
        command.upgrade(Config("alembic.ini"), "head")
        yield HostedStatements(engine, bytes(range(32))), engine
    finally:
        engine.dispose()
        if admin is not None:
            try:
                with admin.begin() as connection:
                    connection.execute(DropSchema(schema, cascade=True))
            finally:
                admin.dispose()


def test_hosted_storage_scopes_and_encrypts_statements(hosted):
    store, engine = hosted
    alice, bob = uuid4(), uuid4()
    now = datetime.now(timezone.utc)
    private = {"csv": "synthetic private debit", "merchant_links": []}
    statement = store.save(alice, private, expires_at=now + timedelta(days=1))
    assert store.list_page(alice, now=now) == ([statement], None)
    assert store.list_page(bob, now=now) == ([], None)
    assert store.load(bob, statement, now=now) is None
    assert store.delete(bob, statement) is False
    assert store.load(alice, statement, now=now) == private
    with engine.connect() as connection:
        ciphertext = connection.scalar(select(statements.c.payload).where(statements.c.id == statement))
    assert b"synthetic private debit" not in ciphertext
    assert store.delete(alice, statement)
    assert store.load(alice, statement, now=now) is None


def test_hosted_account_history_versions_and_replaces_owner_copy(hosted):
    from src.hosted_storage import HostedHistoryConflict

    store, engine = hosted
    owner, other = uuid4(), uuid4()
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(days=1)
    details = {"name": "Private nickname", "start_date": "2025-01-01", "end_date": "2025-02-01", "currency": "USD"}
    first = store.save(owner, {"csv": "version 1"}, expires_at=expiry, history=details)
    with engine.connect() as connection:
        assert b"Private nickname" not in connection.scalar(select(statements.c.history).where(statements.c.id == first))
    second = store.save(owner, {"csv": "version 2"}, expires_at=expiry, history=details, predecessor=first)
    copies, _ = store.list_history(owner, now=now)
    assert {item["statement_id"]: item["version"] for item in copies} == {first: 1, second: 2}
    assert all(item["name"] == "Private nickname" for item in copies)
    with pytest.raises(HostedHistoryConflict):
        store.save(other, {"csv": "forbidden"}, expires_at=expiry, history=details, predecessor=second)
    with pytest.raises(HostedHistoryConflict):
        store.save(owner, {"csv": "stale"}, expires_at=expiry, history=details, predecessor=first, replace=True)
    third = store.save(owner, {"csv": "version 3"}, expires_at=expiry, history=details, predecessor=second, replace=True)
    assert store.load(owner, first, now=now) == {"csv": "version 1"}
    assert store.load(owner, second, now=now) is None
    copies, _ = store.list_history(owner, now=now)
    assert {item["statement_id"]: item["version"] for item in copies} == {first: 1, third: 3}


def test_hosted_account_comparison_aligns_dates_and_separates_currencies(hosted):
    from fastapi import HTTPException
    from src.api import analyze_statement, statement_snapshot
    from src.hosted_api import HostedRuntime

    store, _ = hosted
    runtime = HostedRuntime(store, {}, "https://finsight.example")
    owner, other = uuid4(), uuid4()

    def action(actor, payload):
        return runtime.statement_action(actor, payload, analyze_statement, statement_snapshot)

    def saved(actor, currency, name, rows, **period):
        return action(actor, {
            "action": "save", "save_confirmed": True, "name": name, **period,
            "statement": {"csv": f"date,description,amount\n{rows}",
                          "mapping": {"date": 0, "description": 1, "amount": 2}, "currency": currency},
        })["statement_id"]

    first = saved(owner, "USD", "Daily account", "2025-01-01,Outside,-500\n2025-02-03,Shop,-20.15\n2025-02-04,Return,5")
    second = saved(owner, "EUR", "Travel account", "2025-02-03,Rail,-10\n2025-03-01,Outside,-400",
                   start_date="2025-02-01", end_date="2025-03-31")
    result = action(owner, {"action": "compare", "statement_ids": [str(first), str(second)]})
    assert (result["start_date"], result["end_date"], result["includes_observed_period"]) == ("2025-02-01", "2025-02-04", True)
    assert {group["currency"]: group["statements"][0]["net_outflow"] for group in result["groups"]} == {"USD": "15.15", "EUR": "10.0"}
    assert {group["currency"]: group["statements"][0]["transaction_count"] for group in result["groups"]} == {"USD": 2, "EUR": 1}
    foreign = saved(other, "USD", "Another owner", "2025-02-03,Market,-5")
    with pytest.raises(HTTPException) as failure:
        action(owner, {"action": "compare", "statement_ids": [str(first), str(foreign)]})
    assert failure.value.status_code == 404


def test_hosted_sessions_are_digest_only_expiring_and_revocable(hosted):
    from hashlib import sha256
    from src.hosted_storage import sessions

    store, engine = hosted
    owner = uuid4()
    now = datetime.now(timezone.utc)
    token, expires = store.issue_session(owner, now=now)
    digest = sha256(token.encode("ascii")).digest()
    with engine.connect() as connection:
        assert connection.scalar(select(sessions.c.token_digest)) == digest
    assert store.session_owner(digest, now=now) == owner
    assert store.session_owner(digest, now=expires) is None
    store.revoke_session(digest)
    assert store.session_owner(digest, now=now) is None
    token, expires = store.issue_session(owner, now=now)
    assert store.purge_sessions(now=expires) == 1
    with engine.connect() as connection:
        assert connection.scalar(select(sessions.c.token_digest)) is None


def test_hosted_session_migration_preserves_snapshots(hosted):
    store, _ = hosted
    config = Config("alembic.ini")
    command.downgrade(config, "0001_hosted_statements")
    owner = uuid4()
    now = datetime.now(timezone.utc)
    snapshot = {"csv": "before session migration"}
    statement_id = store.save(owner, snapshot, expires_at=now + timedelta(days=1))
    command.upgrade(config, "head")
    assert store.load(owner, statement_id, now=now) == snapshot
    assert store.issue_session(owner, now=now)[0]


def test_hosted_storage_filters_and_purges_expired_statements(hosted):
    store, engine = hosted
    owner = uuid4()
    now = datetime.now(timezone.utc)
    expired = store.save(owner, {"csv": "expired"}, expires_at=now + timedelta(seconds=1))
    retained = store.save(owner, {"csv": "retained"},
                          expires_at=(now + timedelta(hours=1)).astimezone(timezone(timedelta(hours=-5))))
    cutoff = now + timedelta(seconds=2)
    assert store.load(owner, expired, now=cutoff) is None
    assert store.list_page(owner, now=cutoff) == ([retained], None)
    assert store.purge_expired(now=cutoff) >= 1
    with engine.connect() as connection:
        assert connection.scalar(select(statements.c.id).where(statements.c.id == expired)) is None
    assert store.delete(owner, retained)


def test_hosted_save_quota_is_owner_scoped_and_atomic(hosted, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from src import hosted_storage

    store, _ = hosted
    monkeypatch.setattr(hosted_storage, "MAX_ACTIVE_STATEMENTS", 1)
    owner, other = uuid4(), uuid4()
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(days=1)
    store.save(owner, {"csv": "expired"}, expires_at=now)

    def save():
        try:
            return store.save(owner, {"csv": "synthetic"}, expires_at=expiry)
        except hosted_storage.HostedQuotaExceeded:
            return None

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: save(), range(2)))
    saved, = [identifier for identifier in results if identifier is not None]
    assert store.list_page(owner, now=now) == ([saved], None)
    assert store.save(other, {"csv": "other owner"}, expires_at=expiry)
    assert store.delete(owner, saved)
    assert save() is not None


def test_hosted_pages_survive_cursor_deletion_and_isolate_owners(hosted, monkeypatch):
    from src import hosted_storage

    store, _ = hosted
    monkeypatch.setattr(hosted_storage, "STATEMENT_PAGE_SIZE", 2, raising=False)
    owner, other = uuid4(), uuid4()
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(days=1)
    saved = sorted(store.save(owner, {"csv": "synthetic"}, expires_at=expiry) for _ in range(4))
    store.save(other, {"csv": "another owner"}, expires_at=expiry)
    first, cursor = store.list_page(owner, now=now)
    assert first == saved[:2]
    assert store.delete(owner, first[-1])
    assert store.list_page(owner, now=now, cursor=cursor) == (saved[2:], None)
    foreign_ids, _ = store.list_page(other, now=now, cursor=cursor)
    assert not set(foreign_ids) & set(saved)
    assert store.list_page(owner, now=expiry) == ([], None)
    with pytest.raises(ValueError, match="cursor"):
        store.list_page(owner, now=now, cursor="malformed")
    with pytest.raises(ValueError, match="cursor"):
        store.list_page(owner, now=now, cursor=f"0001-01-01T00:00:00+01:00|{saved[0]}")


def test_hosted_storage_detects_ciphertext_moved_to_another_owner(hosted):
    from cryptography.exceptions import InvalidTag

    store, engine = hosted
    alice, bob = uuid4(), uuid4()
    now = datetime.now(timezone.utc)
    statement = store.save(alice, {"csv": "synthetic"}, expires_at=now + timedelta(days=1))
    with engine.begin() as connection:
        connection.execute(update(statements).where(statements.c.id == statement).values(owner_id=bob))
    with pytest.raises(InvalidTag):
        store.load(bob, statement, now=now)
    assert store.delete(bob, statement)


def test_hosted_key_rotation_reads_prior_snapshots_and_writes_with_primary(hosted):
    from cryptography.exceptions import InvalidTag

    original, engine = hosted
    owner, stranger = uuid4(), uuid4()
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(days=1)
    old_id = original.save(owner, {"csv": "previous key"}, expires_at=expiry)
    new_key = bytes(reversed(range(32)))
    old_key = bytes(range(32))
    rotating = HostedStatements(engine, new_key, fallback_keys=(old_key,))
    new_id = rotating.save(owner, {"csv": "new key"}, expires_at=expiry)
    assert rotating.load(owner, old_id, now=now) == {"csv": "previous key"}
    assert rotating.load(stranger, old_id, now=now) is None
    assert HostedStatements(engine, new_key).load(owner, new_id, now=now) == {"csv": "new key"}
    assert HostedStatements(engine, old_key, fallback_keys=(new_key,)).load(owner, new_id, now=now) == {"csv": "new key"}
    with pytest.raises(InvalidTag):
        HostedStatements(engine, new_key).load(owner, old_id, now=now)
    with pytest.raises(InvalidTag):
        original.load(owner, new_id, now=now)
    assert rotating.purge_expired(now=expiry) == 2


@pytest.mark.parametrize("fallback", ['{}', '["not hex"]', '["' + "00" * 32 + '"]', '["' + "11" * 32 + '"]' + " extra"])
def test_hosted_rejects_invalid_fallback_key_configuration(monkeypatch, fallback):
    import json
    from src.hosted_api import load_hosted_runtime

    monkeypatch.setenv("FINSIGHT_HOSTED_DATABASE_URL", "postgresql+psycopg://127.0.0.1/test")
    monkeypatch.setenv("FINSIGHT_HOSTED_ORIGIN", "https://finsight.example")
    monkeypatch.setenv("FINSIGHT_HOSTED_CREDENTIALS", json.dumps({"a" * 64: str(uuid4())}))
    monkeypatch.setenv("FINSIGHT_HOSTED_ENCRYPTION_KEY", "00" * 32)
    monkeypatch.setenv("FINSIGHT_HOSTED_FALLBACK_KEYS", fallback)
    monkeypatch.setattr("src.hosted_api.create_engine", lambda *args, **kwargs: pytest.fail("Unexpected database connection"))
    with pytest.raises(RuntimeError, match="configuration|are invalid"):
        load_hosted_runtime()


def test_purge_removes_only_oldest_expired_batch(hosted):
    store, engine = hosted
    owner = uuid4()
    now = datetime.now(timezone.utc)
    old, newer, active = [
        store.save(owner, {"csv": "synthetic"}, expires_at=now + timedelta(days=offset))
        for offset in (-2, -1, 1)
    ]
    assert store.purge_expired(now=now, batch_size=1) == 1
    with engine.connect() as connection:
        assert set(connection.scalars(select(statements.c.id))) == {newer, active}
    assert store.purge_expired(now=now, batch_size=1) == 1
    assert store.purge_expired(now=now, batch_size=1) == 0
    assert store.load(owner, active, now=now) == {"csv": "synthetic"}


def test_purge_skips_a_locked_postgresql_row(hosted):
    store, engine = hosted
    if engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row locks required.")
    owner = uuid4()
    now = datetime.now(timezone.utc)
    locked = store.save(owner, {"csv": "locked"}, expires_at=now - timedelta(days=1))
    ready = store.save(owner, {"csv": "at cutoff"}, expires_at=now)
    with engine.begin() as connection:
        connection.execute(select(statements.c.id).where(statements.c.id == locked).with_for_update())
        assert store.purge_expired(now=now, batch_size=1) == 1
        assert set(connection.scalars(select(statements.c.id))) == {locked}
        assert ready != locked
    assert store.purge_expired(now=now, batch_size=1) == 1


def test_hosted_lifespan_runs_retention_and_joins_at_shutdown(hosted, monkeypatch):
    from threading import Event
    from src.api import app
    from src.hosted_api import HostedRuntime

    store, engine = hosted
    owner = uuid4()
    expired = store.save(owner, {"csv": "synthetic"}, expires_at=datetime.now(timezone.utc) - timedelta(days=1))
    purged = Event()
    purge = store.purge_expired

    def observe_purge(**kwargs):
        result = purge(**kwargs)
        purged.set()
        return result

    monkeypatch.setenv("FINSIGHT_DEPLOYMENT_MODE", "hosted")
    monkeypatch.setattr("src.hosted_api.load_hosted_runtime", lambda: HostedRuntime(store, {}, "https://finsight.example"))
    monkeypatch.setattr(store, "purge_expired", observe_purge)
    with TestClient(app):
        assert purged.wait(3)
        with engine.connect() as connection:
            assert connection.scalar(select(statements.c.id).where(statements.c.id == expired)) is None
    assert not hasattr(app.state, "hosted")


def test_retention_retries_without_logging_database_details(monkeypatch, caplog):
    import asyncio
    from sqlalchemy.exc import SQLAlchemyError
    from src.hosted_api import run_retention

    class FailingOnce:
        attempts = 0

        def purge_expired(self, **kwargs):
            self.attempts += 1
            if self.attempts == 1:
                raise SQLAlchemyError("sensitive diagnostic")
            return 0

        def purge_sessions(self, **kwargs):
            return 0

    async def verify():
        store = FailingOnce()
        stop = asyncio.Event()
        monkeypatch.setattr("src.hosted_api.RETENTION_INTERVAL_SECONDS", 0.001)
        worker = asyncio.create_task(run_retention(store, stop))
        try:
            async with asyncio.timeout(3):
                while store.attempts < 2:
                    await asyncio.sleep(0.001)
        finally:
            stop.set()
            await worker

    with caplog.at_level("INFO", logger="uvicorn.error"):
        asyncio.run(verify())
    assert "Hosted retention batch failed" in caplog.text
    assert "Hosted retention batch completed" in caplog.text
    assert "sensitive diagnostic" not in caplog.text


def test_hosted_readiness_checks_database(hosted, monkeypatch, tmp_path):
    from sqlalchemy.exc import SQLAlchemyError
    from src import api
    from src.hosted_api import HostedRuntime

    store, engine = hosted
    monkeypatch.setenv("FINSIGHT_DEPLOYMENT_MODE", "hosted")
    monkeypatch.setattr(api.app.state, "hosted", HostedRuntime(store, {}, "https://finsight.example"), raising=False)
    for name in ("TRANSACTIONS_FILE", "CANDIDATES_V3_FILE", "PREDICTIONS_FILE"):
        path = tmp_path / name
        path.touch()
        monkeypatch.setattr(api, name, path)
    monkeypatch.setattr(api, "FRONTEND_DIST", tmp_path)
    (tmp_path / "index.html").touch()
    client = TestClient(api.app)
    assert client.get("/api/ready").status_code == 200

    def unavailable():
        raise SQLAlchemyError("sensitive connection diagnostic")

    monkeypatch.setattr(engine, "connect", unavailable)
    response = client.get("/api/ready")
    assert response.status_code == 503
    assert response.json() == {"detail": "Hosted storage is unavailable."}
    assert client.get("/api/health").status_code == 200


def test_hosted_api_authenticates_before_reading_statements(hosted, monkeypatch):
    from hashlib import sha256
    from secrets import token_urlsafe

    from src.api import app
    from src.hosted_api import HostedRuntime

    store, _ = hosted
    alice, bob = uuid4(), uuid4()
    alice_token, bob_token = token_urlsafe(32), token_urlsafe(32)
    origin = "https://finsight.example"
    runtime = HostedRuntime(store, {
        sha256(alice_token.encode()).digest(): alice, sha256(bob_token.encode()).digest(): bob,
    }, origin)
    monkeypatch.setenv("FINSIGHT_DEPLOYMENT_MODE", "hosted")
    monkeypatch.setattr(app.state, "hosted", runtime, raising=False)
    client = TestClient(app, base_url=origin)
    endpoint = "/api/hosted-statement"
    bootstrap = {"Authorization": f"Bearer {alice_token}", "Origin": origin}
    assert client.post(endpoint, headers=bootstrap, json={"action": "list"}).status_code == 401
    alice_session = client.post("/api/hosted-session", headers=bootstrap)
    assert alice_session.status_code == 200 and alice_session.headers["cache-control"] == "no-store"
    bob_session = client.post("/api/hosted-session", headers={"Authorization": f"Bearer {bob_token}"})
    alice_auth = {"Authorization": f"Bearer {alice_session.json()['token']}", "Origin": origin}
    bob_auth = {"Authorization": f"Bearer {bob_session.json()['token']}", "Origin": origin}
    assert client.post("/api/hosted-session", headers=alice_auth).status_code == 401
    payload = {"csv": "date,description,amount\n2025-01-05,Private synthetic,-42\n",
               "mapping": {"date": 0, "description": 1, "amount": 2}}
    assert client.post(endpoint, content=b"invalid").status_code == 401
    assert client.post(endpoint, headers={**alice_auth, "Origin": "https://other.example"},
                       json={"action": "list"}).status_code == 403
    insecure = TestClient(app, base_url="http://finsight.example")
    assert insecure.post(endpoint, headers=alice_auth, json={"action": "list"}).status_code == 403
    preview = client.post(endpoint, headers=alice_auth, json={
        "action": "analyze", "statement": {"csv": payload["csv"]},
    })
    assert preview.json()["row_count"] == 1
    assert client.post(endpoint, headers=alice_auth, json={"action": "list"}).json()["statement_ids"] == []
    assert client.post(endpoint, headers=alice_auth, json={"action": "save", "statement": payload}).status_code == 422
    saved = client.post(endpoint, headers=alice_auth, json={
        "action": "save", "statement": payload, "save_confirmed": True, "retention_days": 7,
    })
    assert saved.status_code == 200
    assert saved.headers["cache-control"] == "no-store"
    identifier = saved.json()["statement_id"]
    monkeypatch.setattr("src.hosted_storage.MAX_ACTIVE_STATEMENTS", 1)
    quota = client.post(endpoint, headers=alice_auth, json={
        "action": "save", "statement": payload, "save_confirmed": True,
    })
    assert quota.status_code == 409
    assert "Saved statement limit reached" in quota.json()["detail"]
    assert client.post(endpoint, headers=alice_auth, json={"action": "list"}).json()["statement_ids"] == [identifier]
    assert client.post(endpoint, headers=bob_auth, json={"action": "list"}).json()["statement_ids"] == []
    for action in ("load", "delete"):
        assert client.post(endpoint, headers=bob_auth, json={
            "action": action, "statement_id": identifier, "owner_id": str(alice),
        }).status_code == 404
    loaded = client.post(endpoint, headers=alice_auth, json={"action": "load", "statement_id": identifier})
    assert loaded.json()["transactions"][0]["description"] == "Private synthetic"
    assert client.post(endpoint, headers=alice_auth, json={"action": "delete", "statement_id": identifier}).status_code == 200
    assert client.post(endpoint, headers=alice_auth, json={"action": "load", "statement_id": identifier}).status_code == 404
    assert client.delete("/api/hosted-session", headers=alice_auth).status_code == 204
    app.state.hosted = HostedRuntime(store, runtime.credentials, origin)
    assert client.post(endpoint, headers=alice_auth, json={"action": "list"}).status_code == 401
    assert client.post(endpoint, headers=bob_auth, json={"action": "list"}).status_code == 200
    monkeypatch.setenv("FINSIGHT_DEPLOYMENT_MODE", "local")
    assert client.post(endpoint, headers=alice_auth, json={"action": "list"}).status_code == 404


def test_hosted_lifespan_checks_configuration_and_database(hosted, monkeypatch):
    import json
    from hashlib import sha256
    from secrets import token_urlsafe

    from src.api import app

    token = token_urlsafe(32)
    origin = "https://finsight.example"
    monkeypatch.setenv("FINSIGHT_DEPLOYMENT_MODE", "hosted")
    monkeypatch.setenv("FINSIGHT_HOSTED_ORIGIN", origin)
    monkeypatch.setenv("FINSIGHT_HOSTED_ENCRYPTION_KEY", bytes(range(32)).hex())
    monkeypatch.setenv("FINSIGHT_HOSTED_CREDENTIALS", json.dumps({sha256(token.encode()).hexdigest(): str(uuid4())}))
    if os.getenv("FINSIGHT_TEST_POSTGRES_URL"):
        with TestClient(app, base_url=origin) as client:
            exchanged = client.post("/api/hosted-session", headers={"Authorization": f"Bearer {token}"}).json()
            response = client.post("/api/hosted-statement", headers={"Authorization": f"Bearer {exchanged['token']}"},
                                   json={"action": "list"})
            assert response.json() == {"statement_ids": []}
        assert not hasattr(app.state, "hosted")
    else:
        with pytest.raises(RuntimeError, match="Hosted database, encryption key, HTTPS origin, or credentials are invalid"):
            with TestClient(app, base_url=origin):
                pytest.fail("A non-PostgreSQL URL must fail hosted startup.")

    monkeypatch.setenv("FINSIGHT_HOSTED_DATABASE_URL", "postgresql+psycopg://db.example/finsight")
    with pytest.raises(RuntimeError, match="Hosted database, encryption key, HTTPS origin, or credentials are invalid"):
        with TestClient(app, base_url=origin):
            pytest.fail("A remote PostgreSQL URL without certificate verification must fail hosted startup.")


def test_hosted_admission_bounds_owner_and_worker_and_recovers(monkeypatch):
    from fastapi import HTTPException
    from src.hosted_api import HostedRuntime

    runtime = HostedRuntime(None, {}, "https://finsight.example")
    first, second, third = uuid4(), uuid4(), uuid4()
    clock = [100.0]
    monkeypatch.setattr("src.hosted_api.monotonic", lambda: clock[0])
    monkeypatch.setattr("src.hosted_api.OWNER_REQUESTS_PER_MINUTE", 2)
    monkeypatch.setattr("src.hosted_api.OWNER_CONCURRENCY", 1)
    monkeypatch.setattr("src.hosted_api.WORKER_CONCURRENCY", 2)

    with runtime.admit(first):
        with pytest.raises(HTTPException) as owner_busy:
            with runtime.admit(first):
                pytest.fail("Owner exceeded concurrency.")
        assert owner_busy.value.status_code == 429
        with runtime.admit(second):
            with pytest.raises(HTTPException) as worker_busy:
                with runtime.admit(third):
                    pytest.fail("Worker exceeded concurrency.")
            assert worker_busy.value.status_code == 429
    with pytest.raises(RuntimeError):
        with runtime.admit(first):
            raise RuntimeError("failed request")
    with pytest.raises(HTTPException) as rate_limited:
        with runtime.admit(first):
            pytest.fail("Owner exceeded the rate limit.")
    assert rate_limited.value.headers == {"Retry-After": "60"}
    with runtime.admit(third):
        pass
    clock[0] += 60
    with runtime.admit(first):
        pass


def test_hosted_admission_runs_before_body_and_releases_after_timeout(hosted, monkeypatch):
    import asyncio
    from src import api
    from src.hosted_api import HostedRuntime

    store, _ = hosted
    origin = "https://finsight.example"
    owner = uuid4()
    token, _ = store.issue_session(owner, now=datetime.now(timezone.utc))
    runtime = HostedRuntime(store, {}, origin)
    monkeypatch.setenv("FINSIGHT_DEPLOYMENT_MODE", "hosted")
    monkeypatch.setattr(api.app.state, "hosted", runtime, raising=False)
    monkeypatch.setattr("src.hosted_api.OWNER_REQUESTS_PER_MINUTE", 1)
    monkeypatch.setattr(api, "HOSTED_BODY_TIMEOUT_SECONDS", 0.001)
    body_reads = 0

    async def stalled(request):
        nonlocal body_reads
        body_reads += 1
        await asyncio.Event().wait()

    monkeypatch.setattr(api, "read_statement_request", stalled)
    client = TestClient(api.app, base_url=origin)
    headers = {"Authorization": f"Bearer {token}"}
    endpoint = "/api/hosted-statement"
    assert client.post(endpoint).status_code == 401
    assert client.post(endpoint, headers=headers).status_code == 408
    limited = client.post(endpoint, headers=headers)
    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) >= 1
    assert body_reads == 1
    assert runtime._active == {}
