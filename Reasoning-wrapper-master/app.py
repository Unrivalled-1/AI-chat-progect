"""
Flask web server for the Vibe Coding Reasoning Engine.
Routes user messages through the multi-agent pipeline and returns
both the final reply and the full agent trace for the UI.

Features:
  - Multi-agent reasoning pipeline (Classifier → Synthesizer)
  - User authentication (register / login / logout)
  - Persistent chat history (SQLite)
  - RESTful API with API-key auth
  - WebSocket real-time chat (Flask-SocketIO)
  - Structured logging with file rotation
  - Rate limiting & security guardrails
"""
import eventlet
eventlet.monkey_patch()

import json
import io
import logging
import logging.handlers
import os
import re
import uuid
import html as html_lib
import threading
import ipaddress
import socket
import time
import traceback
import concurrent.futures
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import parse_qs, quote_plus, unquote, urlparse, urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from flask_login import current_user, login_user, logout_user, login_required
from flask_socketio import SocketIO, emit

from huggingface_hub import InferenceClient
from google import genai

# Local model constants / cache
# Use an *ungated*, small instruct model so first-run download works without an
# accepted HF license (the gated google/gemma-* repos require auth + license click).
# Qwen2.5-1.5B-Instruct is Apache-2.0, ~3GB, has a chat template, runs on CPU.
GEMMA_MODEL_ID = "Qwen/Qwen2.5-1.5B-Instruct"
GEMMA_MODELS = {}
GEMMA_LOAD_ERROR = ""
GEMMA_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=1)
# Kimi K2 Instruct is the current flagship Moonshot model that is actually served
# by an HF Router provider (novita) as of 2026-04. The old "Moonlight-16B-A3B"
# repo is no longer routable. No ":cheapest" suffix — Router picks the provider.
KIMI_FALLBACK_MODEL_ID = "moonshotai/Kimi-K2-Instruct"

from reasoning.pipeline import (
    run_pipeline,
    MULTI_PRESET_ID,
    MULTI_LIGHT_MODEL,
    MULTI_STRONG_MODEL,
)
from reasoning import memory
from reasoning.constitution import SYNTHESIZER_PREAMBLE, RUNTIME_CONTEXT, CONSTITUTION, HARD_ETHICS
from auth import (
    init_auth,
    authenticate_user,
    create_user,
    get_user_by_api_key,
    api_key_required,
    create_chat_session,
    get_user_sessions,
    save_message,
    get_session_messages,
    delete_chat_session,
)

# ── Logging (structured, with file rotation) ─────────────────────────────────
LOG_DIR = Path(__file__).resolve().parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s  %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.handlers.RotatingFileHandler(
            LOG_DIR / "vibe.log",
            maxBytes=5_000_000,
            backupCount=3,
            encoding="utf-8",
        ),
    ],
)
logger = logging.getLogger("vibe")

# ── Configuration ────────────────────────────────────────────────────────────
# No hardcoded API keys in source.
HF_TOKEN = os.environ.get("HF_API_TOKEN")
DEFAULT_GEMINI_KEY = os.environ.get("GEMINI_API_KEY")

# Models prefixed with 'gemini-' route to Google, local models route to transformers,
# and the rest route to HuggingFace.
MODELS_CONFIG = [
    {"id": MULTI_PRESET_ID, "name": "🧩 Multi Preset (Light agents + Strong Synthesizer)", "provider": "huggingface", "credit_multiplier": 1.6},
    {"id": "gemini-3-flash-preview", "name": "Gemini 3 Flash (Preview)", "provider": "gemini", "credit_multiplier": 1.2},
    {"id": "gemini-3-pro-preview",   "name": "Gemini 3 Pro (Preview)", "provider": "gemini", "credit_multiplier": 2.5},
    {"id": "gemini-2.0-flash-lite-preview", "name": "Gemini 2.0 Flash Lite (Tiny)", "provider": "gemini", "credit_multiplier": 0.25},
    {"id": "gemini-2.5-flash",       "name": "Gemini 2.5 Flash", "provider": "gemini", "credit_multiplier": 1.0},
    {"id": "gemini-2.0-flash",       "name": "Gemini 2.0 Flash", "provider": "gemini", "credit_multiplier": 0.6},
    {"id": "deepseek-ai/DeepSeek-V4-Pro", "name": "DeepSeek V4 Pro", "provider": "huggingface", "credit_multiplier": 2.0},
    {"id": "Qwen/Qwen2.5-Coder-7B-Instruct", "name": "Qwen 2.5 Coder 7B (Light)", "provider": "huggingface", "credit_multiplier": 0.7},
    {"id": "meta-llama/Llama-3.1-8B-Instruct", "name": "Llama 3.1 8B (Fast)", "provider": "huggingface", "credit_multiplier": 0.8},
    {"id": "Qwen/Qwen2.5-Coder-32B-Instruct", "name": "Qwen 2.5 Coder 32B", "provider": "huggingface", "credit_multiplier": 2.0},
    {"id": "meta-llama/Llama-3.3-70B-Instruct", "name": "Llama 3.3 70B", "provider": "huggingface", "credit_multiplier": 3.0},
    # Kimi K2 Instruct — served via Novita on the HF Router.
    {"id": KIMI_FALLBACK_MODEL_ID, "name": "Kimi K2 Instruct (Moonshot)", "provider": "huggingface", "credit_multiplier": 0.8},
    {"id": "moonshotai/Kimi-K2-Thinking", "name": "Kimi K2 Thinking (Moonshot)", "provider": "huggingface", "credit_multiplier": 1.2},
]
ALLOWED_MODELS = [m["id"] for m in MODELS_CONFIG]
DEFAULT_MODEL = "gemini-2.0-flash-lite-preview"
USER_MODELS: list[dict] = []
HIDDEN_MODEL_IDS: set[str] = set()


def _refresh_allowed_models() -> None:
    global ALLOWED_MODELS
    ALLOWED_MODELS = [m.get("id") for m in MODELS_CONFIG if m.get("id")] + [
        m.get("id") for m in USER_MODELS if m.get("id")
    ]


def _all_models() -> list[dict]:
    return MODELS_CONFIG + USER_MODELS


def _dropdown_models() -> list[dict]:
    return [m for m in _all_models() if m.get("id") and m.get("id") not in HIDDEN_MODEL_IDS]


def _default_dropdown_model() -> str:
    ids = [m.get("id") for m in _dropdown_models() if m.get("id")]
    if DEFAULT_MODEL in ids:
        return DEFAULT_MODEL
    return ids[0] if ids else DEFAULT_MODEL


def _is_local_model(model_id: str) -> bool:
    return model_id == GEMMA_MODEL_ID or model_id.startswith("local:")


def _normalize_model_id(model_id: str) -> str:
    raw = str(model_id or "").strip()
    lowered = raw.lower()
    if "moonshotai/kimi" in lowered or lowered.startswith("kimi"):
        return KIMI_FALLBACK_MODEL_ID
    return raw


def _load_local_gemma():
    global GEMMA_LOAD_ERROR
    if GEMMA_MODEL_ID in GEMMA_MODELS:
        return GEMMA_MODELS[GEMMA_MODEL_ID]
    if GEMMA_LOAD_ERROR:
        raise RuntimeError(GEMMA_LOAD_ERROR)

    from transformers import AutoTokenizer, AutoModelForCausalLM

    try:
        tokenizer = AutoTokenizer.from_pretrained(GEMMA_MODEL_ID)
        model = AutoModelForCausalLM.from_pretrained(
            GEMMA_MODEL_ID,
            torch_dtype="auto",
            device_map="auto",
        )
        GEMMA_MODELS[GEMMA_MODEL_ID] = (tokenizer, model)
        return tokenizer, model
    except Exception as exc:
        GEMMA_LOAD_ERROR = (
            f"Local model ({GEMMA_MODEL_ID}) failed to load: {exc}. "
            "If this is a first run, make sure the model can be downloaded and the machine has enough disk/RAM."
        )
        raise RuntimeError(GEMMA_LOAD_ERROR) from exc

app = Flask(__name__)
WORKSPACE_ROOT = Path(__file__).resolve().parent

# ── Initialize auth & WebSocket ──────────────────────────────────────────────
init_auth(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# ── Security / reliability guardrails ──────────────────────────────────────
MAX_USER_MESSAGE_CHARS = 12000
MAX_MODE_NAME_CHARS = 64
MAX_AGENT_NAME_CHARS = 40
MAX_AGENT_PERSONA_CHARS = 3000
MAX_FILE_CONTEXT_CHARS = 2400
MAX_WEB_CONTEXT_CHARS = 32000
MAX_WEB_URLS = 3
WEB_USER_AGENT = "VibeEngine/2.0 (+https://localhost)"

RATE_WINDOW_SEC = 60
RATE_LIMIT_PER_WINDOW = 40
_rate_buckets: dict[str, list[float]] = {}

_RUN_REGISTRY_MAX = 200
_MISSION_RUNS: dict[str, dict] = {}
_SCHEDULED_ACTIONS: dict[str, dict] = {}
_SCHED_LOCK = threading.Lock()


def _new_schedule_id() -> str:
    return f"sched-{uuid.uuid4().hex[:10]}"


def _parse_iso_utc(value: str) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def _to_iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _resolve_model_for_mode(mode: str, selected_model: str) -> str:
    return (
        MULTI_STRONG_MODEL
        if (mode in {"direct", "conversational", "custom", "project_manager"} and selected_model == MULTI_PRESET_ID)
        else selected_model
    )


def _resolve_pipeline_model(selected_model: str, gemini_api_key: str = "", hf_api_key: str = "") -> tuple[str, str | None]:
    """Choose a model that can run the multi-agent pipeline.

    Local transformer models work through app.py helpers, but reasoning.pipeline
    owns its own LLM helper and expects a provider client. Avoid passing a None
    client into that path.
    """
    selected_model = str(selected_model or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if not _is_local_model(selected_model):
        return selected_model, None
    if gemini_api_key:
        return "gemini-2.5-flash", (
            "Reasoning mode cannot use the local Gemma model yet, so this request was routed to Gemini 2.5 Flash."
        )
    if hf_api_key:
        return KIMI_FALLBACK_MODEL_ID, (
            "Reasoning mode cannot use the local Gemma model yet, so this request was routed to the Hugging Face Kimi model."
        )
    return selected_model, (
        "Reasoning mode cannot use the local Gemma model yet. Add a Gemini/Hugging Face API key in Settings, "
        "or switch this chat to Direct/Conversational mode."
    )


def _new_run_id() -> str:
    return f"run-{uuid.uuid4().hex[:10]}"


def _new_branch_id() -> str:
    return f"branch-{uuid.uuid4().hex[:8]}"


def _prune_runs() -> None:
    if len(_MISSION_RUNS) <= _RUN_REGISTRY_MAX:
        return
    ordered = sorted(_MISSION_RUNS.items(), key=lambda x: float(x[1].get("started_at", 0.0)))
    for rid, _ in ordered[: max(1, len(_MISSION_RUNS) - _RUN_REGISTRY_MAX)]:
        _MISSION_RUNS.pop(rid, None)


def _init_run_state(
    *,
    run_id: str,
    user_message: str,
    mode: str,
    selected_model: str,
    resolved_model: str,
    reasoning_mode: str,
    branch_id: str = "main",
    parent_run_id: str = "",
    resume_from_checkpoint: str = "",
) -> dict:
    state = {
        "run_id": run_id,
        "status": "running",
        "paused": False,
        "branch_id": branch_id,
        "parent_run_id": parent_run_id,
        "resume_from_checkpoint": resume_from_checkpoint,
        "started_at": time.time(),
        "finished_at": None,
        "mode": mode,
        "reasoning_mode": reasoning_mode,
        "model": selected_model,
        "resolved_model": resolved_model,
        "user_message": user_message[:8000],
        "controls": {
            "approvals": [],
            "reroutes": [],
            "events": [],
        },
        "result": {
            "reply": "",
            "classification": "",
            "tags": [],
            "traces": [],
            "checkpoints": [],
            "memory_influence": [],
            "error": None,
        },
    }
    _MISSION_RUNS[run_id] = state
    _prune_runs()
    return state


def _update_run_trace(run_id: str | None, agent_name: str, status: str, content: str = "", elapsed_ms: int = 0, input_messages: list | None = None, web_sources: list | None = None):
    if not run_id:
        return
    run_state = _MISSION_RUNS.get(run_id)
    if not run_state:
        return
    
    traces = run_state["result"].get("traces", [])
    
    # Check if there is already a trace for this agent
    existing_idx = -1
    for idx, t in enumerate(traces):
        t_agent = t.get("agent") if isinstance(t, dict) else getattr(t, "agent", "")
        if t_agent == agent_name:
            existing_idx = idx
            break
            
    trace_data = {
        "agent": agent_name,
        "status": status,
        "content": content,
        "elapsed_ms": elapsed_ms,
        "input_messages": input_messages or []
    }
    if web_sources:
        trace_data["web_sources"] = web_sources
    
    if existing_idx >= 0:
        if not web_sources and traces[existing_idx].get("web_sources"):
            trace_data["web_sources"] = traces[existing_idx]["web_sources"]
        traces[existing_idx] = trace_data
    else:
        traces.append(trace_data)
        
    run_state["result"]["traces"] = traces


def _append_control_event(run_state: dict, action: str, payload: dict | None = None) -> None:
    run_state.setdefault("controls", {}).setdefault("events", []).append({
        "ts": time.time(),
        "action": action,
        "payload": payload or {},
    })


def _public_run_state(run_state: dict) -> dict:
    return deepcopy(run_state)


def _compare_runs(a: dict, b: dict) -> dict:
    a_res = a.get("result", {})
    b_res = b.get("result", {})
    a_traces = a_res.get("traces", [])
    b_traces = b_res.get("traces", [])
    a_ms = sum(int(t.get("elapsed_ms", 0) or 0) for t in a_traces)
    b_ms = sum(int(t.get("elapsed_ms", 0) or 0) for t in b_traces)
    return {
        "left_run_id": a.get("run_id"),
        "right_run_id": b.get("run_id"),
        "left": {
            "classification": a_res.get("classification"),
            "trace_count": len(a_traces),
            "total_elapsed_ms": a_ms,
            "checkpoint_count": len(a_res.get("checkpoints", [])),
            "tags": a_res.get("tags", []),
        },
        "right": {
            "classification": b_res.get("classification"),
            "trace_count": len(b_traces),
            "total_elapsed_ms": b_ms,
            "checkpoint_count": len(b_res.get("checkpoints", [])),
            "tags": b_res.get("tags", []),
        },
        "diff": {
            "trace_count": len(a_traces) - len(b_traces),
            "elapsed_ms": a_ms - b_ms,
            "left_only_agents": sorted({t.get("agent", "") for t in a_traces} - {t.get("agent", "") for t in b_traces}),
            "right_only_agents": sorted({t.get("agent", "") for t in b_traces} - {t.get("agent", "") for t in a_traces}),
        },
    }


def _execute_scheduled_action(action_id: str) -> None:
    with _SCHED_LOCK:
        action = _SCHEDULED_ACTIONS.get(action_id)
        if not action or not action.get("enabled", True):
            return
        if action.get("status") == "running":
            return
        action["status"] = "running"
        action["last_started_at"] = _to_iso_utc(datetime.now(timezone.utc))

    message = str(action.get("message") or "").strip()
    instructions = str(action.get("instructions") or "").strip()
    agent_name = str(action.get("agent_name") or action.get("target_agent") or "Agent").strip()
    sources = action.get("sources") if isinstance(action.get("sources"), list) else []
    mode = str(action.get("mode") or "conversational").strip().lower()
    selected_model = str(action.get("model") or DEFAULT_MODEL)
    reasoning_mode = str(action.get("reasoning_mode") or "once").strip().lower()
    target_agent = str(action.get("target_agent") or "").strip()
    note = str(action.get("note") or "").strip()
    route_note = None
    resolved_model = _resolve_model_for_mode(mode, selected_model)

    run_id = _new_run_id()
    base_msg = instructions or message
    if route_note:
        base_msg = f"{base_msg}\n\n[ROUTING_NOTE]\n{route_note}\n[/ROUTING_NOTE]"
    sources_block = ""
    if sources:
        lines = [f"- {str(u)[:260]}" for u in sources[:12] if str(u).strip()]
        if lines:
            sources_block = "\n\n[SOURCES]\n" + "\n".join(lines) + "\n[/SOURCES]"

    run_message = f"{base_msg}{sources_block}".strip()
    if agent_name:
        run_message = (
            f"[SCHEDULED_AGENT]\n"
            f"Agent profile: {agent_name}\n"
            f"[/SCHEDULED_AGENT]\n\n"
            f"{run_message}"
        ).strip()
    if target_agent:
        run_message = (
            f"{run_message}\n\n"
            "[SCHEDULED_SINGLE_AGENT]\n"
            f"Focus on agent={target_agent}.\n"
            f"Agent profile: {agent_name}.\n"
            f"{note}\n"
            "[/SCHEDULED_SINGLE_AGENT]"
        ).strip()

    run_state = _init_run_state(
        run_id=run_id,
        user_message=run_message,
        mode=mode,
        selected_model=selected_model,
        resolved_model=resolved_model,
        reasoning_mode=reasoning_mode,
        branch_id="scheduled",
        parent_run_id=str(action.get("id") or ""),
    )
    _append_control_event(run_state, "scheduled-execution", {"schedule_id": action_id})

    err = None
    reply = ""
    classification = ""
    tags = []
    traces = []
    checkpoints = []
    memory_influence = []

    try:
        is_gemini = resolved_model.startswith("gemini-")
        is_local = _is_local_model(resolved_model)
        if is_local:
            active_client = _LocalPipelineClient()
        elif is_gemini:
            if not DEFAULT_GEMINI_KEY:
                raise RuntimeError("Missing GEMINI_API_KEY for scheduled action")
            active_client = genai.Client(api_key=DEFAULT_GEMINI_KEY, http_options={'api_version': 'v1beta'})
        else:
            if not HF_TOKEN:
                raise RuntimeError("Missing HF_API_TOKEN for scheduled action")
            active_client = InferenceClient(token=HF_TOKEN)

        if mode == "direct":
            reply = run_direct_chat(active_client, resolved_model, run_message)
            classification = "DIRECT"
        elif mode == "conversational":
            reply, conv_traces, _ = run_conversational_chat(active_client, selected_model, run_message)
            classification = "CONVERSATIONAL"
            traces = _public_traces(conv_traces, include_prompts=False)
        else:
            result = run_pipeline(
                active_client,
                selected_model,
                run_message,
                reasoning_mode="historian" if mode == "reasoning_historian" else ("fast" if mode == "reasoning_fast" else reasoning_mode),
                run_id=run_id,
                branch_id="scheduled",
            )
            reply = result.final_reply
            classification = result.classification
            tags = result.tags
            traces = _public_traces(result.traces, include_prompts=False)
            checkpoints = result.checkpoints
            memory_influence = result.memory_influence
            err = result.error
    except Exception as exc:
        err = str(exc)

    run_state["status"] = "completed" if not err else "failed"
    run_state["finished_at"] = time.time()
    run_state["result"].update({
        "reply": reply,
        "classification": classification,
        "tags": tags,
        "traces": traces,
        "checkpoints": checkpoints,
        "memory_influence": memory_influence,
        "error": err,
    })

    with _SCHED_LOCK:
        action = _SCHEDULED_ACTIONS.get(action_id)
        if not action:
            return
        action["last_run_id"] = run_id
        action["last_finished_at"] = _to_iso_utc(datetime.now(timezone.utc))
        action["last_error"] = err
        action["last_reply_preview"] = (reply or "")[:500]
        action["runs"] = int(action.get("runs", 0)) + 1

        repeat = str(action.get("repeat") or "none").lower()
        run_at = _parse_iso_utc(action.get("run_at")) or datetime.now(timezone.utc)
        if repeat == "daily":
            action["run_at"] = _to_iso_utc(run_at + timedelta(days=1))
            action["status"] = "scheduled"
        elif repeat == "weekly":
            action["run_at"] = _to_iso_utc(run_at + timedelta(days=7))
            action["status"] = "scheduled"
        else:
            action["enabled"] = False
            action["status"] = "completed" if not err else "failed"


def _scheduler_loop() -> None:
    while True:
        now = datetime.now(timezone.utc)
        due_ids = []
        with _SCHED_LOCK:
            for sid, action in list(_SCHEDULED_ACTIONS.items()):
                if not action.get("enabled", True):
                    continue
                if action.get("status") == "running":
                    continue
                run_at = _parse_iso_utc(action.get("run_at"))
                if run_at and run_at <= now:
                    due_ids.append(sid)

        for sid in due_ids[:4]:
            threading.Thread(target=_execute_scheduled_action, args=(sid,), daemon=True).start()

        time.sleep(3)


def _client_ip() -> str:
    forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    return forwarded or request.remote_addr or "unknown"


def _rate_limit_exceeded(ip: str) -> bool:
    now = time.time()
    start = now - RATE_WINDOW_SEC
    bucket = _rate_buckets.get(ip, [])
    bucket = [ts for ts in bucket if ts >= start]
    if len(bucket) >= RATE_LIMIT_PER_WINDOW:
        _rate_buckets[ip] = bucket
        return True
    bucket.append(now)
    _rate_buckets[ip] = bucket
    return False


def _redact_secrets(text: str) -> str:
    """Best-effort redaction for obvious secret patterns in attached file context."""
    if not text:
        return text

    patterns = [
        r"AIza[0-9A-Za-z\-_]{30,}",
        r"hf_[A-Za-z0-9]{20,}",
        r"sk-[A-Za-z0-9]{20,}",
        r"(?i)(api[_-]?key\s*[=:]\s*[\"']?)[^\"'\n\r\s]+",
        r"(?i)(token\s*[=:]\s*[\"']?)[^\"'\n\r\s]+",
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----",
    ]

    out = text
    out = re.sub(patterns[0], "[REDACTED_GEMINI_KEY]", out)
    out = re.sub(patterns[1], "[REDACTED_HF_TOKEN]", out)
    out = re.sub(patterns[2], "[REDACTED_OPENAI_KEY]", out)
    out = re.sub(patterns[3], r"\1[REDACTED]", out)
    out = re.sub(patterns[4], r"\1[REDACTED]", out)
    out = re.sub(patterns[5], "[REDACTED_PRIVATE_KEY]", out)
    return out


def _is_public_http_url(raw_url: str) -> bool:
    """Best-effort SSRF guard: allow only public http(s) URLs."""
    try:
        parsed = urlparse((raw_url or "").strip())
    except Exception:
        return False

    if parsed.scheme not in {"http", "https"}:
        return False
    host = (parsed.hostname or "").strip().lower()
    if not host:
        return False
    if host in {"localhost", "127.0.0.1", "::1"} or host.endswith(".local"):
        return False

    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
            return False
        return True
    except ValueError:
        pass

    # Hostname: resolve and reject private/link-local targets.
    try:
        infos = socket.getaddrinfo(host, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return False

    for info in infos[:6]:
        ip_txt = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_txt)
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
            return False
    return True


def _strip_html_text(raw: str) -> str:
    if not raw:
        return ""
    text = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", raw)
    text = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", text)
    text = re.sub(r"(?is)<!--.*?-->", " ", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = html_lib.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _looks_garbled_text(text: str) -> bool:
    """Heuristic guard against binary/minified/code-heavy fetch output."""
    sample = (text or "").strip()
    if not sample:
        return True
    sample = sample[:4000]

    if "\x00" in sample:
        return True

    printable_ratio = sum(1 for ch in sample if (ch.isprintable() or ch in "\n\r\t")) / max(len(sample), 1)
    if printable_ratio < 0.88:
        return True

    # Minified code / css / binary-ish indicators.
    bad_markers = (
        "@media", "{", "}", "function(", "var ", "const ", "=>",
        "</style>", "<script", ".css", "webpack", "sourceMappingURL",
    )
    bad_score = sum(sample.lower().count(m.lower()) for m in bad_markers)
    if bad_score >= 24:
        return True

    # Long base64-like runs are usually not useful for context.
    if re.search(r"[A-Za-z0-9+/]{140,}={0,2}", sample):
        return True

    return False


def _extract_pdf_text(raw: bytes, *, max_chars: int = 1800) -> tuple[str, str]:
    """Best-effort PDF text extraction. Returns (title, text)."""
    if not raw:
        return "", ""

    try:
        from pypdf import PdfReader
    except Exception:
        return "", ""

    try:
        reader = PdfReader(io.BytesIO(raw))
        title = ""
        try:
            md = reader.metadata or {}
            title = str(getattr(md, "title", "") or md.get("/Title", "") or "").strip()
        except Exception:
            title = ""

        parts: list[str] = []
        total = 0
        for page in reader.pages[:40]:
            try:
                page_text = (page.extract_text() or "").strip()
            except Exception:
                page_text = ""
            if not page_text:
                continue
            remaining = max_chars - total
            if remaining <= 0:
                break
            if len(page_text) > remaining:
                page_text = page_text[:remaining]
            parts.append(page_text)
            total += len(page_text)

        text = re.sub(r"\s+", " ", " ".join(parts)).strip()
        return title, text
    except Exception:
        return "", ""


def _fetch_web_excerpt(url: str, *, max_chars: int = 1800) -> str:
    """Fetch a URL and return a compact, plain-text excerpt."""
    safe_url = (url or "").strip()
    if not _is_public_http_url(safe_url):
        return ""

    try:
        req = Request(safe_url, headers={"User-Agent": WEB_USER_AGENT, "Accept-Encoding": "identity"})
        with urlopen(req, timeout=8) as resp:  # nosec - URL is validated by _is_public_http_url
            ctype = (resp.headers.get("content-type") or "").lower()
            read_limit = 2_000_000 if ("pdf" in ctype or safe_url.lower().endswith(".pdf")) else 260_000
            raw = resp.read(read_limit)
    except Exception:
        return ""

    if not raw:
        return ""

    is_pdf = ("pdf" in ctype) or safe_url.lower().endswith(".pdf") or raw[:5] == b"%PDF-"
    if is_pdf:
        pdf_title, pdf_text = _extract_pdf_text(raw, max_chars=max_chars)
        title = pdf_title or "(PDF document)"
        body = pdf_text or "(Unable to extract readable text from this PDF in current runtime.)"
    else:
        text = raw.decode("utf-8", errors="ignore")
        title_match = re.search(r"(?is)<title[^>]*>(.*?)</title>", text)
        title = _strip_html_text(title_match.group(1)) if title_match else ""

        # Keep only readable content types for plain-text extraction.
        looks_html = ("html" in ctype) or ("<html" in text.lower())
        looks_text = ("text/plain" in ctype) or ("application/json" in ctype)
        if not looks_html and not looks_text:
            return ""

        if looks_html:
            body = _strip_html_text(text)
        else:
            body = re.sub(r"\s+", " ", text).strip()

    if not body:
        return ""
    if _looks_garbled_text(body):
        return ""
    body = _redact_secrets(body)
    body = body[:max_chars]
    return (
        f"URL: {safe_url}\n"
        f"TITLE: {title or '(untitled)'}\n"
        f"EXCERPT:\n{body}"
    )


def _normalize_web_urls(raw_urls) -> list[str]:
    if isinstance(raw_urls, str):
        items = [raw_urls]
    elif isinstance(raw_urls, list):
        items = [str(x) for x in raw_urls]
    else:
        items = []

    out = []
    seen = set()
    for item in items:
        u = (item or "").strip()
        if not u or len(u) > 2048:
            continue
        if u in seen:
            continue
        seen.add(u)
        if _is_public_http_url(u):
            out.append(u)
        if len(out) >= MAX_WEB_URLS:
            break
    return out


def _claims_no_web_tools(reply: str) -> bool:
    text = (reply or "").lower()
    if not text:
        return False
    patterns = (
        "don't have web browsing",
        "do not have web browsing",
        "don't have browsing",
        "i can't browse",
        "i cannot browse",
        "can't access the web",
        "cannot access the web",
        "no search tools",
        "don't have search tools",
        "no browser tool",
    )
    return any(p in text for p in patterns)


def _primary_search_text(user_msg: str) -> str:
    """Extract only the user's top-level query, excluding appended internal blocks."""
    text = (user_msg or "").strip()
    if not text:
        return ""

    markers = (
        "\n\n[AGENT_PROFILE]",
        "\n\n[PROJECT_INFO_FILES]",
        "\n\n[GLOBAL SHARED MEMORY]",
        "\n\n[WEB_CONTEXT]",
        "\n\n[SYSTEM:",
        "\n<IMAGE_BASE64>",
    )
    cut = len(text)
    for m in markers:
        idx = text.find(m)
        if idx != -1 and idx < cut:
            cut = idx
    return text[:cut].strip()


def _should_auto_search(user_msg: str) -> bool:
    text = _primary_search_text(user_msg).lower()
    if not text:
        return False

    has_url = bool(re.search(r"https?://", text))

    triggers = (
        "latest", "current", "today", "news", "update", "price", "weather",
        "who is", "what is", "whats", "what's", "when did", "where is", "according to", "source",
        "search for", "look up", "release date", "recent", "find", "how to", "tell me about", "explain",
        "best", "top", "recommend", "compare", "vs", "versus", "review"
    )
    if len(text) > 100 and not text.startswith(("search for", "look up", "find ")):
        return False

    if any(t in text for t in triggers):
        return True
    
    if "?" in text and len(text.split()) >= 3:
        return True
        
    if "look up" in text or "search" in text:
        return True

    # If the top-level user query is just a direct URL share, don't auto-search.
    if has_url:
        return False
        
    return False


def _duckduckgo_search(query: str, max_results: int = 3) -> list[dict]:
    q = (query or "").strip()
    if not q:
        return []
    try:
        import subprocess
        import json
        
        script = f'''
import json
import sys
import warnings
warnings.filterwarnings("ignore")
try:
    from duckduckgo_search import DDGS
    with DDGS() as ddgs:
        results = []
        try:
            results = list(ddgs.text(sys.argv[1], max_results={max_results}))
        except Exception:
            pass
        if not results:
            try:
                results = list(ddgs.news(sys.argv[1], max_results={max_results}))
            except Exception:
                pass
        out = []
        for r in results:
            out.append({{
                "title": r.get("title", ""),
                "url": r.get("href", "") or r.get("url", ""),
                "snippet": r.get("body", "") or r.get("snippet", "")
            }})
        print(json.dumps(out))
except Exception as e:
    print(json.dumps([]))
'''
        proc = subprocess.run(["python3", "-W", "ignore", "-c", script, q], capture_output=True, text=True, timeout=12)
        try:
            results = json.loads(proc.stdout)
        except Exception:
            results = []
            
        pass

        return results
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("DDGS subprocess error: %s", e)
        return []


import re
def _build_web_context(user_msg: str, web_urls: list[str], auto_search: bool) -> tuple[str, list[dict]]:
    """Build compact web context block from shared URLs and optional auto search."""
    chunks: list[str] = []
    sources: list[dict] = []
    primary_query = _primary_search_text(user_msg)
    
    # Extract URLs from user_msg and append to web_urls if not present
    found_urls = re.findall(r"(https?://[^\s\"\'\\]+)", primary_query)
    for u in found_urls:
        if u not in web_urls and len(web_urls) < MAX_WEB_URLS:
            web_urls.append(u)

    # Explicit user-shared pages
    for u in web_urls[:MAX_WEB_URLS]:
        excerpt = _fetch_web_excerpt(u, max_chars=5000)
        if not excerpt:
            continue
        chunks.append(f"[USER_SHARED_PAGE]\n{excerpt}")
        sources.append({"type": "shared", "url": u})

    # Auto-search when likely helpful for external/fresh facts
    if auto_search and _should_auto_search(primary_query):
        hits = _duckduckgo_search(primary_query, max_results=3)
        if hits:
            bullet_lines = [
                f"- {h['title']} — {h['url']}" + (f"\n  Snippet: {h['snippet']}" if h.get('snippet') else "")
                for h in hits
            ]
            chunks.append("[AUTO_SEARCH_RESULTS]\n" + "\n".join(bullet_lines))

            for h in hits[:2]:
                excerpt = _fetch_web_excerpt(h["url"], max_chars=8000)
                if excerpt:
                    chunks.append(f"[AUTO_FETCHED_PAGE]\n{excerpt}")
                sources.append({"type": "search", "url": h["url"], "title": h["title"]})

    context = "\n\n".join(chunks).strip()
    if len(context) > MAX_WEB_CONTEXT_CHARS:
        context = context[:MAX_WEB_CONTEXT_CHARS] + "\n\n...(web context truncated)..."
    return context, sources


def _hf_chat_with_retry(client, model: str, messages: list[dict], max_tokens: int, temperature: float, max_retries: int = 3, on_chunk = None) -> str:
    """Call HuggingFace chat_completion with exponential backoff on 500/503 overload errors."""
    import time as _time
    delay = 2.0
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            if on_chunk:
                response = client.chat_completion(
                    model=model,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stream=True,
                )
                full_text = ""
                for chunk in response:
                    try:
                        delta = chunk.choices[0].delta.content or ""
                    except IndexError:
                        logger.error("IndexError in stream chunk: %s", chunk)
                        if not full_text:
                            raise RuntimeError(f"HuggingFace API returned empty choices for model {model}. Chunk: {chunk}")
                        break
                    if delta:
                        full_text += delta
                        on_chunk(full_text)
                return full_text
            else:
                response = client.chat_completion(
                    model=model,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                try:
                    return (response.choices[0].message.content or "").strip()
                except IndexError:
                    logger.error("IndexError in _hf_chat_with_retry! response: %s", response)
                    raise RuntimeError(f"HuggingFace API returned empty choices for model {model}. Raw response: {response}")
        except Exception as exc:
            msg = str(exc).lower()
            is_overload = any(code in msg for code in ["503", "500", "overloaded", "not ready", "backend error", "server error"])
            last_exc = exc
            if is_overload and attempt < max_retries:
                logger.warning("HF overload (attempt %d/%d), retrying in %.0fs — %s", attempt + 1, max_retries, delay, exc)
                _time.sleep(delay)
                delay = min(delay * 2, 16.0)
                continue
            raise
    raise last_exc


def _model_generate_text(
    client,
    model: str,
    *,
    system_prompt: str,
    user_content: str,
    temperature: float,
    max_tokens: int,
    disable_thinking: bool = False,
    on_chunk = None,
) -> str:
    """Single provider-agnostic text generation helper (Gemini/HF)."""
    model = _normalize_model_id(model)
    if _is_local_model(model):
        tokenizer, local_model = _load_local_gemma()
        chat_messages = []
        if system_prompt.strip():
            chat_messages.append({"role": "system", "content": system_prompt.strip()})
        chat_messages.append({"role": "user", "content": user_content})
        try:
            prompt_text = tokenizer.apply_chat_template(
                chat_messages, tokenize=False, add_generation_prompt=True
            )
        except Exception:
            prompt_text = f"{system_prompt}\n\nUser:\n{user_content}\n\nAssistant:\n"
        inputs = tokenizer(prompt_text, return_tensors="pt")
        try:
            dev = getattr(local_model, "device", None)
            if dev is not None:
                inputs = {k: v.to(dev) for k, v in inputs.items()}
        except Exception:
            pass
        input_len = inputs["input_ids"].shape[1]
        outputs = local_model.generate(
            **inputs,
            max_new_tokens=min(max_tokens, 512),
            do_sample=temperature > 0,
            temperature=max(temperature, 0.1),
            pad_token_id=tokenizer.eos_token_id,
        )
        new_tokens = outputs[0][input_len:]
        return tokenizer.decode(new_tokens, skip_special_tokens=True).strip()

    import re
    image_data = None
    text_content = user_content
    if "<IMAGE_BASE64>" in text_content:
        match = re.search(r"<IMAGE_BASE64>(.*?)</IMAGE_BASE64>", text_content, flags=re.DOTALL)
        if match:
            image_data = match.group(1)
            text_content = text_content.replace(match.group(0), "").strip()

    if model.startswith("gemini-"):
        from google.genai import types

        clean_model = model.replace("models/", "")
        config_kwargs = dict(
            temperature=temperature,
            max_output_tokens=max_tokens,
            system_instruction=system_prompt,
        )
        if disable_thinking and "2.5" in clean_model:
            config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)

        parts = []
        if text_content:
            parts.append(types.Part.from_text(text=text_content))
        if image_data:
            try:
                import base64
                img_str = image_data.split(",")[1] if "," in image_data else image_data
                img_bytes = base64.b64decode(img_str)
                parts.append(types.Part.from_bytes(data=img_bytes, mime_type="image/png"))
            except Exception as e:
                print(f"Failed to decode image: {e}")

        if not parts:
            parts.append(types.Part.from_text(text=" "))

        if on_chunk:
            response = client.models.generate_content_stream(
                model=clean_model,
                contents=[
                    types.Content(
                        role="user",
                        parts=parts,
                    )
                ],
                config=types.GenerateContentConfig(**config_kwargs),
            )
            full_text = ""
            for chunk in response:
                if chunk.text:
                    full_text += chunk.text
                    on_chunk(full_text)
            return full_text
        else:
            response = client.models.generate_content(
                model=clean_model,
                contents=[
                    types.Content(
                        role="user",
                        parts=parts,
                    )
                ],
                config=types.GenerateContentConfig(**config_kwargs),
            )
            return (response.text or "").strip()

    if image_data:
        user_msg_content = []
        if text_content:
            user_msg_content.append({"type": "text", "text": text_content})
        user_msg_content.append({"type": "image_url", "image_url": {"url": image_data}})
    else:
        user_msg_content = text_content or " "

    return _hf_chat_with_retry(client, model, [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_msg_content},
    ], max_tokens=max_tokens, temperature=temperature, on_chunk=on_chunk)


def _model_chat_messages(
    client,
    model: str,
    messages: list[dict],
    *,
    temperature: float,
    max_tokens: int,
    disable_thinking: bool = False,
) -> str:
    """Provider-agnostic chat completion for a full message list."""
    model = _normalize_model_id(model)
    if _is_local_model(model):
        system_lines = [
            (m.get("content") or "").strip()
            for m in messages
            if m.get("role") == "system" and (m.get("content") or "").strip()
        ]
        user_lines = [
            f"{(m.get('role') or 'user').capitalize()}: {(m.get('content') or '').strip()}"
            for m in messages
            if m.get("role") in {"user", "assistant"} and (m.get("content") or "").strip()
        ]
        return _model_generate_text(
            client,
            model,
            system_prompt="\n\n".join(system_lines),
            user_content="\n".join(user_lines) if user_lines else "",
            temperature=temperature,
            max_tokens=max_tokens,
            disable_thinking=disable_thinking,
        )

    if model.startswith("gemini-"):
        from google.genai import types

        clean_model = model.replace("models/", "")
        system_parts = []
        contents = []
        for msg in messages:
            role = msg.get("role", "user")
            text = (msg.get("content") or "").strip()
            if not text:
                continue
                
            image_data = None
            if "<IMAGE_BASE64>" in text:
                import re
                match = re.search(r"<IMAGE_BASE64>(.*?)</IMAGE_BASE64>", text, flags=re.DOTALL)
                if match:
                    image_data = match.group(1)
                    text = text.replace(match.group(0), "").strip()

            if role == "system":
                if text:
                    system_parts.append(text)
                continue

            parts = []
            if text:
                parts.append(types.Part.from_text(text=text))
            
            if image_data:
                try:
                    import base64
                    img_str = image_data.split(",")[1] if "," in image_data else image_data
                    img_bytes = base64.b64decode(img_str)
                    parts.append(types.Part.from_bytes(data=img_bytes, mime_type="image/png"))
                except Exception as e:
                    print(f"Failed to decode image: {e}")

            if parts:
                gemini_role = "model" if role == "assistant" else "user"
                contents.append(
                    types.Content(
                        role=gemini_role,
                        parts=parts,
                    )
                )

        config_kwargs = dict(
            temperature=temperature,
            max_output_tokens=max_tokens,
        )
        if system_parts:
            config_kwargs["system_instruction"] = "\n\n".join(system_parts)
        if disable_thinking and "2.5" in clean_model:
            config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)

        response = client.models.generate_content(
            model=clean_model,
            contents=contents,
            config=types.GenerateContentConfig(**config_kwargs),
        )
        return (response.text or "").strip()

    hf_messages = []
    for msg in messages:
        role = msg.get("role", "user")
        text = (msg.get("content") or "").strip()
        if not text:
            continue
            
        image_data = None
        if "<IMAGE_BASE64>" in text:
            import re
            match = re.search(r"<IMAGE_BASE64>(.*?)</IMAGE_BASE64>", text, flags=re.DOTALL)
            if match:
                image_data = match.group(1)
                text = text.replace(match.group(0), "").strip()
                
        if image_data:
            content = []
            if text:
                content.append({"type": "text", "text": text})
            content.append({"type": "image_url", "image_url": {"url": image_data}})
        else:
            content = text
            
        hf_messages.append({"role": role, "content": content})

    return _hf_chat_with_retry(client, model, hf_messages, max_tokens=max_tokens, temperature=temperature)


class _LocalPipelineClient:
    """Adapter so reasoning.pipeline can call local models via chat_completion."""

    class _Message:
        def __init__(self, content: str):
            self.content = content

    class _Choice:
        def __init__(self, content: str):
            self.message = _LocalPipelineClient._Message(content)

    class _Response:
        def __init__(self, content: str):
            self.choices = [_LocalPipelineClient._Choice(content)]

    def chat_completion(self, *, model: str, messages: list[dict], max_tokens: int = 768, temperature: float = 0.5, **_kwargs):
        future = GEMMA_EXECUTOR.submit(
            _model_chat_messages,
            self,
            model,
            messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        try:
            content = future.result(timeout=90)
        except concurrent.futures.TimeoutError as exc:
            raise RuntimeError(
                "Local Gemma is still loading or taking too long to answer. "
                "Try again after the first model load finishes, or choose a remote model for faster responses."
            ) from exc
        return self._Response(content)


def _normalize_history(history, user_msg: str) -> list[dict]:
    """Normalize and bound chat history from client payload."""
    if not isinstance(history, list):
        history = []

    normalized = []
    total_chars = 0
    # Keep most recent messages only.
    for item in history[-60:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        if role not in {"user", "assistant"}:
            continue
        content = str(item.get("content") or "").strip()
        if not content:
            continue
        content = content[:8000]
        total_chars += len(content)
        if total_chars > 120000:
            break
        normalized.append({"role": role, "content": content})

    if not normalized or normalized[-1].get("role") != "user" or normalized[-1].get("content") != user_msg:
        normalized.append({"role": "user", "content": user_msg[:8000]})

    return normalized


def _history_to_text(history: list[dict], max_chars: int = 6000) -> str:
    lines = []
    total = 0
    # Keep newest first for max length, then reverse at end
    for msg in reversed(history):
        role = (msg.get("role") or "user").upper()
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        block = f"{role}: {content}\n"
        if total + len(block) > max_chars:
            break
        lines.append(block)
        total += len(block)
    
    return "\n".join(reversed(lines)) if lines else "(no prior conversation)"
def _available_workshop_files() -> list[str]:
    """Return text/code files users can attach to workshop agents."""
    allowed_ext = {
        ".py", ".md", ".txt", ".json", ".yaml", ".yml",
        ".html", ".css", ".js", ".ts", ".tsx", ".jsx",
        ".toml", ".ini", ".cfg", ".xml", ".csv",
    }
    blocked_dirs = {".git", "venv", "__pycache__", ".mypy_cache", ".pytest_cache"}
    files = []
    for p in WORKSPACE_ROOT.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(WORKSPACE_ROOT)
        if any(part in blocked_dirs for part in rel.parts):
            continue
        if p.suffix.lower() not in allowed_ext:
            continue
        try:
            if p.stat().st_size > 300_000:
                continue
        except OSError:
            continue
        files.append(rel.as_posix())
    return sorted(files)[:400]


def _read_rel_file(rel_path: str, max_chars: int = MAX_FILE_CONTEXT_CHARS) -> str:
    """Safe relative file reader limited to workspace and max_chars."""
    if not rel_path or not isinstance(rel_path, str):
        return ""
    candidate = (WORKSPACE_ROOT / rel_path).resolve()
    try:
        candidate.relative_to(WORKSPACE_ROOT)
    except ValueError:
        return ""
    if not candidate.exists() or not candidate.is_file():
        return ""
    try:
        text = candidate.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""
    text = _redact_secrets(text)
    return _compact_file_context(rel_path, text, max_chars=max_chars)


def _compact_file_context(rel_path: str, text: str, max_chars: int = MAX_FILE_CONTEXT_CHARS) -> str:
    """Return a concise file context payload (summary + key snippets)."""
    if not text:
        return ""

    lines = text.splitlines()
    total_lines = len(lines)

    key_lines = []
    for i, ln in enumerate(lines, start=1):
        s = ln.strip()
        if not s:
            continue
        if s.startswith(("def ", "class ", "async def ", "@app.route", "function ", "const ", "let ", "var ")):
            key_lines.append(f"L{i}: {s}")
        elif s.startswith(("import ", "from ")) and len(key_lines) < 24:
            key_lines.append(f"L{i}: {s}")
        if len(key_lines) >= 36:
            break

    head = "\n".join(lines[:50])
    tail = "\n".join(lines[-25:]) if total_lines > 70 else ""
    key_block = "\n".join(key_lines) if key_lines else "(no obvious symbols found)"

    payload = (
        f"FILE: {rel_path}\n"
        f"SIZE: {len(text)} chars, {total_lines} lines\n"
        f"KEY SYMBOLS:\n{key_block}\n\n"
        f"HEAD EXCERPT:\n{head}"
    )
    if tail:
        payload += f"\n\nTAIL EXCERPT:\n{tail}"

    if len(payload) > max_chars:
        payload = payload[:max_chars] + "\n\n...(concise context truncated)..."
    return payload


def run_direct_chat(client, model: str, user_message: str, history: list[dict] | None = None) -> str:
    """Single model call — no thinking, no reasoning, just a fast answer.
    Uses the same output rules as the Synthesizer so the sandbox works."""
    history = history or []
    messages = [{"role": "system", "content": f"{CONSTITUTION}\n\n{SYNTHESIZER_PREAMBLE}"}] + history
    return _model_chat_messages(
        client,
        model,
        messages,
        temperature=0.7,
        max_tokens=8096,
        disable_thinking=True,
    )


def run_conversational_chat(client, selected_model: str, user_message: str, history: list[dict] | None = None) -> tuple[str, list[dict], str]:
    """Two-agent conversational mode:
    1) Muse: internal style + direction pass
    2) Guide: user-facing answer with light personality

    Returns (final_reply, traces, resolved_model)."""
    from time import perf_counter

    muse_name = "Muse"
    guide_name = "Guide"

    history_text = _history_to_text(history or [])

    muse_system = (
        f"{CONSTITUTION}\n\n"
        "You are Muse, the tone-and-intent strategist for a conversational AI. "
        "Think internally and produce concise guidance for how the final reply should feel.\n\n"
        "Output format (strict):\n"
        "STYLE: <short style descriptor>\n"
        "TONE: <short tone descriptor>\n"
        "ANGLES:\n"
        "- <angle 1>\n"
        "- <angle 2>\n"
        "- <angle 3>\n"
        "DO_NOT:\n"
        "- <avoidance 1>\n"
        "- <avoidance 2>\n"
        f"\n\n{RUNTIME_CONTEXT}"
    )

    guide_system = (
        f"{CONSTITUTION}\n\n"
        "You are Guide, a warm conversational assistant with a subtle personality. "
        "Be helpful, clear, and human-feeling without being cheesy. "
        "Do not mention internal agents or internal notes. "
        "CRITICAL — BROWSING/SEARCH: You have a fully integrated web framework. "
        "The system automatically fetches web context before your turn and appends it as [WEB_CONTEXT]. "
        "NEVER say you cannot browse, search, or access the web. NEVER claim you lack tools. "
        "If [WEB_CONTEXT] is present, use it directly and answer as if you found the information yourself. "
        "Keep answers practical and easy to follow."
        f"\n\n{RUNTIME_CONTEXT}"
    )

    # Preset behavior: lighter thinker + stronger answerer
    if selected_model == MULTI_PRESET_ID:
        muse_model = MULTI_LIGHT_MODEL
        guide_model = MULTI_STRONG_MODEL
    else:
        muse_model = selected_model
        guide_model = selected_model

    traces = []

    # Step 1: Muse
    t0 = perf_counter()
    # Make sure augmented context gets to Muse
    muse_user_msg = user_message
    if history and len(history) > 0 and history[-1].get("role") == "user":
        # The history already holds the augmented message, let's pull it if differ.
        if "[WEB_CONTEXT]" in history[-1]["content"]:
            muse_user_msg = history[-1]["content"]

    muse_user = (
        f"Conversation so far:\n{history_text}\n\n"
        f"Latest user message:\n{muse_user_msg}"
    )
    muse_notes = _model_generate_text(
        client,
        muse_model,
        system_prompt=muse_system,
        user_content=muse_user,
        temperature=0.8,
        max_tokens=600,
    )

    traces.append({
        "agent": muse_name,
        "content": muse_notes,
        "input_messages": [
            {"role": "system", "content": muse_system},
            {"role": "user", "content": muse_user},
        ],
        "elapsed_ms": int((perf_counter() - t0) * 1000),
    })

    # Step 2: Guide
    guide_user = (
        f"Conversation so far:\n{history_text}\n\n"
        f"Latest user message:\n{muse_user_msg}\n\n"
        f"Muse notes (internal):\n{muse_notes}\n\n"
        "Now write the final reply for the user."
    )
    t0 = perf_counter()
    final_reply = _model_generate_text(
        client,
        guide_model,
        system_prompt=guide_system,
        user_content=guide_user,
        temperature=0.75,
        max_tokens=8096,
    )

    traces.append({
        "agent": guide_name,
        "content": final_reply,
        "input_messages": [
            {"role": "system", "content": guide_system},
            {"role": "user", "content": guide_user},
        ],
        "elapsed_ms": int((perf_counter() - t0) * 1000),
    })

    return final_reply, traces, guide_model


def run_custom_mode_chat(client, selected_model: str, user_message: str, mode_config: dict, history: list[dict] | None = None, run_id: str | None = None, auto_skip: bool = False) -> tuple[str, list[dict], str]:
    """Run a user-configured chain of agents in order."""
    from time import perf_counter

    mode_name = str((mode_config or {}).get("name", "Custom Mode"))[:MAX_MODE_NAME_CHARS]
    agents = (mode_config or {}).get("agents", [])
    if not isinstance(agents, list) or not agents:
        return "Please configure at least one agent in Workshop.", [], selected_model

    # Preset behavior: custom mode on preset uses strong model for quality.
    resolved_model = (
        MULTI_STRONG_MODEL if selected_model == MULTI_PRESET_ID else selected_model
    )

    traces: list[dict] = []
    prior_outputs: list[str] = []
    final_reply = ""
    history_text = _history_to_text(history or [], max_chars=5000)

    explicit_skips = set()
    actual_skipped = set()

    for i, agent_cfg in enumerate(agents[:16]):
        name = str(agent_cfg.get("name") or f"Agent {i+1}").strip()[:40]
        name = name[:MAX_AGENT_NAME_CHARS]
        persona = str(agent_cfg.get("persona") or "You are a helpful assistant.").strip()[:MAX_AGENT_PERSONA_CHARS]
        
        step_model_str = str(agent_cfg.get("model") or "").strip()
        step_model = step_model_str if (mode_config.get("usePerStepModels") and step_model_str in ALLOWED_MODELS) else resolved_model

        try:
            temperature = float(agent_cfg.get("temperature", 0.7) or 0.7)
        except (TypeError, ValueError):
            temperature = 0.7
        temperature = max(0.0, min(1.5, temperature))
        files = agent_cfg.get("files") or []
        if not isinstance(files, list):
            files = []
        files = [str(f) for f in files[:4]]

        file_sections = []
        for rel in files:
            content = _read_rel_file(rel)
            if content:
                file_sections.append(f"### FILE: {rel}\n{content}")
        files_block = "\n\n".join(file_sections) if file_sections else "(none)"

        inputs = agent_cfg.get("inputs") or []

        # -- Check Skipping --
        is_skipped = False
        if i in explicit_skips:
            is_skipped = True
        elif inputs and all(idx in actual_skipped for idx in inputs if 0 <= idx < len(agents)):
            is_skipped = True

        if is_skipped:
            actual_skipped.add(i)
            _update_run_trace(run_id, name, "skipped", content="Skipped by routing logic.", elapsed_ms=0)
            traces.append({
                "agent": name,
                "status": "skipped",
                "content": "Skipped by routing logic.",
                "web_sources": [],
                "input_messages": [],
                "elapsed_ms": 0,
            })
            prior_outputs.append(f"[{name}]\n(Skipped)")
            continue
        # --------------------

        inputs = agent_cfg.get("inputs") or []
        if isinstance(inputs, list) and len(inputs) > 0:
            selected_outputs = []
            for input_idx in inputs:
                if 0 <= input_idx < len(prior_outputs):
                    other_name = agents[input_idx].get("name", f"Agent {input_idx+1}")
                    selected_outputs.append(f"🔌 FEED FROM [{other_name}]:\n{prior_outputs[input_idx]}")
            previous = "\n\n".join(selected_outputs) if selected_outputs else "(none)"
        else:
            previous = "\n\n".join(prior_outputs[-4:]) if prior_outputs else "(none)"

        search_block = ""
        agent_web_sources = []
        if agent_cfg.get("search") is True:
            _update_run_trace(run_id, name, "running", content="Searching the web...")
            primary_query = _primary_search_text(user_message)
            hits = _duckduckgo_search(primary_query, max_results=3)
            if hits:
                bullet_lines = [
                    f"- {h['title']} — {h['url']}" + (f"\n  Snippet: {h['snippet']}" if h.get('snippet') else "")
                    for h in hits
                ]
                search_block = "LIVE WEB SEARCH RESULTS FOR CONTEXT:\n" + "\n".join(bullet_lines) + "\n\n"
                agent_web_sources = [{"title": h['title'], "url": h['url']} for h in hits]

        user_payload = (
            f"FULL CONVERSATION HISTORY:\n{history_text}\n\n"
            f"USER REQUEST:\n{user_message}\n\n"
            f"PREVIOUS AGENT FEED INPUTS (internal circuit context):\n{previous}\n\n"
            f"ATTACHED FILE CONTEXT (concise):\n{files_block}\n\n"
            f"{search_block}"
            "Context Instructions:\n"
            f"You are a specific node named '{name}' in a multi-agent circuit. You have received the USER REQUEST and the outputs of previous agents.\n"
            f"CRITICAL: The previous agents may have delegated specific tasks to '{name}'. If they did, you MUST execute ONLY the task assigned to your name.\n"
            f"Do NOT simulate, roleplay, or hallucinate the outputs of other agents. You are ONLY {name}. Build upon the previous work, execute your assigned task, and fulfill your specific Persona instructions to advance the overall solution."
        )
        
        is_final_agent = (i == len(agents[:16]) - 1)
        if not is_final_agent:
            user_payload += "\n\nCRITICAL INSTRUCTION: End your response with exactly ONE brief summary sentence starting with 'SUMMARY: ' that encapsulates your core findings or actions. This will be used as your visible label in the UI."
            
        abilities = agent_cfg.get("abilities", [])
        if "skip" in abilities or (auto_skip and ("Planner" in name or "Manager" in name or "Architect" in name)):
            user_payload += "\nROUTING ABILITY: If there are downstream subagents that you DO NOT NEED for this task, you MUST bypass them using the command `/skip <Agent Name>/`."
        if "search" in abilities:
            user_payload += "\nSEARCH ABILITY: You have the ability to search the web for fresh information. To request a search, output exactly `<search>YOUR QUERY</search>`. The search will be executed and the results will be forwarded to the NEXT agent in the chain."
        if "calendar" in abilities:
            user_payload += "\nCALENDAR ABILITY: You have the ability to read the user's calendar. To request this data, output exactly `<calendar_pull/>`. The calendar events will be forwarded to the NEXT agent in the chain."
        if "email" in abilities:
            user_payload += "\nEMAIL ABILITY: You have the ability to read the user's recent emails. To request this data, output exactly `<email_pull/>`. The recent inbox data will be forwarded to the NEXT agent in the chain."

        system_prompt = (
            f"{HARD_ETHICS}\n\n"
            f"You are {name}.\n"
            f"Persona / Instructions:\n{persona}\n\n"
            f"{RUNTIME_CONTEXT}"
        )

        _update_run_trace(run_id, name, "running", web_sources=agent_web_sources)
        t0 = perf_counter()
        with open('app_debug.log', 'a') as df:
            df.write(f"=== PAYLOAD FOR {name} ===\n{user_payload}\n\n")
        def on_agent_chunk(txt):
            _update_run_trace(run_id, name, "running", content=txt, elapsed_ms=int((perf_counter() - t0) * 1000), web_sources=agent_web_sources)
        
        output = _model_generate_text(
            client,
            step_model,
            system_prompt=system_prompt,
            user_content=user_payload,
            temperature=temperature,
            max_tokens=8096,
            on_chunk=on_agent_chunk,
        )

        elapsed = int((perf_counter() - t0) * 1000)
        _update_run_trace(
            run_id,
            name,
            "completed",
            content=output,
            elapsed_ms=elapsed,
            input_messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_payload},
            ],
            web_sources=agent_web_sources
        )
        traces.append({
            "agent": name,
            "content": output,
            "web_sources": agent_web_sources,
            "input_messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_payload},
            ],
            "elapsed_ms": elapsed,
        })
        # Post-process tool usage
        feed_data = ""
        m_search = re.search(r"<search>(.*?)</search>", output, re.IGNORECASE)
        if "search" in abilities and m_search:
            q = m_search.group(1).strip()
            hits = _duckduckgo_search(q, max_results=3)
            feed_data += "\n\n[SEARCH TOOL EXECUTED]\n"
            for h in hits:
                feed_data += f"- {h['title']}: {h['snippet']} ({h['url']})\n"
                
        if "calendar" in abilities and "<calendar_pull/>" in output:
            feed_data += "\n\n[CALENDAR TOOL EXECUTED]\nNo events found for today.\n"
            
        if "email" in abilities and "<email_pull/>" in output:
            cfg = _get_email_config()
            if cfg:
                msgs = _fetch_inbox(cfg, limit=5, page=1)
                feed_data += "\n\n[EMAIL TOOL EXECUTED]\n"
                for m in msgs:
                    feed_data += f"- From: {m.get('from')} | Subject: {m.get('subject')} | Date: {m.get('date')}\n"
            else:
                feed_data += "\n\n[EMAIL TOOL EXECUTED]\nError: Email not configured.\n"

        if feed_data:
            output += feed_data

        prior_outputs.append(f"[{name}]\n{output[:8000]}")
        final_reply = output

        # Parse skip commands
        for match in re.finditer(r'(?i)/skip\s+([^/]+)/', output):
            target = match.group(1).strip().lower()
            for j, a_cfg in enumerate(agents):
                a_name = str(a_cfg.get("name") or f"Agent {j+1}").strip().lower()
                if target == a_name or target == f"agent {j+1}" or target == str(j+1):
                    if j > i: # Only skip future agents
                        explicit_skips.add(j)

    return final_reply, traces, resolved_model


def _sanitize_mode_config(mode_config: dict) -> dict:
    """Bound user-provided custom mode config to safe sizes/types."""
    if not isinstance(mode_config, dict):
        return {"name": "Custom Mode", "agents": []}

    agents = mode_config.get("agents")
    if not isinstance(agents, list):
        agents = []

    sanitized_agents = []
    for i, a in enumerate(agents[:16]):
        if not isinstance(a, dict):
            continue
        files = a.get("files") if isinstance(a.get("files"), list) else []
        try:
            temp = float(a.get("temperature", 0.7) or 0.7)
        except (TypeError, ValueError):
            temp = 0.7
        inputs = a.get("inputs")
        if not isinstance(inputs, list):
            inputs = []
        sanitized_inputs = []
        for val in inputs:
            try:
                sanitized_inputs.append(int(val))
            except (TypeError, ValueError):
                pass
                
        abilities = a.get("abilities")
        if not isinstance(abilities, list):
            abilities = []
        sanitized_abilities = [str(x) for x in abilities if x in {"search", "email", "calendar", "skip"}]

        sanitized_agents.append({
            "name": str(a.get("name") or f"Agent {i+1}")[:MAX_AGENT_NAME_CHARS],
            "persona": str(a.get("persona") or "You are a helpful assistant.")[:MAX_AGENT_PERSONA_CHARS],
            "files": [str(f) for f in files[:8]],
            "temperature": max(0.0, min(1.5, temp)),
            "inputs": sanitized_inputs,
            "abilities": sanitized_abilities,
            "model": str(a.get("model", ""))
        })

    return {
        "name": str(mode_config.get("name") or "Custom Mode")[:MAX_MODE_NAME_CHARS],
        "agents": sanitized_agents,
    }


def _public_traces(traces, include_prompts: bool) -> list[dict]:
    """Return traces with optional prompt exposure for privacy."""
    public = []
    for t in traces or []:
        public.append({
            "agent": t.get("agent", "Agent") if isinstance(t, dict) else getattr(t, "agent", "Agent"),
            "content": t.get("content", "") if isinstance(t, dict) else getattr(t, "content", ""),
            "input_messages": (t.get("input_messages", []) if isinstance(t, dict) else getattr(t, "input_messages", [])) if include_prompts else [],
            "elapsed_ms": t.get("elapsed_ms", 0) if isinstance(t, dict) else getattr(t, "elapsed_ms", 0),
            "trace_id": t.get("trace_id", "") if isinstance(t, dict) else getattr(t, "trace_id", ""),
            "parent_trace_id": t.get("parent_trace_id", "") if isinstance(t, dict) else getattr(t, "parent_trace_id", ""),
            "branch_id": t.get("branch_id", "main") if isinstance(t, dict) else getattr(t, "branch_id", "main"),
            "checkpoint_id": t.get("checkpoint_id", "") if isinstance(t, dict) else getattr(t, "checkpoint_id", ""),
            "status": t.get("status", "completed") if isinstance(t, dict) else getattr(t, "status", "completed"),
            "memory_influence": t.get("memory_influence", []) if isinstance(t, dict) else getattr(t, "memory_influence", []),
        })
    return public


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    # Require auth unless user explicitly continues in guest mode.
    if current_user.is_authenticated:
        session.pop("guest_mode", None)
    elif request.args.get("guest") == "1":
        session["guest_mode"] = True
    elif not session.get("guest_mode"):
        return redirect(url_for("auth_login_page"))

    return render_template("index.html", model=_default_dropdown_model(), models=_dropdown_models())


@app.route("/fire-tian")
def fire_tian_boss_battle():
    """Playable prototype for the Fire Tian boss battle."""
    return render_template("fire_tian.html")

@app.route("/widget")
def widget():
    """Electron floating widget UI."""
    return render_template("widget.html")

# Settings page for model management
@app.route("/settings")
def settings():
    return render_template("settings.html")

@app.route("/api/models", methods=["GET"])
def api_list_models():
    base = [
        {
            "id": m.get("id"),
            "name": m.get("name"),
            "provider": m.get("provider", "huggingface"),
            "builtin": True,
            "enabled": m.get("id") not in HIDDEN_MODEL_IDS,
        }
        for m in MODELS_CONFIG
    ]
    custom = [dict(m, builtin=False, enabled=m.get("id") not in HIDDEN_MODEL_IDS) for m in USER_MODELS]
    return jsonify(base + custom)

@app.route("/api/models", methods=["POST"])
def api_add_model():
    data = request.get_json(silent=True) or {}
    model_id = str(data.get("id") or "").strip()
    name = str(data.get("name") or model_id).strip()
    provider = str(data.get("provider") or data.get("type") or "huggingface").strip().lower()
    if not model_id or not name:
        return jsonify({"error": "Both id and name are required."}), 400
    existing = {m.get("id") for m in MODELS_CONFIG} | {m.get("id") for m in USER_MODELS}
    if model_id in existing:
        return jsonify({"error": "Model already exists"}), 400
    USER_MODELS.append({
        "id": model_id,
        "name": name,
        "provider": provider,
        "credit_multiplier": float(data.get("credit_multiplier") or 1.0),
    })
    HIDDEN_MODEL_IDS.discard(model_id)
    _refresh_allowed_models()
    return jsonify({"status": "added", "model": USER_MODELS[-1]})


@app.route("/api/models/<path:model_id>/toggle", methods=["POST"])
def api_toggle_model(model_id):
    data = request.get_json(silent=True) or {}
    enabled = bool(data.get("enabled", True))
    known_ids = {m.get("id") for m in _all_models()}
    if model_id not in known_ids:
        return jsonify({"error": "Unknown model id"}), 404
    if enabled:
        HIDDEN_MODEL_IDS.discard(model_id)
    else:
        HIDDEN_MODEL_IDS.add(model_id)
    return jsonify({"status": "ok", "model_id": model_id, "enabled": model_id not in HIDDEN_MODEL_IDS})

@app.route("/api/models/<path:model_id>", methods=["DELETE"])
def api_remove_model(model_id):
    before = len(USER_MODELS)
    USER_MODELS[:] = [m for m in USER_MODELS if m.get("id") != model_id]
    HIDDEN_MODEL_IDS.discard(model_id)
    _refresh_allowed_models()
    if len(USER_MODELS) == before:
        return jsonify({"error": "Only custom models can be removed."}), 404
    return jsonify({"status": "removed"})


@app.route("/api/config", methods=["POST"])
def api_config():
    # Placeholder for server-side config if needed
    return jsonify({"status": "ok"})


@app.route("/api/memory", methods=["GET"])
def api_memory():
    return jsonify({
        "manifesto": memory.read_manifesto(),
        "heuristics": memory.get_heuristics_data(),
        "failures": memory.get_failures_data(),
        "thought_journal": memory.get_thought_journal_data(),
        "historian_notes": memory.get_historian_data(),
        "typed_memory": memory.get_typed_memory_data(),
    })


@app.route("/api/proxy/alphavantage", methods=["GET"])
def api_proxy_alphavantage():
    """
    Same-origin proxy for Alpha Vantage requests from sandbox/preview apps.
    Fixes browser-side CORS failures and avoids forcing users to open another tab/server.
    """
    # Accept key from header first, then query fallback, then env fallback.
    # Query key is removed before forwarding to keep control server-side.
    api_key = (
        str(request.headers.get("X-Alpha-Vantage-Key") or "").strip()
        or str(request.args.get("apikey") or "").strip()
        or str(os.environ.get("ALPHA_VANTAGE_API_KEY") or "").strip()
    )
    if not api_key:
        return jsonify({
            "error": "Missing Alpha Vantage API key. Provide X-Alpha-Vantage-Key header, apikey query param, or ALPHA_VANTAGE_API_KEY env var."
        }), 400

    params = {k: v for k, v in request.args.items()}
    params.pop("apikey", None)
    params.pop("apiKey", None)
    params["apikey"] = api_key
    if "function" not in params:
        return jsonify({"error": "Missing required 'function' query parameter for Alpha Vantage."}), 400

    target = "https://www.alphavantage.co/query?" + urlencode(params, doseq=True)
    req = Request(target, headers={"User-Agent": "VibeCoding/1.0"})
    try:
        with urlopen(req, timeout=25) as resp:
            raw = resp.read()
            ctype = str(resp.headers.get("Content-Type") or "application/json")
    except HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")[:1000]
        except Exception:
            body = str(e)
        logger.warning("Alpha Vantage proxy HTTPError %s: %s", getattr(e, "code", "unknown"), body)
        return jsonify({"error": f"Alpha Vantage upstream error ({getattr(e, 'code', 'unknown')})", "details": body}), 502
    except URLError as e:
        logger.warning("Alpha Vantage proxy URLError: %s", e)
        return jsonify({"error": "Alpha Vantage upstream unavailable", "details": str(e)}), 502
    except Exception as e:
        logger.exception("Alpha Vantage proxy failed")
        return jsonify({"error": "Alpha Vantage proxy failed", "details": str(e)}), 502

    # Alpha Vantage usually returns JSON, including "Error Message"/"Note" payloads.
    # Return decoded JSON when possible; otherwise return text payload.
    text = raw.decode("utf-8", errors="replace")
    if "application/json" in ctype.lower() or text.strip().startswith("{"):
        try:
            return jsonify(json.loads(text))
        except Exception:
            return jsonify({"raw": text})
    return jsonify({"raw": text})


def _llm_decide_search_query(client, model: str, history: list[dict], user_msg: str) -> str:
    """Ask the LLM to decide if a web search is needed."""
    try:
        import re
        history_text = _history_to_text(history[-5:] if history else [])
        prompt = (
            "You are a search planner. Your job is to determine if the user's latest message requires searching the web for current, factual, or external information.\n\n"
            f"Conversation so far:\n{history_text}\n\n"
            f"Latest user message:\n{user_msg}\n\n"
            "If a search is needed, output exactly <search>YOUR QUERY</search> where YOUR QUERY is a concise search engine query.\n"
            "If no search is needed, output <no_search>."
        )
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=60
        )
        reply = str(resp.choices[0].message.content).strip()
        m = re.search(r"<search>(.*?)</search>", reply, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Agentic Search Planner error: %s", e)
    return ""

@app.route("/api/chat", methods=["POST"])
def api_chat():
    ip = _client_ip()
    if _rate_limit_exceeded(ip):
        return jsonify({"error": "Rate limit exceeded. Please wait and try again."}), 429

    data = request.get_json(silent=True) or {}
    user_msg = str(data.get("message", "")).strip()
    image_base64 = data.get("image_base64")
    if image_base64:
        user_msg = f"{user_msg}\n<IMAGE_BASE64>{image_base64}</IMAGE_BASE64>".strip()
    selected_model = data.get("model") or DEFAULT_MODEL

    gemini_api_key = data.get("api_key") or DEFAULT_GEMINI_KEY
    hf_api_key = (data.get("hf_api_key") or HF_TOKEN or "").strip()
    mode = str(data.get("mode") or "conversational").strip().lower()
    reasoning_mode = str(data.get("reasoning_mode") or "once").strip().lower()
    parent_run_id = str(data.get("parent_run_id") or "").strip()
    run_id = str(data.get("run_id") or "").strip() or _new_run_id()
    branch_id = str(data.get("branch_id") or "main").strip() or "main"
    resume_from_checkpoint = str(data.get("resume_from_checkpoint") or "").strip()
    web_urls = _normalize_web_urls(data.get("web_urls"))
    web_auto_search = bool(data.get("web_auto_search", True))
    auto_skip = bool(data.get("auto_skip", False))
    mode_config = _sanitize_mode_config(data.get("mode_config") or {})
    import json
    try:
        config_str = json.dumps(mode_config)
        import re
        found_urls = re.findall(r"(https?://[^\s\"\'\\>]+)", config_str)
        for u in found_urls:
            u = u.strip()
            if u not in web_urls and len(web_urls) < 10:  # MAX_WEB_URLS
                web_urls.append(u)
    except Exception:
        pass
    include_prompts = bool(data.get("include_trace_prompts", False))
    history = _normalize_history(data.get("history"), user_msg)

    allow_web_search = bool(data.get("allow_web_search", False))

    if mode not in {"reasoning", "reasoning_fast", "reasoning_historian", "direct", "conversational", "custom", "project_manager"}:
        mode = "conversational"

    if selected_model not in ALLOWED_MODELS:
        selected_model = DEFAULT_MODEL

    pipeline_route_note = None
    resolved_model = _resolve_model_for_mode(mode, selected_model)
    
    # Pick the right client based on model name
    is_gemini = resolved_model.startswith("gemini-")
    is_local = _is_local_model(resolved_model)
    
    hf_routing = str(data.get("hf_routing") or "").strip()
    is_preset = resolved_model.startswith("preset-")
    if hf_routing and not (is_gemini or is_local or is_preset):
        resolved_model = f"{resolved_model}:{hf_routing}"
    
    try:
        if is_local:
            active_client = _LocalPipelineClient()
        elif is_gemini:
            if not gemini_api_key:
                return jsonify({"error": "Missing Gemini API Key. Please add it in Settings."}), 401
            active_client = genai.Client(
                api_key=gemini_api_key,
                http_options={'api_version': 'v1beta'}
            )
        else:
            if not hf_api_key:
                return jsonify({"error": "Missing Hugging Face API Key. Please add it in Settings."}), 401
            hf_router = data.get("hf_router", "").strip()
            if hf_router.startswith(":"):
                pk = hf_router[1:].lower()
                if pk == "fireworks": pk = "fireworks-ai"
                provider_val = pk if pk in ['together', 'fireworks-ai', 'hyperbolic', 'hf-inference', 'sambanova', 'novita'] else None
                if provider_val:
                    active_client = InferenceClient(token=hf_api_key, provider=provider_val)
                else:
                    active_client = InferenceClient(token=hf_api_key)
            elif hf_router:
                active_client = InferenceClient(token=hf_api_key, base_url=hf_router)
            else:
                active_client = InferenceClient(token=hf_api_key)
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400

    web_context, web_sources = "", []
    if allow_web_search:
        # Agentic Web Search Planner
        search_query = _llm_decide_search_query(active_client, selected_model, history, user_msg)
        if search_query:
            hits = _duckduckgo_search(search_query, max_results=3)
            chunks = []
            bullet_lines = [
                f"- {h['title']} — {h['url']}" + (f"\n  Snippet: {h['snippet']}" if h.get('snippet') else "")
                for h in hits
            ]
            if bullet_lines:
                chunks.append("[AUTO_SEARCH_RESULTS]\n" + "\n".join(bullet_lines))
                for h in hits[:2]:
                    excerpt = _fetch_web_excerpt(h["url"], max_chars=8000)
                    if excerpt:
                        chunks.append(f"[AUTO_FETCHED_PAGE]\n{excerpt}")
                    web_sources.append({"type": "search", "url": h["url"], "title": h["title"]})
            web_context = "\n\n".join(chunks)
    else:
        # Fallback to old heuristic
        web_context, web_sources = _build_web_context(
            user_msg,
            web_urls=web_urls,
            auto_search=web_auto_search,
        )
    # Always prepend current datetime so relative scheduling ("next Monday", "in a week") works.
    now_utc = datetime.now(timezone.utc)
    now_local_str = now_utc.strftime("%A, %B %-d, %Y %H:%M UTC")
    datetime_block = f"[CURRENT_DATETIME]\n{now_local_str}\n[/CURRENT_DATETIME]\n\n"

    augmented_user_msg = datetime_block + user_msg
    if web_context:
        augmented_user_msg = (
            f"{datetime_block}{user_msg}\n\n"
            "[WEB_CONTEXT]\n"
            "Use these web snippets as supporting context. If they conflict, say so and explain uncertainty.\n\n"
            f"{web_context}\n"
            "[/WEB_CONTEXT]"
        )
    if data.get("is_floating_widget"):
        widget_instruction = "\n[SYSTEM NOTE: You are currently operating inside a small floating widget on the user's screen. Keep your final response EXTREMELY concise so it fits without excessive scrolling. Briefly acknowledge that you are operating in this floating box.]\n"
        augmented_user_msg = widget_instruction + augmented_user_msg

    if history and history[-1].get("role") == "user":
        history[-1]["content"] = augmented_user_msg

    run_state = _init_run_state(
        run_id=run_id,
        user_message=user_msg,
        mode=mode,
        selected_model=selected_model,
        resolved_model=resolved_model,
        reasoning_mode=reasoning_mode,
        branch_id=branch_id,
        parent_run_id=parent_run_id,
        resume_from_checkpoint=resume_from_checkpoint,
    )

    if not user_msg:
        return jsonify({"error": "Empty message"}), 400
    if len(user_msg) > MAX_USER_MESSAGE_CHARS:
        return jsonify({"error": f"Message too long (max {MAX_USER_MESSAGE_CHARS} chars)."}), 400

    try:

        if mode == "direct":
            reply = run_direct_chat(active_client, resolved_model, augmented_user_msg, history=history)
            run_state["status"] = "completed"
            run_state["finished_at"] = time.time()
            run_state["result"].update({
                "reply": reply,
                "classification": "DIRECT",
                "tags": [],
                "traces": [{
                    "agent": "Assistant",
                    "status": "completed",
                    "content": reply,
                    "elapsed_ms": 0,
                    "input_messages": []
                }],
                "checkpoints": [],
                "memory_influence": [],
                "error": None,
            })
            if pipeline_route_note:
                reply = f"{reply}\n\nNote: {pipeline_route_note}"
            return jsonify({
                "reply": reply,
                "model": selected_model,
                "resolved_model": resolved_model,
                "classification": "DIRECT",
                "tags": [],
                "traces": [{
                    "agent": "Assistant",
                    "status": "completed",
                    "content": reply,
                    "elapsed_ms": 0,
                    "input_messages": []
                }],
                "error": None,
                "route_note": pipeline_route_note,
                "mode": "direct",
                "run_id": run_id,
                "run_state": _public_run_state(run_state),
                "web_context_used": bool(web_context),
                "web_sources": web_sources,
            })

        if mode == "conversational":
            reply, traces, final_model = run_conversational_chat(
                active_client,
                resolved_model,
                augmented_user_msg,
                history=history,
            )
            public_traces = _public_traces(traces, include_prompts)
            run_state["status"] = "completed"
            run_state["finished_at"] = time.time()
            run_state["result"].update({
                "reply": reply,
                "classification": "CONVERSATIONAL",
                "tags": ["chat", "personality"],
                "traces": public_traces,
                "checkpoints": [],
                "memory_influence": [],
                "error": None,
            })
            if pipeline_route_note:
                reply = f"{reply}\n\nNote: {pipeline_route_note}"
            return jsonify({
                "reply": reply,
                "model": selected_model,
                "resolved_model": final_model,
                "classification": "CONVERSATIONAL",
                "tags": ["chat", "personality"],
                "traces": public_traces,
                "error": None,
                "route_note": pipeline_route_note,
                "mode": "conversational",
                "run_id": run_id,
                "run_state": _public_run_state(run_state),
                "web_context_used": bool(web_context),
                "web_sources": web_sources,
            })

        if mode == "custom":
            reply, traces, final_model = run_custom_mode_chat(
                active_client,
                resolved_model,
                augmented_user_msg,
                mode_config,
                history=history,
                run_id=run_id,
                auto_skip=auto_skip,
            )
            public_traces = _public_traces(traces, include_prompts)
            run_state["status"] = "completed"
            run_state["finished_at"] = time.time()
            run_state["result"].update({
                "reply": reply,
                "classification": "CUSTOM",
                "tags": ["custom", "workshop"],
                "traces": public_traces,
                "checkpoints": [],
                "memory_influence": [],
                "error": None,
            })
            if pipeline_route_note:
                reply = f"{reply}\n\nNote: {pipeline_route_note}"
            return jsonify({
                "reply": reply,
                "model": selected_model,
                "resolved_model": final_model,
                "classification": "CUSTOM",
                "tags": ["custom", "workshop"],
                "traces": public_traces,
                "error": None,
                "route_note": pipeline_route_note,
                "mode": "custom",
                "run_id": run_id,
                "run_state": _public_run_state(run_state),
                "web_context_used": bool(web_context),
                "web_sources": web_sources,
            })

        if mode == "project_manager":
            augmented_user_msg = (
                "[SYSTEM: MISSION CONTROL / PROJECT MANAGER]\n"
                "You are the singular designated Project Head for this project.\n"
                "Your role is to evaluate requests, architect broad strategies, and assign clear instructions or technical breakdowns.\n"
                "Keep your focus on high-level architecture, orchestrating subtasks, and avoiding getting bogged down in minute implementation unless necessary for clarity.\n"
                "[/SYSTEM: MISSION CONTROL / PROJECT MANAGER]\n\n" + augmented_user_msg
            )
            # Make sure it overrides the history if present
            if history and history[-1].get("role") == "user":
                history[-1]["content"] = augmented_user_msg

        if mode == "reasoning_historian":
            pipeline_reasoning_mode = "historian"
        else:
            pipeline_reasoning_mode = "fast" if mode == "reasoning_fast" else reasoning_mode
            
        def on_pipeline_step_update(agent_name, status, content="", elapsed_ms=0, input_messages=None):
            _update_run_trace(
                run_id=run_id,
                agent_name=agent_name,
                status=status,
                content=content,
                elapsed_ms=elapsed_ms,
                input_messages=input_messages if input_messages else []
            )

        result = run_pipeline(
            active_client,
            selected_model,
            augmented_user_msg,
            conversation_history=history,
            reasoning_mode=pipeline_reasoning_mode,
            run_id=run_id,
            branch_id=branch_id,
            resume_from_checkpoint=resume_from_checkpoint,
            on_step_update=on_pipeline_step_update,
        )
        
    except Exception as e:
        import traceback
        with open("app_debug.log", "a") as f:
            f.write("=== CRASH IN API_CHAT ===\n")
            f.write(traceback.format_exc() + "\n")
        run_state["status"] = "failed"
        run_state["finished_at"] = time.time()
        run_state["result"]["error"] = str(e)
        return jsonify({"error": str(e)}), 500

    public_traces = [
        {
            "agent": t.agent,
            "content": t.content,
            "input_messages": t.input_messages if include_prompts else [],
            "elapsed_ms": t.elapsed_ms,
            "trace_id": getattr(t, "trace_id", None),
            "parent_trace_id": getattr(t, "parent_trace_id", None),
            "branch_id": getattr(t, "branch_id", None),
            "checkpoint_id": getattr(t, "checkpoint_id", None),
            "status": getattr(t, "status", "completed"),
            "memory_influence": getattr(t, "memory_influence", []),
        }
        for t in result.traces
    ]
    final_reply = result.final_reply
    if pipeline_route_note and final_reply:
        final_reply = f"{final_reply}\n\nNote: {pipeline_route_note}"

    run_state["status"] = "completed" if not result.error else "failed"
    run_state["finished_at"] = time.time()
    run_state["result"].update({
        "reply": final_reply,
        "classification": result.classification,
        "tags": result.tags,
        "traces": public_traces,
        "checkpoints": result.checkpoints,
        "memory_influence": result.memory_influence,
        "error": result.error,
    })

    return jsonify({
        "reply": final_reply,
        "model": selected_model,
        "resolved_model": resolved_model,
        "classification": result.classification,
        "tags": result.tags,
        "traces": public_traces,
        "run_id": run_id,
        "branch_id": branch_id,
        "checkpoints": result.checkpoints,
        "memory_influence": result.memory_influence,
        "run_state": _public_run_state(run_state),
        "error": result.error,
        "route_note": pipeline_route_note,
        "mode": mode,
        "web_context_used": bool(web_context),
        "web_sources": web_sources,
    })


@app.route("/api/reset", methods=["POST"])
def api_reset():
    """Clear pipeline session state."""
    from reasoning.pipeline import _session
    _session.update({
        "last_heuristic_ids": [],
        "last_tags": [],
        "last_summary": "",
        "last_user_message": "",
        "last_final_reply": "",
        "last_generated_questions": [],
        "last_architect_plan": "",
    })
    _MISSION_RUNS.clear()
    return jsonify({"status": "ok"})


@app.route("/api/runs/<run_id>", methods=["GET"])
def api_get_run(run_id):
    run_state = _MISSION_RUNS.get(run_id)
    if not run_state:
        return jsonify({"error": "Run not found"}), 404
    return jsonify({"run": _public_run_state(run_state)})


@app.route("/api/runs/<run_id>/pause", methods=["POST"])
def api_pause_run(run_id):
    run_state = _MISSION_RUNS.get(run_id)
    if not run_state:
        return jsonify({"error": "Run not found"}), 404
    data = request.get_json(silent=True) or {}
    paused = bool(data.get("paused", True))
    run_state["paused"] = paused
    run_state["status"] = "paused" if paused else ("completed" if run_state.get("finished_at") else "running")
    _append_control_event(run_state, "pause" if paused else "resume", {"paused": paused})
    return jsonify({"status": "ok", "run": _public_run_state(run_state)})


@app.route("/api/runs/<run_id>/approve", methods=["POST"])
def api_approve_run(run_id):
    run_state = _MISSION_RUNS.get(run_id)
    if not run_state:
        return jsonify({"error": "Run not found"}), 404
    data = request.get_json(silent=True) or {}
    agent = str(data.get("agent") or "operator").strip()[:60]
    note = str(data.get("note") or "approved").strip()[:600]
    item = {
        "ts": time.time(),
        "agent": agent,
        "note": note,
    }
    run_state.setdefault("controls", {}).setdefault("approvals", []).append(item)
    _append_control_event(run_state, "approve", item)
    return jsonify({"status": "ok", "run": _public_run_state(run_state)})


@app.route("/api/runs/<run_id>/reroute", methods=["POST"])
def api_reroute_run(run_id):
    run_state = _MISSION_RUNS.get(run_id)
    if not run_state:
        return jsonify({"error": "Run not found"}), 404
    data = request.get_json(silent=True) or {}
    target_agent = str(data.get("target_agent") or "").strip()[:80]
    instruction = str(data.get("instruction") or "").strip()[:2000]
    if not target_agent or not instruction:
        return jsonify({"error": "target_agent and instruction are required"}), 400
    item = {
        "ts": time.time(),
        "target_agent": target_agent,
        "instruction": instruction,
    }
    run_state.setdefault("controls", {}).setdefault("reroutes", []).append(item)
    _append_control_event(run_state, "reroute", item)
    return jsonify({"status": "ok", "run": _public_run_state(run_state)})


@app.route("/api/runs/<run_id>/rerun-agent", methods=["POST"])
def api_rerun_agent(run_id):
    run_state = _MISSION_RUNS.get(run_id)
    if not run_state:
        return jsonify({"error": "Run not found"}), 404

    data = request.get_json(silent=True) or {}
    target_agent = str(data.get("target_agent") or "").strip()[:80]
    if not target_agent:
        return jsonify({"error": "target_agent is required"}), 400

    note = str(data.get("note") or "").strip()[:1200]
    rerun_id = _new_run_id()
    branch_id = str(run_state.get("branch_id") or "main")
    user_msg = str(run_state.get("user_message") or "")
    selected_model = str(run_state.get("model") or DEFAULT_MODEL)
    mode = str(run_state.get("mode") or "conversational")
    reasoning_mode = str(run_state.get("reasoning_mode") or "once")

    reroute_hint = f"\n\n[MISSION_CONTROL_RERUN]\nFocus on agent={target_agent}.\n{note}\n[/MISSION_CONTROL_RERUN]"
    rerun_message = (user_msg + reroute_hint).strip()

    resolved_model = (
        MULTI_STRONG_MODEL
        if (mode in {"direct", "conversational"} and selected_model == MULTI_PRESET_ID)
        else selected_model
    )

    new_state = _init_run_state(
        run_id=rerun_id,
        user_message=rerun_message,
        mode=mode,
        selected_model=selected_model,
        resolved_model=resolved_model,
        reasoning_mode=reasoning_mode,
        branch_id=branch_id,
        parent_run_id=run_id,
    )
    _append_control_event(new_state, "single-agent-rerun", {"target_agent": target_agent, "note": note})

    gemini_api_key = data.get("api_key") or DEFAULT_GEMINI_KEY
    hf_api_key = (data.get("hf_api_key") or HF_TOKEN or "").strip()
    is_gemini = resolved_model.startswith("gemini-")
    try:
        if is_gemini:
            if not gemini_api_key:
                return jsonify({"error": "Missing Gemini API Key. Please add it in Settings."}), 401
            active_client = genai.Client(api_key=gemini_api_key, http_options={'api_version': 'v1beta'})
        else:
            if not hf_api_key:
                return jsonify({"error": "Missing Hugging Face API Key. Please add it in Settings."}), 401
            active_client = InferenceClient(token=hf_api_key)

        result = run_pipeline(
            active_client,
            selected_model,
            rerun_message,
            conversation_history=None,
            reasoning_mode="historian" if mode == "reasoning_historian" else ("fast" if mode == "reasoning_fast" else reasoning_mode),
            run_id=rerun_id,
            branch_id=branch_id,
        )
        traces = _public_traces(result.traces, include_prompts=False)
        new_state["status"] = "completed" if not result.error else "failed"
        new_state["finished_at"] = time.time()
        new_state["result"].update({
            "reply": result.final_reply,
            "classification": result.classification,
            "tags": result.tags,
            "traces": traces,
            "checkpoints": result.checkpoints,
            "memory_influence": result.memory_influence,
            "error": result.error,
        })
        return jsonify({
            "status": "ok",
            "run_id": rerun_id,
            "run": _public_run_state(new_state),
            "reply": result.final_reply,
            "classification": result.classification,
            "tags": result.tags,
            "traces": traces,
            "error": result.error,
        })
    except Exception as exc:
        new_state["status"] = "failed"
        new_state["finished_at"] = time.time()
        new_state["result"]["error"] = str(exc)
        return jsonify({"error": str(exc), "run": _public_run_state(new_state)}), 500


@app.route("/api/runs/<run_id>/branch", methods=["POST"])
def api_branch_run(run_id):
    run_state = _MISSION_RUNS.get(run_id)
    if not run_state:
        return jsonify({"error": "Run not found"}), 404
    data = request.get_json(silent=True) or {}
    resume_from_checkpoint = str(data.get("resume_from_checkpoint") or "").strip()
    branch_id = _new_branch_id()
    child_run_id = _new_run_id()

    branch_state = _init_run_state(
        run_id=child_run_id,
        user_message=str(run_state.get("user_message") or ""),
    mode=str(run_state.get("mode") or "conversational"),
        selected_model=str(run_state.get("model") or DEFAULT_MODEL),
        resolved_model=str(run_state.get("resolved_model") or DEFAULT_MODEL),
        reasoning_mode=str(run_state.get("reasoning_mode") or "once"),
        branch_id=branch_id,
        parent_run_id=run_id,
        resume_from_checkpoint=resume_from_checkpoint,
    )
    branch_state["status"] = "ready"
    _append_control_event(branch_state, "branch-created", {"from_run_id": run_id, "resume_from_checkpoint": resume_from_checkpoint})
    return jsonify({"status": "ok", "run": _public_run_state(branch_state)})


@app.route("/api/runs/<run_id>/compare", methods=["GET"])
def api_compare_runs(run_id):
    left = _MISSION_RUNS.get(run_id)
    if not left:
        return jsonify({"error": "Run not found"}), 404
    other_run_id = str(request.args.get("other_run_id") or "").strip()
    if not other_run_id:
        return jsonify({"error": "other_run_id is required"}), 400
    right = _MISSION_RUNS.get(other_run_id)
    if not right:
        return jsonify({"error": "Comparison run not found"}), 404
    return jsonify({"comparison": _compare_runs(left, right)})


@app.route("/api/scheduled-actions", methods=["GET"])
def api_list_scheduled_actions():
    with _SCHED_LOCK:
        actions = sorted(
            _SCHEDULED_ACTIONS.values(),
            key=lambda x: str(x.get("run_at") or ""),
        )
        return jsonify({"actions": deepcopy(actions)})


@app.route("/api/scheduled-actions", methods=["POST"])
def api_create_scheduled_action():
    data = request.get_json(silent=True) or {}
    run_at = _parse_iso_utc(data.get("run_at"))
    if not run_at:
        return jsonify({"error": "run_at must be a valid ISO datetime"}), 400

    message = str(data.get("message") or "").strip()
    instructions = str(data.get("instructions") or "").strip()
    if not message and not instructions:
        return jsonify({"error": "message or instructions is required"}), 400

    mode = str(data.get("mode") or "conversational").strip().lower()
    if mode not in {"reasoning", "reasoning_fast", "reasoning_historian", "direct", "conversational", "project_manager"}:
        mode = "conversational"

    selected_model = str(data.get("model") or DEFAULT_MODEL).strip()
    if selected_model not in ALLOWED_MODELS:
        selected_model = DEFAULT_MODEL

    repeat = str(data.get("repeat") or "none").strip().lower()
    if repeat not in {"none", "daily", "weekly"}:
        repeat = "none"

    raw_sources = data.get("sources")
    if isinstance(raw_sources, str):
        source_list = [s.strip() for s in re.split(r"[\n,]", raw_sources) if s.strip()]
    elif isinstance(raw_sources, list):
        source_list = [str(s).strip() for s in raw_sources if str(s).strip()]
    else:
        source_list = []

    action = {
        "id": _new_schedule_id(),
        "created_at": _to_iso_utc(datetime.now(timezone.utc)),
        "run_at": _to_iso_utc(run_at),
        "event_title": str(data.get("event_title") or "Scheduled Event").strip()[:120],
        "message": message[:MAX_USER_MESSAGE_CHARS],
        "instructions": instructions[:MAX_USER_MESSAGE_CHARS],
        "mode": mode,
        "reasoning_mode": str(data.get("reasoning_mode") or ("historian" if mode == "reasoning_historian" else ("fast" if mode == "reasoning_fast" else "once")))[:20],
        "model": selected_model,
        "agent_name": str(data.get("agent_name") or data.get("target_agent") or "Agent").strip()[:80],
        "target_agent": str(data.get("target_agent") or "").strip()[:80],
        "note": str(data.get("note") or "").strip()[:1200],
        "sources": [str(u).strip()[:300] for u in source_list][:12],
        "repeat": repeat,
        "enabled": bool(data.get("enabled", True)),
        "status": "scheduled",
        "runs": 0,
        "last_run_id": "",
        "last_error": None,
        "last_reply_preview": "",
    }
    with _SCHED_LOCK:
        _SCHEDULED_ACTIONS[action["id"]] = action
    return jsonify({"status": "ok", "action": action})


@app.route("/api/scheduled-actions/<action_id>", methods=["DELETE"])
def api_delete_scheduled_action(action_id):
    with _SCHED_LOCK:
        if action_id not in _SCHEDULED_ACTIONS:
            return jsonify({"error": "Scheduled action not found"}), 404
        _SCHEDULED_ACTIONS.pop(action_id, None)
    return jsonify({"status": "ok"})


@app.route("/api/scheduled-actions/<action_id>/toggle", methods=["POST"])
def api_toggle_scheduled_action(action_id):
    data = request.get_json(silent=True) or {}
    enabled = bool(data.get("enabled", True))
    with _SCHED_LOCK:
        action = _SCHEDULED_ACTIONS.get(action_id)
        if not action:
            return jsonify({"error": "Scheduled action not found"}), 404
        action["enabled"] = enabled
        if action.get("status") != "running":
            action["status"] = "scheduled" if enabled else "disabled"
        return jsonify({"status": "ok", "action": deepcopy(action)})


@app.route("/api/scheduled-actions/<action_id>/run-now", methods=["POST"])
def api_run_scheduled_action_now(action_id):
    with _SCHED_LOCK:
        action = _SCHEDULED_ACTIONS.get(action_id)
        if not action:
            return jsonify({"error": "Scheduled action not found"}), 404
        action["run_at"] = _to_iso_utc(datetime.now(timezone.utc))
        action["enabled"] = True
        if action.get("status") != "running":
            action["status"] = "scheduled"
    threading.Thread(target=_execute_scheduled_action, args=(action_id,), daemon=True).start()
    return jsonify({"status": "ok"})


@app.route("/api/workshop/files", methods=["GET"])
def api_workshop_files():
    return jsonify({"files": _available_workshop_files()})


# ── Email Integration ─────────────────────────────────────────────────────────

import imaplib
import smtplib
import email as _email_lib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import decode_header as _decode_header

try:
    from cryptography.fernet import Fernet as _Fernet
    _EMAIL_FERNET_KEY = os.environ.get("EMAIL_FERNET_KEY", "").encode()
    if len(_EMAIL_FERNET_KEY) != 44:
        # derive stable 32-byte key from SECRET_KEY
        import hashlib as _hl, base64 as _b64
        _sk = app.config.get("SECRET_KEY", "vibe-default-secret")
        _EMAIL_FERNET_KEY = _b64.urlsafe_b64encode(_hl.sha256(_sk.encode()).digest())
    _fernet = _Fernet(_EMAIL_FERNET_KEY)
    def _enc_pw(pw): return _fernet.encrypt(pw.encode()).decode()
    def _dec_pw(enc): return _fernet.decrypt(enc.encode()).decode()
except Exception:
    import base64 as _b64
    def _enc_pw(pw): return _b64.b64encode(pw.encode()).decode()
    def _dec_pw(enc): return _b64.b64decode(enc.encode()).decode()


def _email_user_key():
    """Return a stable key for looking up email config (user id or 'guest')."""
    if current_user.is_authenticated:
        return str(current_user.id)
    return f"guest:{session.get('guest_id', 'default')}"


def _get_email_config():
    """Load stored email config for this user."""
    import sqlite3 as _sq
    from pathlib import Path as _P
    db_path = _P(__file__).resolve().parent / "data" / "vibe.db"
    conn = _sq.connect(str(db_path))
    conn.row_factory = _sq.Row
    row = conn.execute(
        "SELECT * FROM email_config WHERE user_key = ?", (_email_user_key(),)
    ).fetchone()
    conn.close()
    return dict(row) if row else {}


def _save_email_config(imap_host, imap_port, smtp_host, smtp_port, email_addr, password_enc):
    import sqlite3 as _sq
    from pathlib import Path as _P
    db_path = _P(__file__).resolve().parent / "data" / "vibe.db"
    conn = _sq.connect(str(db_path))
    conn.execute("""
        INSERT INTO email_config (user_key, imap_host, imap_port, smtp_host, smtp_port, email_address, password_enc, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_key) DO UPDATE SET
            imap_host=excluded.imap_host, imap_port=excluded.imap_port,
            smtp_host=excluded.smtp_host, smtp_port=excluded.smtp_port,
            email_address=excluded.email_address, password_enc=excluded.password_enc,
            updated_at=CURRENT_TIMESTAMP
    """, (_email_user_key(), imap_host, int(imap_port), smtp_host, int(smtp_port), email_addr, password_enc))
    conn.commit()
    conn.close()


def _imap_connect(cfg):
    """Open authenticated IMAP connection."""
    host = cfg.get("imap_host", "")
    port = int(cfg.get("imap_port", 993))
    addr = cfg.get("email_address", "")
    pw = _dec_pw(cfg.get("password_enc", ""))
    M = imaplib.IMAP4_SSL(host, port)
    M.login(addr, pw)
    return M


def _decode_mime_words(s):
    """Decode RFC2047 encoded header value to a plain string."""
    if not s:
        return ""
    parts = _decode_header(s)
    out = []
    for chunk, enc in parts:
        if isinstance(chunk, bytes):
            out.append(chunk.decode(enc or "utf-8", errors="replace"))
        else:
            out.append(chunk)
    return "".join(out)


def _fetch_inbox(cfg, page=1, limit=20):
    """Return list of inbox summaries."""
    M = _imap_connect(cfg)
    M.select("INBOX")
    _, data = M.search(None, "ALL")
    if not data or not data[0]:
        return []
    uids = data[0].split()
    uids = list(reversed(uids))  # newest first
    start = (page - 1) * limit
    page_uids = uids[start:start + limit]
    messages = []
    for uid in page_uids:
        _, msg_data = M.fetch(uid, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])")
        raw = msg_data[0][1] if msg_data and len(msg_data) > 0 and msg_data[0] else b""
        msg = _email_lib.message_from_bytes(raw)
        messages.append({
            "uid": uid.decode(),
            "from": _decode_mime_words(msg.get("From", "")),
            "subject": _decode_mime_words(msg.get("Subject", "(no subject)")),
            "date": msg.get("Date", ""),
        })
    total = len(uids)
    M.logout()
    return {"messages": messages, "total": total, "page": page, "limit": limit}


def _fetch_message(cfg, uid):
    """Return full message body."""
    M = _imap_connect(cfg)
    M.select("INBOX")
    _, msg_data = M.fetch(uid.encode(), "(RFC822)")
    raw = msg_data[0][1] if msg_data and len(msg_data) > 0 and msg_data[0] else b""
    msg = _email_lib.message_from_bytes(raw)
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            disp = str(part.get("Content-Disposition", ""))
            if ct == "text/plain" and "attachment" not in disp:
                body = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="replace")
                break
            elif ct == "text/html" and "attachment" not in disp and not body:
                body = "[HTML]\n" + part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="replace")
    else:
        body = msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", errors="replace")
    # Mark as read
    try:
        M.store(uid.encode(), "+FLAGS", "\\Seen")
    except Exception:
        pass
    M.logout()
    return {
        "uid": uid,
        "from": _decode_mime_words(msg.get("From", "")),
        "to": _decode_mime_words(msg.get("To", "")),
        "subject": _decode_mime_words(msg.get("Subject", "(no subject)")),
        "date": msg.get("Date", ""),
        "body": body,
    }


@app.route("/api/email/config", methods=["GET"])
def api_email_config_get():
    cfg = _get_email_config()
    safe = {k: v for k, v in cfg.items() if k != "password_enc"}
    safe["configured"] = bool(cfg.get("password_enc"))
    return jsonify(safe)


@app.route("/api/email/config", methods=["POST"])
def api_email_config_post():
    body = request.get_json(force=True) or {}
    required = ["imap_host", "smtp_host", "email_address"]
    if not all(body.get(k, "").strip() for k in required):
        return jsonify({"error": "imap_host, smtp_host, email_address are required"}), 400
    pw = body.get("password", "").strip()
    if not pw:
        # Keep existing password if none provided
        cfg = _get_email_config()
        enc = cfg.get("password_enc", "")
        if not enc:
            return jsonify({"error": "Password is required for first-time setup"}), 400
    else:
        enc = _enc_pw(pw)
    _save_email_config(
        imap_host=body["imap_host"].strip(),
        imap_port=body.get("imap_port", 993),
        smtp_host=body["smtp_host"].strip(),
        smtp_port=body.get("smtp_port", 587),
        email_addr=body["email_address"].strip(),
        password_enc=enc,
    )
    return jsonify({"ok": True})


@app.route("/api/email/inbox", methods=["GET"])
def api_email_inbox():
    cfg = _get_email_config()
    if not cfg.get("password_enc"):
        return jsonify({"error": "Email not configured"}), 400
    page = int(request.args.get("page", 1))
    limit = min(int(request.args.get("limit", 25)), 50)
    try:
        result = _fetch_inbox(cfg, page=page, limit=limit)
        return jsonify(result)
    except Exception as exc:
        logger.warning("IMAP inbox error: %s", exc)
        return jsonify({"error": str(exc)}), 502


@app.route("/api/email/message", methods=["GET"])
def api_email_message():
    cfg = _get_email_config()
    if not cfg.get("password_enc"):
        return jsonify({"error": "Email not configured"}), 400
    uid = request.args.get("uid", "").strip()
    if not uid:
        return jsonify({"error": "uid required"}), 400
    try:
        msg = _fetch_message(cfg, uid)
        return jsonify(msg)
    except Exception as exc:
        logger.warning("IMAP message error: %s", exc)
        return jsonify({"error": str(exc)}), 502


@app.route("/api/email/send", methods=["POST"])
def api_email_send():
    cfg = _get_email_config()
    if not cfg.get("password_enc"):
        return jsonify({"error": "Email not configured"}), 400
    body = request.get_json(force=True) or {}
    to_addr = body.get("to", "").strip()
    subject = body.get("subject", "").strip() or "(no subject)"
    text = body.get("body", "").strip()
    if not to_addr:
        return jsonify({"error": "to address required"}), 400
    try:
        pw = _dec_pw(cfg["password_enc"])
        from_addr = cfg["email_address"]
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_addr
        msg["To"] = to_addr
        msg.attach(MIMEText(text, "plain"))
        with smtplib.SMTP(cfg["smtp_host"], int(cfg.get("smtp_port", 587))) as s:
            s.ehlo()
            s.starttls()
            s.login(from_addr, pw)
            s.sendmail(from_addr, [to_addr], msg.as_string())
        return jsonify({"ok": True})
    except Exception as exc:
        logger.warning("SMTP send error: %s", exc)
        return jsonify({"error": str(exc)}), 502


@app.route("/api/email/action", methods=["POST"])
def api_email_action():
    cfg = _get_email_config()
    if not cfg.get("password_enc"):
        return jsonify({"error": "Email not configured"}), 400
    body = request.get_json(force=True) or {}
    uid = body.get("uid", "").strip()
    action = body.get("action", "").strip()  # "delete" | "read" | "unread"
    if not uid or action not in ("delete", "read", "unread"):
        return jsonify({"error": "uid and valid action required"}), 400
    try:
        M = _imap_connect(cfg)
        M.select("INBOX")
        if action == "delete":
            M.store(uid.encode(), "+FLAGS", "\\Deleted")
            M.expunge()
        elif action == "read":
            M.store(uid.encode(), "+FLAGS", "\\Seen")
        elif action == "unread":
            M.store(uid.encode(), "-FLAGS", "\\Seen")
        M.logout()
        return jsonify({"ok": True})
    except Exception as exc:
        logger.warning("IMAP action error: %s", exc)
        return jsonify({"error": str(exc)}), 502


# ── Authentication Routes ─────────────────────────────────────────────────────


@app.route("/login")
def auth_login_page():
    """Serve the login/register page (guests can always open this to upgrade to a full account)."""
    if current_user.is_authenticated:
        return redirect(url_for("index"))
    return render_template("login.html", guest_mode=bool(session.get("guest_mode")))


@app.route("/auth/register", methods=["POST"])
def auth_register():
    """Create a new user account."""
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    email = str(data.get("email", "")).strip()
    password = str(data.get("password", ""))

    user, error = create_user(username, email, password)
    if error:
        return jsonify({"error": error}), 400

    session.pop("guest_mode", None)
    login_user(user, remember=True)
    logger.info("New user registered & logged in: %s", username)
    return jsonify({"status": "ok", "user": user.to_dict()})


@app.route("/auth/login", methods=["POST"])
def auth_login():
    """Log in with username/email + password."""
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    user = authenticate_user(username, password)
    if not user:
        return jsonify({"error": "Invalid username or password."}), 401

    session.pop("guest_mode", None)
    login_user(user, remember=True)
    logger.info("User logged in: %s", user.username)
    return jsonify({"status": "ok", "user": user.to_dict()})


@app.route("/auth/logout", methods=["POST"])
def auth_logout():
    """Log out the current user."""
    if current_user.is_authenticated:
        logger.info("User logged out: %s", current_user.username)
    logout_user()
    return jsonify({"status": "ok"})


@app.route("/auth/me", methods=["GET"])
def auth_me():
    """Get current user info."""
    if current_user.is_authenticated:
        return jsonify({"authenticated": True, "user": current_user.to_dict()})
    return jsonify({"authenticated": False, "user": None})


# ── Chat History DB Routes ───────────────────────────────────────────────────

@app.route("/api/sessions", methods=["GET"])
def api_list_sessions():
    """List chat sessions for logged-in user."""
    if not current_user.is_authenticated:
        return jsonify({"sessions": []})
    sessions = get_user_sessions(current_user.id)
    return jsonify({"sessions": sessions})


@app.route("/api/sessions", methods=["POST"])
def api_create_session():
    """Create a new chat session."""
    if not current_user.is_authenticated:
        return jsonify({"error": "Login required"}), 401
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", "New Chat"))[:100]
    session_id = create_chat_session(current_user.id, title)
    return jsonify({"session_id": session_id})


@app.route("/api/sessions/<session_id>/messages", methods=["GET"])
def api_get_messages(session_id):
    """Get messages for a session."""
    if not current_user.is_authenticated:
        return jsonify({"messages": []})
    messages = get_session_messages(session_id)
    return jsonify({"messages": messages})


@app.route("/api/sessions/<session_id>", methods=["DELETE"])
def api_delete_session(session_id):
    """Delete a chat session."""
    if not current_user.is_authenticated:
        return jsonify({"error": "Login required"}), 401
    delete_chat_session(session_id, current_user.id)
    return jsonify({"status": "ok"})


# ── External REST API (API-key auth) ─────────────────────────────────────────

@app.route("/api/v1/chat", methods=["POST"])
@api_key_required
def api_v1_chat():
    """External API: send a message and get a response.

    Headers: X-API-Key: vibe_xxxx
    Body: { "message": "...", "model": "...", "mode": "conversational|reasoning|direct" }
    """
    data = request.get_json(silent=True) or {}
    user_msg = str(data.get("message", "")).strip()
    selected_model = data.get("model") or DEFAULT_MODEL
    gemini_api_key = data.get("gemini_api_key") or DEFAULT_GEMINI_KEY
    hf_api_key = (data.get("hf_api_key") or HF_TOKEN or "").strip()
    mode = str(data.get("mode") or "conversational").strip().lower()

    if not user_msg:
        return jsonify({"error": "Empty message"}), 400
    if len(user_msg) > MAX_USER_MESSAGE_CHARS:
        return jsonify({"error": f"Message too long (max {MAX_USER_MESSAGE_CHARS} chars)"}), 400
    if selected_model not in ALLOWED_MODELS:
        selected_model = DEFAULT_MODEL
    if mode not in {"reasoning", "reasoning_fast", "reasoning_historian", "direct", "conversational", "project_manager"}:
        mode = "conversational"

    resolved_model = (
        MULTI_STRONG_MODEL
        if (mode in {"direct", "conversational"} and selected_model == MULTI_PRESET_ID)
        else selected_model
    )
    is_gemini = resolved_model.startswith("gemini-")

    try:
        if is_gemini:
            if not gemini_api_key:
                return jsonify({"error": "Gemini API key required (pass gemini_api_key in body)"}), 401
            active_client = genai.Client(api_key=gemini_api_key, http_options={'api_version': 'v1beta'})
        else:
            if not hf_api_key:
                return jsonify({"error": "HF API key required (pass hf_api_key in body)"}), 401
            active_client = InferenceClient(token=hf_api_key)

        if mode == "direct":
            reply = run_direct_chat(active_client, resolved_model, user_msg)
            return jsonify({"reply": reply, "model": resolved_model, "mode": "direct"})
        if mode == "conversational":
            reply, traces, _ = run_conversational_chat(active_client, selected_model, user_msg)
            return jsonify({"reply": reply, "model": resolved_model, "mode": "conversational", "traces": _public_traces(traces, include_prompts=False)})

        result = run_pipeline(
            active_client,
            selected_model,
            user_msg,
            reasoning_mode="historian" if mode == "reasoning_historian" else ("fast" if mode == "reasoning_fast" else "once"),
        )
        return jsonify({
            "reply": result.final_reply,
            "model": resolved_model,
            "mode": mode,
            "classification": result.classification,
            "tags": result.tags,
        })
    except Exception as e:
        logger.exception("API v1 error")
        return jsonify({"error": str(e)}), 500


@app.route("/api/v1/models", methods=["GET"])
def api_v1_models():
    """External API: list available models."""
    return jsonify({
        "models": _all_models(),
        "enabled_models": _dropdown_models(),
        "default": _default_dropdown_model(),
    })


@app.route("/api/v1/health", methods=["GET"])
def api_v1_health():
    """Health check endpoint."""
    return jsonify({
        "status": "ok",
        "version": "2.0.0",
        "models": len(_dropdown_models()),
        "uptime_seconds": int(time.time() - _start_time),
    })


_start_time = time.time()


# ── WebSocket Real-Time Chat ─────────────────────────────────────────────────

@socketio.on("compile_app")
def handle_compile_app(data):
    if not current_user.is_authenticated:
        emit("compile_error", {"msg": "Authentication required."})
        return
    socketio.start_background_task(_compile_app_task, data)

def _compile_app_task(data):
    import tempfile
    import subprocess
    import shutil
    
    files = data.get("files", [])
    if not files:
        socketio.emit("compile_log", {"line": "Error: No files provided for compilation."})
        return
        
    workspace_dir = Path(tempfile.mkdtemp(prefix="vibe_compile_"))
    try:
        socketio.emit("compile_log", {"line": f"Initializing compilation workspace at {workspace_dir}..."})
        
        has_package_json = False
        has_main_js = False
        
        for f in files:
            file_path = workspace_dir / f["path"]
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(f.get("content", ""), encoding="utf-8")
            if f["path"] == "package.json":
                has_package_json = True
            if f["path"] == "main.js" or f["path"] == "index.js":
                has_main_js = True
                
        if not has_package_json:
            socketio.emit("compile_log", {"line": "No package.json found. Generating default Electron configuration..."})
            pkg_json = {
                "name": "vibe-compiled-app",
                "version": "1.0.0",
                "main": "main.js",
                "scripts": {
                    "build:win": "electron-builder --win",
                    "build:linux": "electron-builder --linux"
                },
                "devDependencies": {
                    "electron": "^26.0.0",
                    "electron-builder": "^26.8.1"
                }
            }
            (workspace_dir / "package.json").write_text(json.dumps(pkg_json, indent=2))
            
        if not has_main_js:
            socketio.emit("compile_log", {"line": "No main.js found. Generating default Electron entry point..."})
            main_js_content = """
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true
    }
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
"""
            (workspace_dir / "main.js").write_text(main_js_content.strip())
            
        # Install dependencies
        socketio.emit("compile_log", {"line": "Running npm install..."})
        proc = subprocess.Popen(["npm", "install"], cwd=str(workspace_dir), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in iter(proc.stdout.readline, ''):
            socketio.emit("compile_log", {"line": line.rstrip()})
        proc.wait()
        
        if proc.returncode != 0:
            socketio.emit("compile_log", {"line": "Error: npm install failed."})
            return
            
        # Run electron-builder
        socketio.emit("compile_log", {"line": "Running electron-builder (Windows & Linux)..."})
        proc = subprocess.Popen(["npx", "electron-builder", "--win", "--linux"], cwd=str(workspace_dir), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in iter(proc.stdout.readline, ''):
            socketio.emit("compile_log", {"line": line.rstrip()})
        proc.wait()
        
        if proc.returncode != 0:
            socketio.emit("compile_log", {"line": "Error: compilation failed."})
            return
            
        # Move dist outputs to a stable download directory
        dist_dir = workspace_dir / "dist"
        if dist_dir.exists():
            out_dir = WORKSPACE_ROOT / "data" / "compilations" / workspace_dir.name
            shutil.copytree(dist_dir, out_dir, dirs_exist_ok=True)
            socketio.emit("compile_log", {"line": f"Compilation successful! Binaries saved to {out_dir.resolve()}"})
            socketio.emit("compile_done", {"out_dir": str(out_dir.resolve())})
        else:
            socketio.emit("compile_log", {"line": "Error: Compilation finished but dist folder was not found."})
            
    except Exception as e:
        socketio.emit("compile_log", {"line": f"Exception occurred: {str(e)}"})


@socketio.on("connect")
def ws_connect():
    logger.info("WebSocket client connected: %s", request.sid)
    emit("connected", {"status": "ok", "sid": request.sid})


@socketio.on("disconnect")
def ws_disconnect():
    logger.info("WebSocket client disconnected: %s", request.sid)


@socketio.on("chat_message")
def ws_chat_message(data):
    """Handle real-time chat via WebSocket."""
    user_msg = str(data.get("message", "")).strip()
    selected_model = data.get("model") or DEFAULT_MODEL
    gemini_api_key = data.get("api_key") or DEFAULT_GEMINI_KEY
    hf_api_key = (data.get("hf_api_key") or HF_TOKEN or "").strip()
    mode = str(data.get("mode") or "conversational").strip().lower()

    if not user_msg:
        emit("chat_error", {"error": "Empty message"})
        return

    if len(user_msg) > MAX_USER_MESSAGE_CHARS:
        emit("chat_error", {"error": "Message too long"})
        return

    if selected_model not in ALLOWED_MODELS:
        selected_model = DEFAULT_MODEL

    resolved_model = (
        MULTI_STRONG_MODEL
        if (mode in {"direct", "conversational"} and selected_model == MULTI_PRESET_ID)
        else selected_model
    )
    is_gemini = resolved_model.startswith("gemini-")

    try:
        emit("chat_thinking", {"stage": "Initializing..."})

        if is_gemini:
            if not gemini_api_key:
                emit("chat_error", {"error": "Missing Gemini API key"})
                return
            active_client = genai.Client(api_key=gemini_api_key, http_options={'api_version': 'v1beta'})
        else:
            if not hf_api_key:
                emit("chat_error", {"error": "Missing HF API key"})
                return
            active_client = InferenceClient(token=hf_api_key)

        if mode == "direct":
            emit("chat_thinking", {"stage": "Generating response..."})
            reply = run_direct_chat(active_client, resolved_model, user_msg)
            emit("chat_response", {"reply": reply, "model": resolved_model, "mode": "direct", "traces": []})
            return

        if mode == "conversational":
            emit("chat_thinking", {"stage": "Muse is shaping the vibe..."})
            reply, traces, final_model = run_conversational_chat(active_client, selected_model, user_msg)
            emit("chat_response", {
                "reply": reply,
                "model": final_model,
                "mode": "conversational",
                "traces": _public_traces(traces, include_prompts=False),
            })
            return

        # Reasoning mode with stage updates
        emit("chat_thinking", {"stage": "Classifying intent..."})
        result = run_pipeline(active_client, selected_model, user_msg)

        emit("chat_response", {
            "reply": result.final_reply,
            "model": resolved_model,
            "mode": "reasoning",
            "classification": result.classification,
            "tags": result.tags,
            "traces": [
                {"agent": t.agent, "content": t.content, "elapsed_ms": t.elapsed_ms}
                for t in result.traces
            ],
        })

    except Exception as e:
        logger.exception("WebSocket chat error")
        emit("chat_error", {"error": str(e)})


# ── Global Error Handlers ────────────────────────────────────────────────────

@app.errorhandler(400)
def bad_request(e):
    logger.warning("400 Bad Request: %s", e)
    return jsonify({"error": "Bad request", "details": str(e)}), 400


@app.errorhandler(404)
def not_found(e):
    logger.warning("404 Not Found: %s %s", request.method, request.path)
    return jsonify({"error": "Not found", "path": request.path}), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "Method not allowed"}), 405


@app.errorhandler(429)
def too_many_requests(e):
    return jsonify({"error": "Rate limit exceeded. Please wait."}), 429


@app.errorhandler(500)
def internal_error(e):
    logger.exception("500 Internal Server Error")
    return jsonify({"error": "Internal server error"}), 500


# @app.route("/api/memory", methods=["GET"]) -> Already defined above, removing duplicate.
if __name__ == "__main__":
    threading.Thread(target=_scheduler_loop, daemon=True).start()
    print()
    print("  ╔═══════════════════════════════════════════════╗")
    print("  ║   🧠  Vibe Coding — Reasoning Engine v2.0     ║")
    print("  ╚═══════════════════════════════════════════════╝")
    print(f"  Model     : {DEFAULT_MODEL}")
    import os
    port = int(os.environ.get("PORT", 5000))
    print(f"  URL       : http://localhost:{port}")
    print(f"  API Docs  : http://localhost:{port}/api/v1/health")
    print(f"  WebSocket : ws://localhost:{port}")
    print(f"  Auth      : http://localhost:{port}/login")
    print()
    socketio.run(app, debug=True, host="0.0.0.0", port=port)
