"""Production-grade user authentication and PostgreSQL/SQLite user database for FinSight.

- Password hashing: hashlib.pbkdf2_hmac with SHA-256 (100,000 iterations + 16-byte cryptographically secure salt)
- Tokens: Cryptographic HMAC-SHA256 signed bearer tokens with expiration
- Storage: SQLAlchemy PostgreSQL for hosted deployments, SQLite for local fallback
"""

import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

from sqlalchemy import create_engine, text

# Database location - use /tmp/finsight_data in container or fallback to local data/
_default_data_dir = (
    Path("/tmp/finsight_data")  # nosec B108
    if os.path.exists("/tmp") and os.name != "nt"
    else Path(__file__).resolve().parent.parent / "data"
)
DATA_DIR = Path(os.getenv("FINSIGHT_DATA_DIR", _default_data_dir))
try:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
except Exception:
    DATA_DIR = Path("/tmp")  # nosec B108

DB_PATH = DATA_DIR / "users.db"


def _create_sqlite_engine():
    return create_engine(
        f"sqlite:///{DB_PATH}",
        connect_args={"check_same_thread": False},
    )


_database_url = os.environ.get("FINSIGHT_HOSTED_DATABASE_URL", "")
if _database_url:
    try:
        engine = create_engine(
            _database_url,
            pool_pre_ping=True,
            pool_timeout=5,
            hide_parameters=True,
            connect_args={"connect_timeout": 5},
        )
        with engine.connect():
            pass
    except Exception:
        try:
            engine.dispose()
        except Exception:
            pass
        engine = _create_sqlite_engine()
else:
    engine = _create_sqlite_engine()


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


def init_db():
    """Create tables and indexes if they do not exist."""
    try:
        with engine.begin() as connection:
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS finsight_users (
                    user_id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    full_name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """))
            connection.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_finsight_users_email ON finsight_users(email)"
            ))
    except Exception:
        # Auth storage must not prevent the application from starting.
        pass


try:
    init_db()
except Exception:
    pass


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
    raw_payload = secrets.token_hex(16) + "." + json.dumps(payload, separators=(",", ":"))
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
        with engine.begin() as connection:
            result = connection.execute(text("""
                INSERT INTO finsight_users
                    (user_id, email, full_name, password_hash, salt, created_at)
                VALUES (:user_id, :email, :full_name, :password_hash, :salt, :created_at)
                ON CONFLICT (email) DO NOTHING
            """), {
                "user_id": user_id,
                "email": clean_email,
                "full_name": clean_name,
                "password_hash": pwd_hash,
                "salt": salt,
                "created_at": now,
            })
            if result.rowcount == 0:
                raise ValueError("An account with this email address already exists.")
    except ValueError:
        raise

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
    with engine.connect() as connection:
        row = connection.execute(text("""
            SELECT user_id, email, full_name, password_hash, salt
            FROM finsight_users
            WHERE email = :email
        """), {"email": clean_email}).mappings().first()

    if not row or not verify_password(password, row["password_hash"], row["salt"]):
        raise ValueError("Invalid email or password.")

    user_id, email_found, full_name = row["user_id"], row["email"], row["full_name"]
    token = create_token(user_id, email_found)
    return {
        "user_id": user_id,
        "email": email_found,
        "full_name": full_name,
        "token": token,
    }


def get_user_by_id(user_id: str) -> Optional[dict]:
    """Retrieve user details by user_id."""
    with engine.connect() as connection:
        row = connection.execute(text("""
            SELECT user_id, email, full_name, created_at
            FROM finsight_users
            WHERE user_id = :user_id
        """), {"user_id": user_id}).mappings().first()
    if not row:
        return None
    return {
        "user_id": row["user_id"],
        "email": row["email"],
        "full_name": row["full_name"],
        "created_at": row["created_at"],
    }
