"""Named workspaces for an explicitly enabled local SQLite server."""

import json
import os
import sqlite3
from contextlib import closing
from unicodedata import normalize

DEFAULT_ACCOUNT = "Default workspace"


class SavedStatementConflict(Exception):
    pass


def account_label(value):
    if not isinstance(value, str):
        raise ValueError("Enter an account nickname.")
    label = normalize("NFKC", value).strip()
    if not label or len(label) > 48 or not label.isprintable():
        raise ValueError("Use an account nickname of 1–48 printable characters.")
    return label


def open_store(path):
    connection = sqlite3.connect(path, timeout=5)
    try:
        connection.execute("PRAGMA secure_delete=ON")
        with connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "CREATE TABLE IF NOT EXISTS account_workspaces ("
                "account_key TEXT PRIMARY KEY, label TEXT NOT NULL, "
                "analysis_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL)"
            )
            legacy = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'workspace'"
            ).fetchone()
            if legacy:
                connection.execute(
                    "INSERT INTO account_workspaces (account_key, label, analysis_id, payload) "
                    "SELECT ?, ?, analysis_id, payload FROM workspace WHERE id = 1",
                    (DEFAULT_ACCOUNT.casefold(), DEFAULT_ACCOUNT),
                )
                connection.execute("DROP TABLE workspace")
    except sqlite3.Error:
        connection.close()
        raise
    return connection


def save_statement(path, label, payload):
    # The configured directory owns platform ACLs. Use an owner-only mode on POSIX.
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
    os.close(descriptor)
    key = label.casefold()
    with closing(open_store(path)) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        current = connection.execute(
            "SELECT account_key, analysis_id FROM account_workspaces WHERE account_key = ? OR analysis_id = ?",
            (key, payload["analysis_id"]),
        ).fetchall()
        if any(existing_key != key or existing_id != payload["analysis_id"] for existing_key, existing_id in current):
            raise SavedStatementConflict()
        connection.execute(
            "INSERT INTO account_workspaces VALUES (?, ?, ?, ?) "
            "ON CONFLICT(account_key) DO UPDATE SET payload = excluded.payload",
            (key, label, payload["analysis_id"], json.dumps(payload, ensure_ascii=False)),
        )
        return connection.execute("SELECT label FROM account_workspaces WHERE account_key = ?", (key,)).fetchone()[0]


def list_accounts(path):
    if not path.is_file():
        return []
    with closing(open_store(path)) as connection:
        return [row[0] for row in connection.execute("SELECT label FROM account_workspaces ORDER BY account_key")]


def load_statement(path, label):
    if not path.is_file():
        return None
    with closing(open_store(path)) as connection:
        row = connection.execute(
            "SELECT label, payload FROM account_workspaces WHERE account_key = ?", (label.casefold(),)
        ).fetchone()
        return (row[0], json.loads(row[1])) if row else None


def load_statements(path, keys):
    if not path.is_file():
        return {}
    placeholders = ", ".join("?" for _ in keys)
    with closing(open_store(path)) as connection:
        rows = connection.execute(
            f"SELECT account_key, label, payload FROM account_workspaces WHERE account_key IN ({placeholders})",
            tuple(keys),
        )
        return {key: (label, json.loads(payload)) for key, label, payload in rows}


def delete_statement(path, label):
    if not path.is_file():
        return
    with closing(open_store(path)) as connection, connection:
        connection.execute("DELETE FROM account_workspaces WHERE account_key = ?", (label.casefold(),))
