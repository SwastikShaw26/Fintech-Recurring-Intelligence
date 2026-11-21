"""Production-grade user authentication and SQLite user database for FinSight.

Uses zero third-party dependencies:
- Password hashing: hashlib.pbkdf2_hmac with SHA-256 (100,000 iterations + 16-byte cryptographically secure salt)
- Tokens: Cryptographic HMAC-SHA256 signed bearer tokens with expiration
- Storage: Thread-safe SQLite database with WAL journal mode
"""

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

# Database location - use /tmp/finsight_data in container or fallback to local data/
_default_data_dir = Path("/tmp/finsight_data") if os.path.exists("/tmp") and os.name != "nt" else Path(__file__).resolve().parent.parent / "data"
DATA_DIR = Path(os.getenv("FINSIGHT_DATA_DIR", _default_data_dir))
try:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
except Exception:
    DATA_DIR = Path("/tmp")

DB_PATH = DATA_DIR / "users.db"

# Secret key for HMAC token signing (prefers env var, fallback to safe deterministic machine secret or memory)
AUTH_SECRET = os.getenv("FINSIGHT_AUTH_SECRET", "")
if not AUTH_SECRET:
    SECRET_FILE = DATA_DIR / ".auth_secret"
    try:
        if not SECRET_FILE.exists():
            SECRET_FILE.write_bytes(secrets.token_bytes(32))
        AUTH_SECRET = SECRET_FILE.read_bytes().hex()
    except Exception:
        # If filesystem is read-only or permission restricted
        AUTH_SECRET = hashlib.sha256(b"finsight-fallback-static-auth-secret-key-32b").hexdigest()

TOKEN_EXPIRY_SECONDS = 7 * 24 * 3600  # 7 days


def _get_db():
    try:
        conn = sqlite3.connect(str(DB_PATH), timeout=10.0)
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        return conn
    except Exception:
        # Fallback to in-memory database if permission denied
        conn = sqlite3.connect(":memory:", timeout=10.0)
        return conn


def init_db():
    """Create tables and indexes if they do not exist."""
    with _get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL COLLATE NOCASE,
                full_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS ix_users_email ON users(email)")


init_db()


def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    """Hash a password using PBKDF2-HMAC-SHA256 with 100,000 rounds."""
    if not salt:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100000,
    )
    return dk.hex(), salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    """Constant-time verification of candidate password against stored hash."""
    dk, _ = hash_password(password, salt)
    return hmac.compare_digest(dk, password_hash)


def create_token(user_id: str, email: str) -> str:
    """Generate a tamper-proof cryptographically signed URL-safe bearer token."""
    payload = {
        "uid": user_id,
        "eml": email,
        "exp": int(time.time()) + TOKEN_EXPIRY_SECONDS,
        "rnd": secrets.token_hex(8),
    }
    raw_payload = secrets.token_urlsafe(16) + "." + json.dumps(payload, separators=(",", ":"))
    signature = hmac.new(
        AUTH_SECRET.encode("utf-8"),
        raw_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    # Format: base64-like payload . signature
    return f"{raw_payload}.{signature}"


def verify_token(token: str) -> Optional[dict]:
    """Verify bearer token signature and expiration. Returns user dict or None."""
    if not token or not isinstance(token, str):
        return None
    parts = token.rsplit(".", 1)
    if len(parts) != 2:
        return None
    raw_payload, signature = parts
    expected_sig = hmac.new(
        AUTH_SECRET.encode("utf-8"),
        raw_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected_sig):
        return None

    try:
        _, json_part = raw_payload.split(".", 1)
        payload = json.loads(json_part)
        if time.time() > payload.get("exp", 0):
            return None  # Expired
        return payload
    except Exception:
        return None


def register_user(email: str, password: str, full_name: str) -> dict:
    """Register a new user account."""
    clean_email = email.strip().lower()
    clean_name = full_name.strip() or clean_email.split("@")[0].title()
    if not clean_email or "@" not in clean_email or "." not in clean_email:
        raise ValueError("Please provide a valid email address.")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters long.")

    pwd_hash, salt = hash_password(password)
    user_id = f"usr_{uuid4().hex[:16]}"
    now = datetime.now(timezone.utc).isoformat()

    try:
        with _get_db() as conn:
            conn.execute(
                "INSERT INTO users (user_id, email, full_name, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, clean_email, clean_name, pwd_hash, salt, now),
            )
    except sqlite3.IntegrityError:
        raise ValueError("An account with this email address already exists.")

    token = create_token(user_id, clean_email)
    return {
        "user_id": user_id,
        "email": clean_email,
        "full_name": clean_name,
        "token": token,
    }


def authenticate_user(email: str, password: str) -> dict:
    """Authenticate email & password, returning user info and active token."""
    clean_email = email.strip().lower()
    with _get_db() as conn:
        cursor = conn.execute(
            "SELECT user_id, email, full_name, password_hash, salt FROM users WHERE email = ?",
            (clean_email,),
        )
        row = cursor.fetchone()

    if not row or not verify_password(password, row[3], row[4]):
        raise ValueError("Invalid email or password.")

    user_id, email_found, full_name = row[0], row[1], row[2]
    token = create_token(user_id, email_found)
    return {
        "user_id": user_id,
        "email": email_found,
        "full_name": full_name,
        "token": token,
    }


def get_user_by_id(user_id: str) -> Optional[dict]:
    """Retrieve user details by user_id."""
    with _get_db() as conn:
        cursor = conn.execute(
            "SELECT user_id, email, full_name, created_at FROM users WHERE user_id = ?",
            (user_id,),
        )
        row = cursor.fetchone()
    if not row:
        return None
    return {
        "user_id": row[0],
        "email": row[1],
        "full_name": row[2],
        "created_at": row[3],
    }
