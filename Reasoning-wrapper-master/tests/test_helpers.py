"""
test_helpers.py — Unit tests for utility/helper functions in app.py.

Tests input sanitization, secret redaction, history normalization,
and model configuration helpers.
"""

import os
import sys
import pytest
from pathlib import Path

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("GEMINI_API_KEY", "test-key")
os.environ.setdefault("HF_API_TOKEN", "test-hf-key")

from app import (
    _redact_secrets,
    _normalize_history,
    _history_to_text,
    _sanitize_mode_config,
    _public_traces,
    ALLOWED_MODELS,
    DEFAULT_MODEL,
    MODELS_CONFIG,
)


# ── Secret redaction ─────────────────────────────────────────────────────────

class TestRedactSecrets:
    def test_redact_gemini_key(self):
        text = "My key is AIzaSyC1234567890123456789012345678901"
        result = _redact_secrets(text)
        assert "AIzaSy" not in result
        assert "REDACTED" in result

    def test_redact_hf_token(self):
        text = "Token: hf_abcdefghijklmnopqrstuvwx"
        result = _redact_secrets(text)
        assert "hf_" not in result
        assert "REDACTED" in result

    def test_redact_openai_key(self):
        text = "sk-1234567890abcdefghijklmnopqrstuvwxyz"
        result = _redact_secrets(text)
        assert "sk-" not in result

    def test_redact_api_key_pattern(self):
        text = "api_key = 'my-secret-value-here'"
        result = _redact_secrets(text)
        assert "my-secret-value" not in result

    def test_empty_input(self):
        assert _redact_secrets("") == ""
        assert _redact_secrets(None) is None

    def test_no_secrets(self):
        text = "Just a normal string with no secrets."
        assert _redact_secrets(text) == text


# ── History normalization ────────────────────────────────────────────────────

class TestNormalizeHistory:
    def test_empty_history(self):
        result = _normalize_history([], "hello")
        assert len(result) == 1
        assert result[0]["role"] == "user"
        assert result[0]["content"] == "hello"

    def test_none_history(self):
        result = _normalize_history(None, "test")
        assert len(result) == 1

    def test_valid_history(self):
        history = [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello!"},
        ]
        result = _normalize_history(history, "How are you?")
        assert len(result) == 3
        assert result[-1]["content"] == "How are you?"

    def test_filters_invalid_roles(self):
        history = [
            {"role": "system", "content": "should be filtered"},
            {"role": "user", "content": "valid"},
            {"role": "hacker", "content": "invalid"},
        ]
        result = _normalize_history(history, "test")
        roles = [m["role"] for m in result]
        assert "system" not in roles
        assert "hacker" not in roles

    def test_truncates_long_content(self):
        history = [{"role": "user", "content": "x" * 10000}]
        result = _normalize_history(history, "test")
        assert len(result[0]["content"]) == 8000

    def test_dedup_last_message(self):
        """If history already ends with the user message, don't duplicate."""
        history = [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
            {"role": "user", "content": "same message"},
        ]
        result = _normalize_history(history, "same message")
        assert result[-1]["content"] == "same message"
        # Should not have two consecutive "same message"
        user_msgs = [m["content"] for m in result if m["role"] == "user"]
        assert user_msgs.count("same message") == 1


# ── History to text ──────────────────────────────────────────────────────────

class TestHistoryToText:
    def test_empty_history(self):
        result = _history_to_text([])
        assert "no prior" in result.lower()

    def test_formats_messages(self):
        history = [
            {"role": "user", "content": "What is 2+2?"},
            {"role": "assistant", "content": "4"},
        ]
        result = _history_to_text(history)
        assert "USER:" in result
        assert "ASSISTANT:" in result
        assert "2+2" in result

    def test_truncates_at_max_chars(self):
        history = [{"role": "user", "content": "x" * 20000}]
        result = _history_to_text(history, max_chars=100)
        assert len(result) < 200


# ── Mode config sanitization ────────────────────────────────────────────────

class TestSanitizeModeConfig:
    def test_valid_config(self):
        config = {
            "name": "Test Mode",
            "agents": [
                {"name": "Agent 1", "persona": "You are helpful.", "temperature": 0.7},
                {"name": "Agent 2", "persona": "You are critical.", "temperature": 0.5},
            ],
        }
        result = _sanitize_mode_config(config)
        assert result["name"] == "Test Mode"
        assert len(result["agents"]) == 2

    def test_invalid_config(self):
        result = _sanitize_mode_config("not a dict")
        assert result["name"] == "Custom Mode"
        assert result["agents"] == []

    def test_bounds_temperature(self):
        config = {
            "name": "Test",
            "agents": [{"name": "A", "temperature": 5.0}],
        }
        result = _sanitize_mode_config(config)
        assert result["agents"][0]["temperature"] <= 1.5

    def test_limits_agent_count(self):
        config = {
            "name": "Many Agents",
            "agents": [{"name": f"Agent {i}"} for i in range(20)],
        }
        result = _sanitize_mode_config(config)
        assert len(result["agents"]) <= 16


# ── Public traces ────────────────────────────────────────────────────────────

class TestPublicTraces:
    def test_hides_prompts_by_default(self):
        traces = [
            {"agent": "Classifier", "content": "output", "input_messages": [{"role": "system", "content": "secret"}], "elapsed_ms": 100},
        ]
        result = _public_traces(traces, include_prompts=False)
        assert result[0]["input_messages"] == []

    def test_shows_prompts_when_enabled(self):
        traces = [
            {"agent": "Classifier", "content": "output", "input_messages": [{"role": "system", "content": "prompt"}], "elapsed_ms": 100},
        ]
        result = _public_traces(traces, include_prompts=True)
        assert len(result[0]["input_messages"]) == 1

    def test_empty_traces(self):
        assert _public_traces([], True) == []
        assert _public_traces(None, False) == []


# ── Model configuration ─────────────────────────────────────────────────────

class TestModelConfig:
    def test_default_model_exists(self):
        assert DEFAULT_MODEL in ALLOWED_MODELS

    def test_all_models_have_required_fields(self):
        for m in MODELS_CONFIG:
            assert "id" in m
            assert "name" in m
            assert "provider" in m
            assert m["provider"] in {"gemini", "huggingface"}

    def test_credit_multipliers(self):
        for m in MODELS_CONFIG:
            assert "credit_multiplier" in m
            assert m["credit_multiplier"] > 0
