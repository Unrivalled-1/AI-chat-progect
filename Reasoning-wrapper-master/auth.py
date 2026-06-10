"""
auth.py — User Authentication Module

Provides registration, login, logout, and API-key-based authentication
using SQLite + Flask-Login + bcrypt password hashing.
"""

import os
import uuid
import sqlite3
import hashlib
import secrets
import logging
from pathlib import Path
from functools import wraps

from flask import request, jsonify, session, redirect, url_for
from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user, login_required

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parent / "data" / "vibe.db"


# ── User model ───────────────────────────────────────────────────────────────
class User(UserMixin):
    """Simple user object backed by SQLite."""

    def __init__(self, id, username, email, password_hash, api_key, created_at):
        self.id = id
        self.username = username
        self.email = email
        self.password_hash = password_hash
        self.api_key = api_key
        self.created_at = created_at

    def get_id(self):
        return str(self.id)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "api_key": self.api_key,
            "created_at": self.created_at,
        }


# ── Password hashing (hashlib-based, no extra deps) ─────────────────────────
def _hash_password(password: str) -> str:
    """Hash password with salt using SHA-256."""
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}${hashed}"


def _verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored salt$hash."""
    if "$" not in stored_hash:
        return False
    salt, hashed = stored_hash.split("$", 1)
    return hashlib.sha256((salt + password).encode()).hexdigest() == hashed


# ── Database helpers ─────────────────────────────────────────────────────────
def _get_db():
    """Get a database connection."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables if they don't exist."""
    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            api_key TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS chat_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT DEFAULT 'New Chat',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            classification TEXT,
            traces TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS email_config (
            user_key TEXT PRIMARY KEY,
            imap_host TEXT,
            imap_port INTEGER DEFAULT 993,
            smtp_host TEXT,
            smtp_port INTEGER DEFAULT 587,
            email_address TEXT,
            password_enc TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    conn.close()
    logger.info("Database initialized at %s", DB_PATH)


def _row_to_user(row) -> User | None:
    if not row:
        return None
    return User(
        id=row["id"],
        username=row["username"],
        email=row["email"],
        password_hash=row["password_hash"],
        api_key=row["api_key"],
        created_at=row["created_at"],
    )


# ── User CRUD ────────────────────────────────────────────────────────────────
def get_user_by_id(user_id: str) -> User | None:
    conn = _get_db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return _row_to_user(row)


def get_user_by_username(username: str) -> User | None:
    conn = _get_db()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    return _row_to_user(row)


def get_user_by_email(email: str) -> User | None:
    conn = _get_db()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()
    return _row_to_user(row)


def get_user_by_api_key(api_key: str) -> User | None:
    conn = _get_db()
    row = conn.execute("SELECT * FROM users WHERE api_key = ?", (api_key,)).fetchone()
    conn.close()
    return _row_to_user(row)


def create_user(username: str, email: str, password: str) -> tuple[User | None, str]:
    """Create a new user. Returns (user, error_message)."""
    username = username.strip()
    email = email.strip().lower()

    if not username or len(username) < 3:
        return None, "Username must be at least 3 characters."
    if len(username) > 30:
        return None, "Username must be 30 characters or less."
    if not email or "@" not in email:
        return None, "Invalid email address."
    if not password or len(password) < 6:
        return None, "Password must be at least 6 characters."

    if get_user_by_username(username):
        return None, "Username already taken."
    if get_user_by_email(email):
        return None, "Email already registered."

    user_id = str(uuid.uuid4())
    api_key = f"vibe_{secrets.token_hex(24)}"
    password_hash = _hash_password(password)

    try:
        conn = _get_db()
        conn.execute(
            "INSERT INTO users (id, username, email, password_hash, api_key) VALUES (?, ?, ?, ?, ?)",
            (user_id, username, email, password_hash, api_key),
        )
        conn.commit()
        conn.close()
        logger.info("User created: %s (%s)", username, email)
        return get_user_by_id(user_id), ""
    except sqlite3.IntegrityError as e:
        logger.warning("User creation failed: %s", e)
        return None, "Username or email already exists."


def authenticate_user(username: str, password: str) -> User | None:
    """Verify credentials and return user if valid."""
    user = get_user_by_username(username)
    if not user:
        # Try email login
        user = get_user_by_email(username.strip().lower())
    if not user:
        return None
    if _verify_password(password, user.password_hash):
        return user
    return None


def regenerate_api_key(user_id: str) -> str:
    """Generate a new API key for the user."""
    new_key = f"vibe_{secrets.token_hex(24)}"
    conn = _get_db()
    conn.execute("UPDATE users SET api_key = ? WHERE id = ?", (new_key, user_id))
    conn.commit()
    conn.close()
    return new_key


# ── Chat history DB operations ───────────────────────────────────────────────
def create_chat_session(user_id: str, title: str = "New Chat") -> str:
    """Create a new chat session and return its ID."""
    session_id = str(uuid.uuid4())
    conn = _get_db()
    conn.execute(
        "INSERT INTO chat_sessions (id, user_id, title) VALUES (?, ?, ?)",
        (session_id, user_id, title[:100]),
    )
    conn.commit()
    conn.close()
    return session_id


def get_user_sessions(user_id: str, limit: int = 50) -> list[dict]:
    """Get all chat sessions for a user."""
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?",
        (user_id, limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def save_message(session_id: str, role: str, content: str, classification: str = None, traces: str = None):
    """Save a message to the database."""
    conn = _get_db()
    conn.execute(
        "INSERT INTO chat_messages (session_id, role, content, classification, traces) VALUES (?, ?, ?, ?, ?)",
        (session_id, role, content[:50000], classification, traces),
    )
    conn.execute(
        "UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (session_id,),
    )
    # Auto-set title from first user message
    first = conn.execute(
        "SELECT content FROM chat_messages WHERE session_id = ? AND role = 'user' ORDER BY id LIMIT 1",
        (session_id,),
    ).fetchone()
    if first:
        title = first["content"][:40] + ("..." if len(first["content"]) > 40 else "")
        conn.execute("UPDATE chat_sessions SET title = ? WHERE id = ?", (title, session_id))
    conn.commit()
    conn.close()


def get_session_messages(session_id: str) -> list[dict]:
    """Get all messages in a session."""
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id ASC",
        (session_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_chat_session(session_id: str, user_id: str):
    """Delete a session and its messages (owned by user)."""
    conn = _get_db()
    conn.execute(
        "DELETE FROM chat_messages WHERE session_id = ? AND session_id IN (SELECT id FROM chat_sessions WHERE user_id = ?)",
        (session_id, user_id),
    )
    conn.execute(
        "DELETE FROM chat_sessions WHERE id = ? AND user_id = ?",
        (session_id, user_id),
    )
    conn.commit()
    conn.close()


# ── API key authentication decorator ─────────────────────────────────────────
def api_key_required(f):
    """Decorator for API endpoints that require an API key."""
    @wraps(f)
    def decorated(*args, **kwargs):
        api_key = request.headers.get("X-API-Key") or request.args.get("api_key")
        if not api_key:
            return jsonify({"error": "API key required. Pass via X-API-Key header."}), 401
        user = get_user_by_api_key(api_key)
        if not user:
            return jsonify({"error": "Invalid API key."}), 401
        request.api_user = user
        return f(*args, **kwargs)
    return decorated


# ── Flask-Login setup ────────────────────────────────────────────────────────
login_manager = LoginManager()


@login_manager.user_loader
def load_user(user_id):
    return get_user_by_id(user_id)


def init_auth(app):
    """Initialize authentication on the Flask app."""
    app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))
    login_manager.init_app(app)
    login_manager.login_view = "auth_login_page"
    init_db()
    logger.info("Auth module initialized.")
