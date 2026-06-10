"""
test_auth.py — Unit tests for the authentication module.

Tests user registration, login, password hashing, API key auth,
and chat session CRUD.
"""

import os
import sys
import pytest
import tempfile
from pathlib import Path

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import auth


@pytest.fixture(autouse=True)
def use_temp_db(tmp_path, monkeypatch):
    """Use a temporary database for each test."""
    test_db = tmp_path / "test_vibe.db"
    monkeypatch.setattr(auth, "DB_PATH", test_db)
    auth.init_db()
    yield


# ── Password hashing ────────────────────────────────────────────────────────

class TestPasswordHashing:
    def test_hash_and_verify(self):
        hashed = auth._hash_password("my_secret")
        assert "$" in hashed
        assert auth._verify_password("my_secret", hashed)

    def test_wrong_password(self):
        hashed = auth._hash_password("my_secret")
        assert not auth._verify_password("wrong_password", hashed)

    def test_empty_password(self):
        hashed = auth._hash_password("")
        assert auth._verify_password("", hashed)
        assert not auth._verify_password("notempty", hashed)

    def test_invalid_stored_hash(self):
        assert not auth._verify_password("anything", "no-dollar-sign-here")


# ── User creation ────────────────────────────────────────────────────────────

class TestUserCreation:
    def test_create_user_success(self):
        user, err = auth.create_user("testuser", "test@example.com", "password123")
        assert err == ""
        assert user is not None
        assert user.username == "testuser"
        assert user.email == "test@example.com"
        assert user.api_key.startswith("vibe_")

    def test_create_user_short_username(self):
        user, err = auth.create_user("ab", "x@y.com", "password123")
        assert user is None
        assert "3 characters" in err

    def test_create_user_long_username(self):
        user, err = auth.create_user("a" * 31, "x@y.com", "password123")
        assert user is None
        assert "30 characters" in err

    def test_create_user_invalid_email(self):
        user, err = auth.create_user("testuser", "no-at-sign", "password123")
        assert user is None
        assert "email" in err.lower()

    def test_create_user_short_password(self):
        user, err = auth.create_user("testuser", "test@example.com", "12345")
        assert user is None
        assert "6 characters" in err

    def test_duplicate_username(self):
        auth.create_user("same_user", "one@example.com", "password123")
        user, err = auth.create_user("same_user", "two@example.com", "password123")
        assert user is None
        assert "taken" in err.lower()

    def test_duplicate_email(self):
        auth.create_user("user1", "same@example.com", "password123")
        user, err = auth.create_user("user2", "same@example.com", "password123")
        assert user is None
        assert "registered" in err.lower()


# ── Authentication ───────────────────────────────────────────────────────────

class TestAuthentication:
    def test_authenticate_by_username(self):
        auth.create_user("login_test", "login@test.com", "mypass")
        user = auth.authenticate_user("login_test", "mypass")
        assert user is not None
        assert user.username == "login_test"

    def test_authenticate_by_email(self):
        auth.create_user("email_login", "email@login.com", "mypass")
        user = auth.authenticate_user("email@login.com", "mypass")
        assert user is not None
        assert user.username == "email_login"

    def test_authenticate_wrong_password(self):
        auth.create_user("wrong_pw", "wrong@pw.com", "mypass")
        user = auth.authenticate_user("wrong_pw", "badpass")
        assert user is None

    def test_authenticate_nonexistent_user(self):
        user = auth.authenticate_user("noone", "nopass")
        assert user is None


# ── User lookup ──────────────────────────────────────────────────────────────

class TestUserLookup:
    def test_get_by_id(self):
        created, _ = auth.create_user("lookup", "lookup@test.com", "pass123")
        found = auth.get_user_by_id(created.id)
        assert found is not None
        assert found.username == "lookup"

    def test_get_by_api_key(self):
        created, _ = auth.create_user("apikey_user", "apikey@test.com", "pass123")
        found = auth.get_user_by_api_key(created.api_key)
        assert found is not None
        assert found.username == "apikey_user"

    def test_get_nonexistent_user(self):
        assert auth.get_user_by_id("nonexistent-id") is None
        assert auth.get_user_by_username("nonexistent") is None
        assert auth.get_user_by_api_key("vibe_fake") is None


# ── API key regeneration ─────────────────────────────────────────────────────

class TestApiKey:
    def test_regenerate_api_key(self):
        user, _ = auth.create_user("regen", "regen@test.com", "pass123")
        old_key = user.api_key
        new_key = auth.regenerate_api_key(user.id)
        assert new_key != old_key
        assert new_key.startswith("vibe_")

        # Old key should no longer work
        assert auth.get_user_by_api_key(old_key) is None
        # New key should work
        found = auth.get_user_by_api_key(new_key)
        assert found is not None
        assert found.username == "regen"


# ── Chat session CRUD ────────────────────────────────────────────────────────

class TestChatSessions:
    def test_create_session(self):
        user, _ = auth.create_user("chatuser", "chat@test.com", "pass123")
        session_id = auth.create_chat_session(user.id, "My Test Chat")
        assert session_id is not None
        sessions = auth.get_user_sessions(user.id)
        assert len(sessions) == 1
        assert sessions[0]["title"] == "My Test Chat"

    def test_save_and_get_messages(self):
        user, _ = auth.create_user("msguser", "msg@test.com", "pass123")
        session_id = auth.create_chat_session(user.id)
        auth.save_message(session_id, "user", "Hello!")
        auth.save_message(session_id, "assistant", "Hi there!", "GREETING")
        messages = auth.get_session_messages(session_id)
        assert len(messages) == 2
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "Hello!"
        assert messages[1]["role"] == "assistant"
        assert messages[1]["classification"] == "GREETING"

    def test_auto_title_from_first_message(self):
        user, _ = auth.create_user("titleuser", "title@test.com", "pass123")
        session_id = auth.create_chat_session(user.id)
        auth.save_message(session_id, "user", "What is the meaning of life?")
        sessions = auth.get_user_sessions(user.id)
        assert "meaning of life" in sessions[0]["title"].lower()

    def test_delete_session(self):
        user, _ = auth.create_user("deluser", "del@test.com", "pass123")
        session_id = auth.create_chat_session(user.id)
        auth.save_message(session_id, "user", "test message")
        auth.delete_chat_session(session_id, user.id)
        sessions = auth.get_user_sessions(user.id)
        assert len(sessions) == 0
        messages = auth.get_session_messages(session_id)
        assert len(messages) == 0

    def test_multiple_sessions(self):
        user, _ = auth.create_user("multiuser", "multi@test.com", "pass123")
        auth.create_chat_session(user.id, "Chat 1")
        auth.create_chat_session(user.id, "Chat 2")
        auth.create_chat_session(user.id, "Chat 3")
        sessions = auth.get_user_sessions(user.id)
        assert len(sessions) == 3


# ── User model ───────────────────────────────────────────────────────────────

class TestUserModel:
    def test_to_dict(self):
        user, _ = auth.create_user("dictuser", "dict@test.com", "pass123")
        d = user.to_dict()
        assert "id" in d
        assert d["username"] == "dictuser"
        assert d["email"] == "dict@test.com"
        assert "api_key" in d
        assert "password_hash" not in d  # Should not expose hash

    def test_get_id(self):
        user, _ = auth.create_user("iduser", "id@test.com", "pass123")
        assert user.get_id() == str(user.id)
