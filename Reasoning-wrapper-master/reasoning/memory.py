"""
memory.py — Persistent Memory Storage

Stores manifesto, heuristics, failures, and thought journal on disk so memory
survives restarts. Also tracks Historian notes explicitly.
"""

import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Any


_DATA_DIR = Path(__file__).resolve().parent / ".memory"
_MANIFESTO_FILE = _DATA_DIR / "manifesto.json"
_HEURISTICS_FILE = _DATA_DIR / "heuristics.json"
_THOUGHTS_FILE = _DATA_DIR / "thoughts.json"
_FAILURES_FILE = _DATA_DIR / "failures.json"
_HISTORIAN_FILE = _DATA_DIR / "historian_notes.json"
_EPISODIC_FILE = _DATA_DIR / "typed_episodic.json"
_SEMANTIC_FILE = _DATA_DIR / "typed_semantic.json"
_FAILURE_TYPED_FILE = _DATA_DIR / "typed_failure.json"
_PROCEDURAL_FILE = _DATA_DIR / "typed_procedural.json"

_MAX_MANIFESTO = 300
_MAX_HEURISTICS = 800
_MAX_THOUGHTS = 300
_MAX_FAILURES = 300
_MAX_HISTORIAN = 400
_MAX_TYPED = 600

_DEFAULT_HEURISTICS = [
    {"id": "h-1", "question": "What is the smallest correct version that satisfies the request?", "origin": "seed", "score": 20, "uses": 0, "tags": ["general"]},
    {"id": "h-2", "question": "Which edge cases could break this implementation?", "origin": "seed", "score": 20, "uses": 0, "tags": ["general", "testing"]},
    {"id": "h-3", "question": "What assumptions about inputs, state, or environment must be validated?", "origin": "seed", "score": 18, "uses": 0, "tags": ["general", "validation"]},
    {"id": "h-4", "question": "How can we keep this solution maintainable and easy to modify?", "origin": "seed", "score": 16, "uses": 0, "tags": ["architecture"]},
]


def _load_list(path: Path) -> list:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _save_list(path: Path, items: list) -> None:
    try:
        path.write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")
    except OSError:
        # Keep app running even if persistence fails.
        pass


def _norm_text(value: Any, max_len: int = 2000) -> str:
    text = str(value or "").strip()
    return text[:max_len]


def _norm_tags(tags: Any, fallback: list[str] | None = None) -> list[str]:
    if not isinstance(tags, list):
        return (fallback or ["general"])[:8]
    out = []
    for t in tags:
        s = str(t or "").strip().lower()
        if s and s not in out:
            out.append(s)
        if len(out) >= 8:
            break
    return out or (fallback or ["general"])[:8]


def _next_id(prefix: str, items: list[dict]) -> str:
    used = set()
    for it in items:
        sid = str(it.get("id", ""))
        if sid.startswith(prefix):
            try:
                used.add(int(sid.split("-", 1)[1]))
            except (ValueError, IndexError):
                continue
    n = 1
    while n in used:
        n += 1
    return f"{prefix}{n}"


_TYPED_KIND_TO_FILE = {
    "episodic": _EPISODIC_FILE,
    "semantic": _SEMANTIC_FILE,
    "failure": _FAILURE_TYPED_FILE,
    "procedural": _PROCEDURAL_FILE,
}


def _typed_bucket(kind: str) -> list[dict]:
    k = (kind or "").strip().lower()
    if k not in _TYPED_KIND_TO_FILE:
        return []
    return _MEMORY_STORE["typed"].setdefault(k, [])


def _save_typed(kind: str) -> None:
    k = (kind or "").strip().lower()
    path = _TYPED_KIND_TO_FILE.get(k)
    if not path:
        return
    _save_list(path, _MEMORY_STORE["typed"].get(k, []))


def _tokenize(text: str) -> set[str]:
    if not text:
        return set()
    out = set()
    buff = []
    for ch in text.lower():
        if ch.isalnum() or ch in {"_", "-"}:
            buff.append(ch)
        else:
            tok = "".join(buff)
            if len(tok) >= 2:
                out.add(tok)
            buff = []
    tail = "".join(buff)
    if len(tail) >= 2:
        out.add(tail)
    return out


def write_typed_memory(
    kind: str,
    text: str,
    *,
    tags: list[str] | None = None,
    source: str = "runtime",
    influence: float = 1.0,
    metadata: dict | None = None,
) -> str:
    """Persist typed memory with metadata for transparent retrieval influence."""
    k = (kind or "").strip().lower()
    if k not in _TYPED_KIND_TO_FILE:
        return ""

    body = _norm_text(text, 2200)
    if not body:
        return ""

    bucket = _typed_bucket(k)
    norm_tags = _norm_tags(tags, fallback=["general"])
    for item in bucket:
        if _norm_text(item.get("text"), 2200).lower() == body.lower():
            item["uses"] = int(item.get("uses", 0)) + 1
            item["tags"] = _norm_tags(item.get("tags", []) + norm_tags)
            item["updated_at"] = datetime.now(timezone.utc).isoformat()
            _save_typed(k)
            return str(item.get("id", ""))

    item_id = _next_id(f"{k[0]}m-", bucket)
    bucket.append({
        "id": item_id,
        "kind": k,
        "text": body,
        "source": _norm_text(source, 80) or "runtime",
        "tags": norm_tags,
        "influence": max(0.1, min(4.0, float(influence or 1.0))),
        "uses": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "metadata": metadata or {},
    })
    if len(bucket) > _MAX_TYPED:
        _MEMORY_STORE["typed"][k] = bucket[-_MAX_TYPED:]
    _save_typed(k)
    return item_id


def retrieve_typed_memory(
    query: str,
    *,
    tags: list[str] | None = None,
    kinds: list[str] | None = None,
    n: int = 6,
) -> list[dict]:
    """Retrieve typed memories with a transparent relevance score."""
    q = _norm_text(query, 2000)
    if not q:
        return []

    q_tokens = _tokenize(q)
    q_tags = set(_norm_tags(tags, fallback=[]))
    include_kinds = [k for k in (kinds or ["episodic", "semantic", "failure", "procedural"]) if k in _TYPED_KIND_TO_FILE]
    if not include_kinds:
        include_kinds = ["episodic", "semantic", "failure", "procedural"]

    scored: list[tuple[float, dict]] = []
    now_ts = datetime.now(timezone.utc).timestamp()
    for k in include_kinds:
        for item in _typed_bucket(k):
            txt = _norm_text(item.get("text"), 2200)
            if not txt:
                continue
            t_tokens = _tokenize(txt)
            overlap = len(q_tokens.intersection(t_tokens))
            if overlap <= 0 and q_tags:
                itags = set(_norm_tags(item.get("tags"), fallback=[]))
                overlap = 1 if q_tags.intersection(itags) else 0
            if overlap <= 0:
                continue

            itags = set(_norm_tags(item.get("tags"), fallback=[]))
            tag_boost = len(q_tags.intersection(itags)) * 2
            uses = int(item.get("uses", 0) or 0)
            influence = float(item.get("influence", 1.0) or 1.0)
            updated = str(item.get("updated_at") or item.get("created_at") or "")
            try:
                updated_ts = datetime.fromisoformat(updated.replace("Z", "+00:00")).timestamp()
            except ValueError:
                updated_ts = now_ts
            age_days = max(0.0, (now_ts - updated_ts) / 86400.0)
            recency = max(0.0, 8.0 - min(age_days, 8.0))
            score = float(overlap * 4 + tag_boost + uses * 0.25 + recency) * influence

            scored.append((score, {
                "id": item.get("id", ""),
                "kind": k,
                "text": txt,
                "tags": list(itags),
                "source": item.get("source", "runtime"),
                "score": round(score, 2),
                "influence": influence,
                "uses": uses,
            }))

    scored.sort(key=lambda x: x[0], reverse=True)
    out = [row for _, row in scored[: max(1, n)]]

    # Track influence usage for transparency and feedback loops.
    for row in out:
        bucket = _typed_bucket(row.get("kind", ""))
        for item in bucket:
            if item.get("id") == row.get("id"):
                item["uses"] = int(item.get("uses", 0)) + 1
                item["updated_at"] = datetime.now(timezone.utc).isoformat()
                break
    for kind in include_kinds:
        _save_typed(kind)
    return out


def get_typed_memory_data() -> dict:
    return {
        "version": 1,
        "stores": {
            "episodic": _typed_bucket("episodic"),
            "semantic": _typed_bucket("semantic"),
            "failure": _typed_bucket("failure"),
            "procedural": _typed_bucket("procedural"),
        },
    }


def _heuristic_text(h: dict) -> str:
    return _norm_text(h.get("question") or h.get("text"), 300)


def _normalize_heuristics(raw: list) -> list[dict]:
    out: list[dict] = []
    seen = set()
    for h in raw or []:
        if not isinstance(h, dict):
            continue
        q = _heuristic_text(h)
        if not q:
            continue
        key = q.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "id": str(h.get("id") or _next_id("h-", out)),
            "question": q,
            "origin": _norm_text(h.get("origin"), 80) or "unknown",
            "score": int(h.get("score", h.get("xp", 0)) or 0),
            "uses": int(h.get("uses", 0) or 0),
            "tags": _norm_tags(h.get("tags"), fallback=["general"]),
            "generated": bool(h.get("generated", False)),
        })
        if len(out) >= _MAX_HEURISTICS:
            break
    return out


def _ensure_storage() -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    for fp in (
        _MANIFESTO_FILE,
        _HEURISTICS_FILE,
        _THOUGHTS_FILE,
        _FAILURES_FILE,
        _HISTORIAN_FILE,
        _EPISODIC_FILE,
        _SEMANTIC_FILE,
        _FAILURE_TYPED_FILE,
        _PROCEDURAL_FILE,
    ):
        if not fp.exists():
            _save_list(fp, [])


_ensure_storage()

# ── In-process cache backed by disk ─────────────────────────────────────────
_MEMORY_STORE = {
    "manifesto": _load_list(_MANIFESTO_FILE),
    "heuristics": _load_list(_HEURISTICS_FILE),
    "thoughts": _load_list(_THOUGHTS_FILE),
    "failures": _load_list(_FAILURES_FILE),
    "historian_notes": _load_list(_HISTORIAN_FILE),
    "typed": {
        "episodic": _load_list(_EPISODIC_FILE),
        "semantic": _load_list(_SEMANTIC_FILE),
        "failure": _load_list(_FAILURE_TYPED_FILE),
        "procedural": _load_list(_PROCEDURAL_FILE),
    },
}

# Normalize/repair heuristics and seed defaults if needed.
_MEMORY_STORE["heuristics"] = _normalize_heuristics(_MEMORY_STORE["heuristics"])
if not _MEMORY_STORE["heuristics"]:
    _MEMORY_STORE["heuristics"] = list(_DEFAULT_HEURISTICS)
    _save_list(_HEURISTICS_FILE, _MEMORY_STORE["heuristics"])

# ── Manifesto ────────────────────────────────────────────────────────────────

def read_manifesto() -> str:
    """Return the full text of the in-memory manifesto."""
    if not _MEMORY_STORE["manifesto"]:
        return "(No manifesto yet.)"
    return "\n".join(_MEMORY_STORE["manifesto"])


def append_to_manifesto(paragraph: str) -> None:
    """Append a scribe-generated paragraph to the in-memory manifesto."""
    paragraph = _norm_text(paragraph, 1200)
    if not paragraph:
        return
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    entry = f"- **{timestamp}** — {paragraph}"
    if _MEMORY_STORE["manifesto"] and _MEMORY_STORE["manifesto"][-1].endswith(paragraph):
        return
    _MEMORY_STORE["manifesto"].append(entry)
    if len(_MEMORY_STORE["manifesto"]) > _MAX_MANIFESTO:
        _MEMORY_STORE["manifesto"] = _MEMORY_STORE["manifesto"][-_MAX_MANIFESTO:]
    _save_list(_MANIFESTO_FILE, _MEMORY_STORE["manifesto"])
    write_typed_memory(
        "semantic",
        paragraph,
        tags=["manifesto", "learning"],
        source="scribe",
        influence=1.2,
    )


# ── Heuristic Library ────────────────────────────────────────────────────────

def get_heuristics_data() -> dict:
    """Return the full heuristic library data."""
    questions = sorted(
        _MEMORY_STORE["heuristics"],
        key=lambda q: (int(q.get("score", 0)), int(q.get("uses", 0))),
        reverse=True,
    )
    return {"version": 2, "questions": questions}


def save_heuristic(question: str, origin: str, tags: list[str] | None = None) -> None:
    """Save a new heuristic question to memory."""
    question = _norm_text(question, 300)
    if not question:
        return
    tags = _norm_tags(tags, fallback=["general"])

    for h in _MEMORY_STORE["heuristics"]:
        if _heuristic_text(h).lower() == question.lower():
            h["uses"] = int(h.get("uses", 0)) + 1
            existing_tags = _norm_tags(h.get("tags"), fallback=["general"])
            h["tags"] = _norm_tags(existing_tags + tags)
            return

    new_h = {
        "id": _next_id("h-", _MEMORY_STORE["heuristics"]),
        "question": question,
        "origin": _norm_text(origin, 80) or "unknown",
        "score": 0,
        "uses": 0,
        "tags": tags,
    }
    _MEMORY_STORE["heuristics"].append(new_h)
    if len(_MEMORY_STORE["heuristics"]) > _MAX_HEURISTICS:
        _MEMORY_STORE["heuristics"] = _MEMORY_STORE["heuristics"][-_MAX_HEURISTICS:]
    _save_list(_HEURISTICS_FILE, _MEMORY_STORE["heuristics"])
    write_typed_memory(
        "procedural",
        question,
        tags=tags,
        source=f"heuristic:{origin}",
        influence=1.1,
    )


def get_top_heuristics(tags: list[str], n: int = 3) -> list[dict]:
    """Return heuristic questions overlap with tags."""
    questions = _MEMORY_STORE["heuristics"]
    if not questions:
        return []

    tag_set = set(_norm_tags(tags))
    scored: list[tuple[tuple[int, int, int], dict]] = []
    for q in questions:
        q_tags = set(_norm_tags(q.get("tags"), fallback=["general"]))
        
        # Semantic improvement: score partial/substring matches
        overlap = 0
        for t1 in tag_set:
            if t1 in q_tags:
                overlap += 10
            else:
                for t2 in q_tags:
                    if t1 in t2 or t2 in t1:
                        overlap += 3

        score = int(q.get("score", 0))
        uses = int(q.get("uses", 0))
        scored.append(((overlap, score, uses), q))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = [s[1] for s in scored[: max(1, n)]]
    
    # Check if there is basically zero meaningful overlap in the top scored
    if all(s[0][0] == 0 for s in scored[:max(1, n)]):
        top = sorted(
            questions,
            key=lambda q: (int(q.get("score", 0)), int(q.get("uses", 0))),
            reverse=True,
        )[: max(1, n)]
    return top[: max(1, n)]


def adjust_xp(question_ids: list[str], delta: int) -> None:
    """Adjust score for heuristics."""
    id_set = set(question_ids)
    for q in _MEMORY_STORE["heuristics"]:
        if q.get("id") in id_set:
            current = int(q.get("score", 0))
            q["score"] = max(-100, min(1000, current + int(delta)))
            q["uses"] = int(q.get("uses", 0)) + 1
    _save_list(_HEURISTICS_FILE, _MEMORY_STORE["heuristics"])


def get_all_heuristic_ids_for_tags(tags: list[str]) -> list[str]:
    """Return IDs of all heuristics that overlap with the given tags."""
    tag_set = set(_norm_tags(tags))
    matched = []
    for q in _MEMORY_STORE["heuristics"]:
        qid = str(q.get("id", "")).strip()
        if not qid:
            continue
        q_tags = set(_norm_tags(q.get("tags"), fallback=["general"]))
        
        # Improved semantic matching for ID retrieval
        has_match = any(t in q_tags for t in tag_set)
        if not has_match:
            has_match = any(t1 in t2 or t2 in t1 for t1 in tag_set for t2 in q_tags)
            
        if has_match:
            matched.append(qid)
    if matched:
        return matched
    return [q.get("id") for q in get_top_heuristics(tags, n=5) if q.get("id")]


# ── Failure Log ──────────────────────────────────────────────────────────────

def get_failures_data() -> dict:
    """Return the full failure log data."""
    return {"failures": _MEMORY_STORE["failures"]}


def get_recent_failures(n: int = 10) -> list[dict]:
    """Return the most recent n failure entries."""
    return _MEMORY_STORE["failures"][-n:]


def log_failure(summary: str, snippet: str, tags: list[str],
                heuristic_ids_used: list[str]) -> None:
    """Record a failure for future Historian reference."""
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary": _norm_text(summary, 300),
        "snippet": _norm_text(snippet, 1200),
        "tags": _norm_tags(tags),
        "heuristic_ids_used": [str(x) for x in (heuristic_ids_used or [])[:16]],
    }
    if entry["summary"] and _MEMORY_STORE["failures"]:
        last = _MEMORY_STORE["failures"][-1]
        if last.get("summary") == entry["summary"]:
            return
    _MEMORY_STORE["failures"].append(entry)
    if len(_MEMORY_STORE["failures"]) > _MAX_FAILURES:
        _MEMORY_STORE["failures"] = _MEMORY_STORE["failures"][-_MAX_FAILURES:]
    _save_list(_FAILURES_FILE, _MEMORY_STORE["failures"])
    write_typed_memory(
        "failure",
        f"{entry['summary']}\n{entry['snippet']}",
        tags=entry.get("tags", []),
        source="failure-log",
        influence=1.5,
        metadata={"heuristic_ids_used": entry.get("heuristic_ids_used", [])},
    )


# ── Thought Journal ──────────────────────────────────────────────────────────

def get_thought_journal_data() -> dict:
    """Return the full thought journal data."""
    return {"version": 1, "thoughts": _MEMORY_STORE["thoughts"]}


def get_historian_data() -> dict:
    """Return historian notes for transparency/debugging."""
    return {"notes": _MEMORY_STORE["historian_notes"]}


def find_similar_thoughts(tags: list[str], succeeded: bool = True, n: int = 3) -> list[dict]:
    """Find similar past thoughts based on tag overlap (In-Memory)."""
    tag_set = set(_norm_tags(tags))
    candidates = []

    for t in _MEMORY_STORE["thoughts"]:
        if t.get("succeeded", False) == succeeded:
            t_tags = set(_norm_tags(t.get("tags"), fallback=[]))
            
            # Semantic improvement: score partial/substring matches
            overlap = 0
            for t1 in tag_set:
                if t1 in t_tags:
                    overlap += 10
                else:
                    for t2 in t_tags:
                        if t1 in t2 or t2 in t1:
                            overlap += 3
            
            if overlap > 0:
                recency = t.get("timestamp", "")
                candidates.append(((overlap, recency), t))

    candidates.sort(key=lambda x: x[0], reverse=True)
    return [c[1] for c in candidates[:n]]


def save_thought(
    tags: list[str],
    thought_record: dict,
    generated_questions: list[str],
    succeeded: bool = True,
) -> None:
    """Save a thought process (questions asked, approach taken) to the journal."""
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "tags": _norm_tags(tags),
        "succeeded": succeeded,
        "generated_questions": [_norm_text(q, 220) for q in (generated_questions or [])[:8]],
        **thought_record,
    }
    entry["problem_type"] = _norm_text(entry.get("problem_type", "general"), 80) or "general"
    entry["approach_summary"] = _norm_text(entry.get("approach_summary", ""), 500)
    entry["pitfalls_avoided"] = _norm_text(entry.get("pitfalls_avoided", ""), 300)
    entry["reuse_hint"] = _norm_text(entry.get("reuse_hint", ""), 280)
    entry["key_questions"] = [_norm_text(q, 220) for q in (entry.get("key_questions") or [])[:5]]

    _MEMORY_STORE["thoughts"].append(entry)
    if len(_MEMORY_STORE["thoughts"]) > _MAX_THOUGHTS:
        _MEMORY_STORE["thoughts"] = _MEMORY_STORE["thoughts"][-_MAX_THOUGHTS:]
    _save_list(_THOUGHTS_FILE, _MEMORY_STORE["thoughts"])
    write_typed_memory(
        "episodic",
        (
            f"problem_type={entry.get('problem_type','general')}\n"
            f"approach={entry.get('approach_summary','')}\n"
            f"reuse_hint={entry.get('reuse_hint','')}"
        ),
        tags=entry.get("tags", []),
        source="thought-journal",
        influence=1.3 if succeeded else 1.0,
        metadata={"succeeded": bool(succeeded)},
    )


def add_generated_heuristic(question_text: str, tags: list[str]) -> str:
    """Add a generated heuristic to in-memory store."""
    question_text = _norm_text(question_text, 300)
    if not question_text:
        return ""

    for h in _MEMORY_STORE["heuristics"]:
        if _heuristic_text(h).lower() == question_text.lower():
            return str(h.get("id", ""))

    new_id = _next_id("hg-", _MEMORY_STORE["heuristics"])
    _MEMORY_STORE["heuristics"].append({
        "id": new_id,
        "question": question_text,
        "tags": _norm_tags(tags),
        "score": 10,
        "uses": 0,
        "origin": "introspector",
        "generated": True,
    })
    if len(_MEMORY_STORE["heuristics"]) > _MAX_HEURISTICS:
        _MEMORY_STORE["heuristics"] = _MEMORY_STORE["heuristics"][-_MAX_HEURISTICS:]
    _save_list(_HEURISTICS_FILE, _MEMORY_STORE["heuristics"])
    return new_id


def log_historian_note(summary: str, tags: list[str], matched_failure: bool) -> None:
    """Persist Historian outcomes so they can be inspected and reused."""
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary": _norm_text(summary, 1200),
        "tags": _norm_tags(tags),
        "matched_failure": bool(matched_failure),
    }
    _MEMORY_STORE["historian_notes"].append(entry)
    if len(_MEMORY_STORE["historian_notes"]) > _MAX_HISTORIAN:
        _MEMORY_STORE["historian_notes"] = _MEMORY_STORE["historian_notes"][-_MAX_HISTORIAN:]
    _save_list(_HISTORIAN_FILE, _MEMORY_STORE["historian_notes"])
    write_typed_memory(
        "semantic",
        summary,
        tags=entry.get("tags", []),
        source="historian",
        influence=1.35 if matched_failure else 1.0,
        metadata={"matched_failure": bool(matched_failure)},
    )
