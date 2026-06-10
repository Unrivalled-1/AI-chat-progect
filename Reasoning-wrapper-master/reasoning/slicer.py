"""
slicer.py — The Slicer (Context Manager)

Instead of dumping the whole conversation history, the Slicer builds a
focused context window for the strategy agents:
    • Current time
    • The project manifesto (trimmed)
    • Top 3 highest-XP heuristic questions matching the task tags
    • Self-generated questions from the Introspector
    • Recent failures
    • A compact codebase snapshot
    • The user's current request + summary
"""

from pathlib import Path
import re

from .constitution import time_context
from . import memory


def build_context_slice(
    tags: list[str],
    user_message: str,
    summary: str,
    conversation_history: list[dict] | None = None,
    generated_questions: list[str] | None = None,
    include_code: bool = True,
) -> str:
    """
    Assemble a compact context block that the strategy agents receive
    instead of the full history.
    """
    # 0. Time context
    time_block = time_context()

    # 1. Manifesto (tight cap to keep prompts concise)
    manifesto = memory.read_manifesto()
    if len(manifesto) > 900:
        manifesto = manifesto[:900] + "\n… (trimmed)"

    # 2. Top heuristics (static library)
    top_qs = memory.get_top_heuristics(tags, n=3)
    heuristic_lines = []
    for q in top_qs:
        qid = q.get("id", "?")
        xp = q.get("xp", q.get("score", 0))
        text = q.get("text") or q.get("question") or "(missing question text)"
        effective = "  ✅ effective" if q.get("effective") else ""
        generated = " 🤖 generated" if q.get("generated") else ""
        heuristic_lines.append(
            f"  [{qid}] (XP {xp}){effective}{generated} {text}"
        )
    heuristic_block = "\n".join(heuristic_lines)
    if not heuristic_block:
        heuristic_block = "  (no matching heuristics)"

    # 3. Self-generated questions from Introspector
    if generated_questions:
        self_q_block = "\n".join(
            f"  • {q}" for q in generated_questions
        )
    else:
        self_q_block = "  (none generated)"

    # 4. Recent failures (for the Historian)
    failures = memory.get_recent_failures(n=4)
    if failures:
        failure_block = "\n".join(
            f"  • [{f['timestamp'][:10]}] {f['summary']}"
            for f in failures
        )
    else:
        failure_block = "  (no recorded failures)"

    # 5. Codebase snapshot (for strategy agents)
    code_block = "  (code snapshot disabled)"
    if include_code:
        code_block = _build_code_snapshot()

    # 6. Conversation history (what the user sees in chat)
    history_block = _history_to_text(conversation_history or [])

    return (
        f"{time_block}\n"
        "═══ PROJECT MANIFESTO (excerpt) ═══\n"
        f"{manifesto}\n\n"
        "═══ TOP HEURISTIC QUESTIONS (from library) ═══\n"
        f"{heuristic_block}\n\n"
        "═══ SELF-GENERATED QUESTIONS (from Introspector) ═══\n"
        f"{self_q_block}\n\n"
        "═══ RECENT FAILURES ═══\n"
        f"{failure_block}\n\n"
        "═══ CODEBASE SNAPSHOT ═══\n"
        f"{code_block}\n\n"
        "═══ PAST CONVERSATION HISTORY (FOR CONTEXT ONLY) ═══\n"
        "The following messages are past history. DO NOT ANSWER OLD QUESTIONS.\n"
        f"{history_block}\n\n"
        "═══ CURRENT TASK (WHAT YOU MUST FOCUS ON NOW) ═══\n"
        "IGNORE old context if it does not relate to this current request.\n"
        f"Summary : {summary}\n"
        f"Tags    : {', '.join(tags) if tags else '(none)'}\n"
        f"Message : {user_message}\n"
    )


def _history_to_text(history: list[dict], max_chars: int = 12000) -> str:
    if not history:
        return "  (no prior messages)"

    lines = []
    total = 0
    # Process newest to oldest to guarantee we keep the latest context
    for m in reversed(history[-24:]):
        role = (m.get("role") or "user").strip().lower()
        if role not in {"user", "assistant"}:
            continue
        content = (m.get("content") or "").strip()
        if not content:
            continue
        line = f"  {role.upper()}: {content}\n"
        if total + len(line) > max_chars:
            break
        lines.append(line)
        total += len(line)

    lines.reverse()
    return "".join(lines) if lines else "  (no prior messages)"


def _build_code_snapshot(max_chars: int = 4200, per_file: int = 520) -> str:
    """Return a compact, high-signal code snapshot for model context."""
    root = Path(__file__).resolve().parents[1]
    exclude_dirs = {".git", "venv", "__pycache__", ".vibe", "node_modules"}
    include_ext = {".py", ".js", ".ts", ".html", ".css", ".md", ".json"}

    blocks: list[str] = []
    total = 0

    preferred = [
        root / "app.py",
        root / "auth.py",
        root / "chat.py",
        root / "README.md",
        root / "templates" / "index.html",
    ]
    candidate_paths = [p for p in preferred if p.exists()]
    candidate_paths.extend([p for p in root.rglob("*") if p not in candidate_paths])

    for path in candidate_paths:
        if path.is_dir():
            if path.name in exclude_dirs:
                continue
            continue
        if path.suffix.lower() not in include_ext:
            continue
        if any(part in exclude_dirs for part in path.parts):
            continue

        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        if not text.strip():
            continue

        snippet = _compact_code_preview(text, per_file)
        rel = path.relative_to(root)
        block = f"--- {rel} ---\n{snippet}\n"
        if total + len(block) > max_chars:
            break
        blocks.append(block)
        total += len(block)

    if not blocks:
        return "  (no code files found)"
    return "\n".join(blocks)


def _compact_code_preview(text: str, max_chars: int) -> str:
    """Prefer signatures/imports + short head/tail over raw large chunks."""
    lines = text.splitlines()
    if not lines:
        return ""

    sig_pat = re.compile(r"^\s*(def |class |async def |from |import |@app\.route|function |const |let |var )")
    sig_lines = []
    for i, line in enumerate(lines, start=1):
        if sig_pat.match(line.strip()):
            sig_lines.append(f"L{i}: {line.strip()}")
        if len(sig_lines) >= 28:
            break

    head = "\n".join(lines[:22])
    tail = "\n".join(lines[-10:]) if len(lines) > 32 else ""
    preview = (
        "SIGNATURES:\n"
        + ("\n".join(sig_lines) if sig_lines else "(none)")
        + "\n\nHEAD:\n"
        + head
    )
    if tail:
        preview += "\n\nTAIL:\n" + tail

    if len(preview) > max_chars:
        preview = preview[:max_chars] + "\n...(trimmed)..."
    return preview


def get_heuristic_ids_used(tags: list[str]) -> list[str]:
    """Return the IDs of the heuristics that were included in the slice."""
    top_qs = memory.get_top_heuristics(tags, n=3)
    return [q["id"] for q in top_qs]
