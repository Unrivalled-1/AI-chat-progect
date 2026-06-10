"""
test_app.py — Unit tests for the Flask application routes.

Tests the main app routes, rate limiting, input validation,
and API endpoints.
"""

import os
import sys
import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Set env vars before importing app
os.environ.setdefault("GEMINI_API_KEY", "test-key")
os.environ.setdefault("HF_API_TOKEN", "test-hf-key")

import auth


@pytest.fixture(autouse=True)
def use_temp_db(tmp_path, monkeypatch):
    """Use a temporary database for tests."""
    test_db = tmp_path / "test_vibe.db"
    monkeypatch.setattr(auth, "DB_PATH", test_db)
    auth.init_db()


@pytest.fixture
def client():
    """Create a test client."""
    from app import app
    app.config["TESTING"] = True
    app.config["WTF_CSRF_ENABLED"] = False
    with app.test_client() as c:
        yield c


# ── Basic routes ─────────────────────────────────────────────────────────────

class TestBasicRoutes:
    def test_index_page(self, client):
        res = client.get("/")
        assert res.status_code == 200
        assert b"Vibe" in res.data

    def test_login_page(self, client):
        res = client.get("/login")
        assert res.status_code == 200
        assert b"Sign In" in res.data or b"Login" in res.data or b"login" in res.data

    def test_health_endpoint(self, client):
        res = client.get("/api/v1/health")
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "ok"
        assert "version" in data

    def test_models_endpoint(self, client):
        res = client.get("/api/v1/models")
        assert res.status_code == 200
        data = res.get_json()
        assert "models" in data
        assert len(data["models"]) > 0

    def test_404(self, client):
        res = client.get("/nonexistent-page-xyz")
        assert res.status_code == 404
        data = res.get_json()
        assert "error" in data


# ── Auth routes ──────────────────────────────────────────────────────────────

class TestAuthRoutes:
    def test_register_and_login(self, client):
        # Register
        res = client.post("/auth/register", json={
            "username": "testuser",
            "email": "test@test.com",
            "password": "pass123",
        })
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "ok"
        assert data["user"]["username"] == "testuser"

        # Check auth status
        res = client.get("/auth/me")
        data = res.get_json()
        assert data["authenticated"] is True

        # Logout
        res = client.post("/auth/logout")
        assert res.status_code == 200

        # Check auth after logout
        res = client.get("/auth/me")
        data = res.get_json()
        assert data["authenticated"] is False

        # Login
        res = client.post("/auth/login", json={
            "username": "testuser",
            "password": "pass123",
        })
        assert res.status_code == 200

    def test_register_invalid(self, client):
        res = client.post("/auth/register", json={
            "username": "ab",
            "email": "bad",
            "password": "12",
        })
        assert res.status_code == 400

    def test_login_wrong_password(self, client):
        client.post("/auth/register", json={
            "username": "logintest",
            "email": "login@test.com",
            "password": "pass123",
        })
        client.post("/auth/logout")
        res = client.post("/auth/login", json={
            "username": "logintest",
            "password": "wrongpass",
        })
        assert res.status_code == 401


# ── Chat API validation ─────────────────────────────────────────────────────

class TestChatValidation:
    def test_empty_message(self, client):
        res = client.post("/api/chat", json={"message": ""})
        assert res.status_code == 400
        data = res.get_json()
        assert "empty" in data["error"].lower() or "Empty" in data["error"]

    def test_message_too_long(self, client):
        res = client.post("/api/chat", json={"message": "x" * 13000})
        assert res.status_code == 400
        data = res.get_json()
        assert "long" in data["error"].lower()


# ── API v1 (key-based auth) ─────────────────────────────────────────────────

class TestApiV1:
    def test_chat_without_api_key(self, client):
        res = client.post("/api/v1/chat", json={"message": "hello"})
        assert res.status_code == 401
        data = res.get_json()
        assert "API key" in data["error"]

    def test_chat_with_invalid_api_key(self, client):
        res = client.post(
            "/api/v1/chat",
            json={"message": "hello"},
            headers={"X-API-Key": "vibe_invalid_key"},
        )
        assert res.status_code == 401


# ── Rate limiting ────────────────────────────────────────────────────────────

class TestRateLimiting:
    def test_rate_limit_functions(self):
        from app import _rate_limit_exceeded, _rate_buckets
        _rate_buckets.clear()
        # Should not be rate limited initially
        assert not _rate_limit_exceeded("test-ip")


# ── Memory endpoint ─────────────────────────────────────────────────────────

class TestMemoryEndpoint:
    def test_memory_get(self, client):
        res = client.get("/api/memory")
        assert res.status_code == 200
        data = res.get_json()
        assert "manifesto" in data
        assert "heuristics" in data


class TestScheduledActions:
    def test_list_scheduled_actions(self, client):
        res = client.get("/api/scheduled-actions")
        assert res.status_code == 200
        data = res.get_json()
        assert "actions" in data
        assert isinstance(data["actions"], list)

    def test_create_scheduled_action(self, client):
        from datetime import datetime, timezone, timedelta
        run_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        res = client.post("/api/scheduled-actions", json={
            "run_at": run_at,
            "message": "Scheduled test task",
            "mode": "reasoning_fast",
        })
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "ok"
        assert "action" in data
        assert data["action"]["message"] == "Scheduled test task"

    def test_create_scheduled_action_requires_message(self, client):
        from datetime import datetime, timezone, timedelta
        run_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        res = client.post("/api/scheduled-actions", json={
            "run_at": run_at,
            "message": "",
        })
        assert res.status_code == 400


# ── Session endpoints ────────────────────────────────────────────────────────

class TestSessionEndpoints:
    def test_sessions_unauthenticated(self, client):
        res = client.get("/api/sessions")
        data = res.get_json()
        assert data["sessions"] == []

    def test_create_session_unauthenticated(self, client):
        res = client.post("/api/sessions", json={"title": "Test"})
        assert res.status_code == 401
