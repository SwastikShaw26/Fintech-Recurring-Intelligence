"""Encrypted statement snapshots scoped to a trusted caller's owner ID."""

import json
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from secrets import token_bytes, token_urlsafe
from uuid import UUID, uuid4

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import CheckConstraint, Column, DateTime, Index, Integer, LargeBinary, MetaData, Table, Uuid, and_, delete, func, insert, or_, select

PURGE_BATCH_SIZE = 500
MAX_FALLBACK_KEYS = 3
MAX_ACTIVE_STATEMENTS = 50
STATEMENT_PAGE_SIZE = 20
MAX_ACTIVE_SESSIONS = 10
SESSION_LIFETIME = timedelta(hours=1)


class HostedQuotaExceeded(Exception):
    pass


class HostedHistoryConflict(Exception):
    pass

metadata = MetaData()
statements = Table(
    "hosted_statements", metadata,
    Column("id", Uuid(), primary_key=True),
    Column("owner_id", Uuid(), nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("payload", LargeBinary(), nullable=False),
    Column("history", LargeBinary()),
    Column("lineage_id", Uuid()),
    Column("version", Integer()),
    Column("saved_at", DateTime(timezone=True)),
    Index("ix_hosted_statements_owner_expiry", "owner_id", "expires_at"),
    Index("ix_hosted_statements_expiry", "expires_at"),
    Index("ix_hosted_statement_lineage", "owner_id", "lineage_id", "version"),
)
sessions = Table(
    "hosted_sessions", metadata,
    Column("token_digest", LargeBinary(32), primary_key=True),
    Column("owner_id", Uuid(), nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    CheckConstraint("length(token_digest) = 32", name="ck_hosted_sessions_digest_length"),
    Index("ix_hosted_sessions_owner_expiry", "owner_id", "expires_at"),
    Index("ix_hosted_sessions_expiry", "expires_at"),
)


class HostedStatements:
    def __init__(self, engine, key, *, fallback_keys=()):
        keys = (key, *fallback_keys)
        if len(keys) > MAX_FALLBACK_KEYS + 1 or any(not isinstance(item, bytes) or len(item) != 32 for item in keys):
            raise ValueError("Hosted encryption requires one primary key and at most three 32-byte fallback keys.")
        if len(set(keys)) != len(keys):
            raise ValueError("Hosted encryption keys must be distinct.")
        self.engine = engine
        self.ciphers = tuple(AESGCM(item) for item in keys)

    def save(self, owner_id, snapshot, *, expires_at, history=None, predecessor=None, replace=False):
        expires_at = self._utc(expires_at)
        statement_id = uuid4()
        aad = self._associated_data(owner_id, statement_id)
        values = {"id": statement_id, "owner_id": owner_id, "expires_at": expires_at,
                  "payload": self._encrypt(snapshot, aad)}
        with self.engine.begin() as connection:
            self._lock_owner(connection, owner_id, b"finsight-statement-quota:")
            now = datetime.now(timezone.utc)
            lineage_id, version = statement_id, 1
            if predecessor is not None:
                candidate = select(statements.c.lineage_id, statements.c.version).where(
                    statements.c.owner_id == owner_id, statements.c.id == predecessor, statements.c.expires_at > now,
                )
                if connection.dialect.name == "postgresql":
                    candidate = candidate.with_for_update()
                previous = connection.execute(candidate).first()
                if previous is None:
                    raise HostedHistoryConflict
                lineage_id = previous.lineage_id or predecessor
                current = connection.scalar(select(func.max(statements.c.version)).where(
                    statements.c.owner_id == owner_id, statements.c.lineage_id == lineage_id,
                )) or 1
                if current != (previous.version or 1):
                    raise HostedHistoryConflict
                version = current + 1
                if replace:
                    connection.execute(delete(statements).where(
                        statements.c.owner_id == owner_id, statements.c.id == predecessor,
                    ))
            active = select(statements.c.id).where(
                statements.c.owner_id == owner_id, statements.c.expires_at > now,
            ).limit(MAX_ACTIVE_STATEMENTS)
            count = connection.scalar(select(func.count()).select_from(active.subquery()))
            if count >= MAX_ACTIVE_STATEMENTS:
                raise HostedQuotaExceeded
            if history is not None or predecessor is not None:
                values.update(history=self._encrypt(history or {}, aad + b":history"),
                              lineage_id=lineage_id, version=version, saved_at=now)
            connection.execute(insert(statements).values(**values))
        return statement_id

    def issue_session(self, owner_id, *, now):
        now = self._utc(now)
        expires = now + SESSION_LIFETIME
        token = token_urlsafe(32)
        digest = sha256(token.encode("ascii")).digest()
        with self.engine.begin() as connection:
            self._lock_owner(connection, owner_id, b"finsight-session-quota:")
            active = select(sessions.c.token_digest).where(
                sessions.c.owner_id == owner_id, sessions.c.expires_at > now,
            ).limit(MAX_ACTIVE_SESSIONS)
            if connection.scalar(select(func.count()).select_from(active.subquery())) >= MAX_ACTIVE_SESSIONS:
                raise HostedQuotaExceeded
            connection.execute(insert(sessions).values(token_digest=digest, owner_id=owner_id, expires_at=expires))
        return token, expires

    def session_owner(self, digest, *, now=None):
        with self.engine.connect() as connection:
            cutoff = datetime.now(timezone.utc) if now is None else self._utc(now)
            return connection.scalar(select(sessions.c.owner_id).where(
                sessions.c.token_digest == digest, sessions.c.expires_at > cutoff,
            ))

    def revoke_session(self, digest):
        with self.engine.begin() as connection:
            connection.execute(delete(sessions).where(sessions.c.token_digest == digest))

    def list_page(self, owner_id, *, now, cursor=None):
        rows, continuation = self._statement_page(owner_id, now=now, cursor=cursor, include_history=False)
        return [row.id for row in rows], continuation

    def list_history(self, owner_id, *, now, cursor=None):
        rows, continuation = self._statement_page(owner_id, now=now, cursor=cursor, include_history=True)
        result = []
        for row in rows:
            aad = self._associated_data(owner_id, row.id) + b":history"
            detail = self._decrypt(row.history, aad) if row.history else {}
            result.append({**detail, "statement_id": row.id, "version": row.version or 1,
                           "saved_at": self._read_utc(row.saved_at), "expires_at": self._read_utc(row.expires_at),
                           "lineage_id": row.lineage_id or row.id})
        return result, continuation

    def _statement_page(self, owner_id, *, now, cursor, include_history):
        now = self._utc(now)
        query = select(statements.c.id, statements.c.expires_at).where(
            statements.c.owner_id == owner_id, statements.c.expires_at > now,
        )
        if include_history:
            query = query.add_columns(statements.c.history, statements.c.version, statements.c.saved_at, statements.c.lineage_id)
        if cursor is not None:
            try:
                if not isinstance(cursor, str) or len(cursor) > 90:
                    raise ValueError
                expiry, identifier = cursor.split("|")
                expiry = self._utc(datetime.fromisoformat(expiry))
                identifier = UUID(identifier)
            except (ValueError, OverflowError):
                raise ValueError("Choose a valid hosted statement cursor.") from None
            query = query.where(or_(
                statements.c.expires_at > expiry,
                and_(statements.c.expires_at == expiry, statements.c.id > identifier),
            ))
        with self.engine.connect() as connection:
            rows = connection.execute(query.order_by(
                statements.c.expires_at, statements.c.id,
            ).limit(STATEMENT_PAGE_SIZE + 1)).all()
        page = rows[:STATEMENT_PAGE_SIZE]
        continuation = None
        if len(rows) > STATEMENT_PAGE_SIZE:
            row = page[-1]
            continuation = f"{self._read_utc(row.expires_at).isoformat()}|{row.id}"
        return page, continuation

    def load(self, owner_id, statement_id, *, now):
        now = self._utc(now)
        with self.engine.connect() as connection:
            payload = connection.scalar(select(statements.c.payload).where(
                statements.c.owner_id == owner_id, statements.c.id == statement_id,
                statements.c.expires_at > now,
            ))
        if payload is None:
            return None
        return self._decrypt(payload, self._associated_data(owner_id, statement_id))

    def load_history_batch(self, owner_id, identifiers, *, now):
        with self.engine.connect() as connection:
            rows = connection.execute(select(statements.c.id, statements.c.payload, statements.c.history).where(
                statements.c.owner_id == owner_id, statements.c.id.in_(identifiers),
                statements.c.expires_at > self._utc(now),
            )).all()
        records = {row.id: row for row in rows}
        result = []
        for identifier in identifiers:
            row = records.get(identifier)
            if row is None:
                continue
            aad = self._associated_data(owner_id, identifier)
            history = self._decrypt(row.history, aad + b":history") if row.history else None
            result.append((identifier, self._decrypt(row.payload, aad), history))
        return result

    def _encrypt(self, value, aad):
        nonce = token_bytes(12)
        return nonce + self.ciphers[0].encrypt(nonce, json.dumps(value).encode("utf-8"), aad)

    def _decrypt(self, payload, aad):
        for cipher in self.ciphers:
            try:
                plaintext = cipher.decrypt(payload[:12], payload[12:], aad)
            except InvalidTag:
                continue
            return json.loads(plaintext)
        raise InvalidTag

    @staticmethod
    def _read_utc(value):
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

    def delete(self, owner_id, statement_id):
        with self.engine.begin() as connection:
            result = connection.execute(delete(statements).where(
                statements.c.owner_id == owner_id, statements.c.id == statement_id,
            ))
        return result.rowcount == 1

    def purge_expired(self, *, now, batch_size=PURGE_BATCH_SIZE):
        return self._purge(statements, statements.c.id, now, batch_size)

    def purge_sessions(self, *, now):
        return self._purge(sessions, sessions.c.token_digest, now, PURGE_BATCH_SIZE)

    def _purge(self, table, identifier, now, batch_size):
        if type(batch_size) is not int or not 1 <= batch_size <= PURGE_BATCH_SIZE:
            raise ValueError(f"Purge batch size must be between 1 and {PURGE_BATCH_SIZE}.")
        now = self._utc(now)
        expired = table.c.expires_at <= now
        candidates = select(identifier).where(expired).order_by(
            table.c.expires_at, identifier,
        ).limit(batch_size)
        with self.engine.begin() as connection:
            if connection.dialect.name == "postgresql":
                connection.exec_driver_sql("SET LOCAL lock_timeout = '2s'")
                connection.exec_driver_sql("SET LOCAL statement_timeout = '5s'")
                candidates = candidates.with_for_update(skip_locked=True)
            ids = connection.scalars(candidates).all()
            if not ids:
                return 0
            result = connection.execute(delete(table).where(expired, identifier.in_(ids)))
            return result.rowcount

    @staticmethod
    def _lock_owner(connection, owner_id, namespace):
        if connection.dialect.name == "postgresql":
            connection.exec_driver_sql("SET TRANSACTION ISOLATION LEVEL READ COMMITTED")
            connection.exec_driver_sql("SET LOCAL lock_timeout = '2s'")
            connection.exec_driver_sql("SET LOCAL statement_timeout = '5s'")
            lock = int.from_bytes(sha256(namespace + owner_id.bytes).digest()[:8], "big", signed=True)
            connection.execute(select(func.pg_advisory_xact_lock(lock)))
        else:
            connection.exec_driver_sql("BEGIN IMMEDIATE")

    @staticmethod
    def _associated_data(owner_id, statement_id):
        return b"finsight-hosted-statement-v1:" + owner_id.bytes + statement_id.bytes

    @staticmethod
    def _utc(timestamp):
        if timestamp.utcoffset() is None:
            raise ValueError("Hosted statement timestamps must include a timezone.")
        return timestamp.astimezone(timezone.utc)
