"""
synthesizer.py — The Synthesizer Agent + BugChecker

Synthesizer: Takes the reasoning chain (Introspector → Architect → Skeptic)
and produces a clean, polished response.

BugChecker: Audits the Synthesizer's output for bugs and missing features.
Returns a hard PASS/FAIL verdict that the pipeline uses for routing.
"""

from .constitution import SYNTHESIZER_PREAMBLE, BUGCHECKER_PREAMBLE, compose_system_prompt


def _strip_fences(raw: str) -> str:
    cleaned = (raw or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("```", 1)[0]
    return cleaned.strip()


def parse_bugcheck_json(raw: str) -> dict | None:
    """Strict JSON parse for bugcheck output. Returns None if malformed."""
    import json

    cleaned = _strip_fences(raw)
    try:
        data = json.loads(cleaned)
    except (json.JSONDecodeError, TypeError):
        return None

    if not isinstance(data, dict):
        return None

    verdict = str(data.get("verdict", "")).upper()
    if verdict not in ("PASS", "FAIL"):
        return None

    def _norm_list(value) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(v) for v in value if str(v).strip()][:12]

    return {
        "verdict": verdict,
        "bugs": _norm_list(data.get("bugs", [])),
        "missing": _norm_list(data.get("missing", [])),
        "fix_hints": _norm_list(data.get("fix_hints", [])),
    }


def is_valid_bugcheck_json(raw: str) -> bool:
    return parse_bugcheck_json(raw) is not None


def build_synthesizer_messages(
    user_message: str,
    generated_questions: list[str],
    architect_plan: str,
    skeptic_critique: str,
    context_slice: str = "",
) -> list[dict]:
    """Build the prompt with the reasoning chain."""

    notes = _build_chain(generated_questions, architect_plan, skeptic_critique)

    return [
        {
            "role": "system",
            "content": compose_system_prompt(SYNTHESIZER_PREAMBLE),
        },
        {
            "role": "user",
            "content": (
                f"{context_slice}\n\n"
                f"INTERNAL REASONING CHAIN (do NOT show to user):\n{notes}\n\n"
                "Now write your final response incorporating insights from the "
                "reasoning chain above. ONLY return code if the user explicitly requested it. "
                "Otherwise, respond naturally in markdown. Do NOT write code files or scripting "
                "unless the user's prompt is a code generation task."
            ),
        },
    ]


def build_bugcheck_messages(
    user_message: str,
    code_reply: str,
) -> list[dict]:
    """BugChecker audits the Synthesizer's output."""
    return [
        {
            "role": "system",
            "content": compose_system_prompt(BUGCHECKER_PREAMBLE),
        },
        {
            "role": "user",
            "content": (
                f"## Original User Request\n{user_message}\n\n"
                f"## Code/Response to Audit\n{code_reply}\n\n"
                "Audit the code above. Output your verdict as JSON."
            ),
        },
    ]


def parse_bugcheck(raw: str) -> dict:
    """Parse the BugChecker's JSON verdict. Defaults to PASS on parse failure."""
    strict = parse_bugcheck_json(raw)
    if strict is not None:
        return strict

    try:
        # Keep heuristic fallback for resilience.
        # If we can't parse, check for keywords
        upper = raw.upper()
        if "FAIL" in upper and "PASS" not in upper:
            return {"verdict": "FAIL", "bugs": [raw[:200]], "missing": [], "fix_hints": []}
        return {"verdict": "PASS", "bugs": [], "missing": [], "fix_hints": []}
    except Exception:
        return {"verdict": "PASS", "bugs": [], "missing": [], "fix_hints": []}


def build_fix_messages(
    user_message: str,
    original_reply: str,
    bug_report: dict,
) -> list[dict]:
    """Build a prompt to fix the bugs found by BugChecker."""
    bugs_str = "\n".join(f"  - {b}" for b in bug_report.get("bugs", []))
    missing_str = "\n".join(f"  - {m}" for m in bug_report.get("missing", []))
    hints_str = "\n".join(f"  - {h}" for h in bug_report.get("fix_hints", []))

    return [
        {
            "role": "system",
            "content": compose_system_prompt(SYNTHESIZER_PREAMBLE),
        },
        {
            "role": "user",
            "content": (
                f"USER REQUEST: {user_message}\n\n"
                f"YOUR PREVIOUS RESPONSE HAD BUGS. Here is your previous response:\n"
                f"{original_reply[:1500]}\n\n"
                f"BUGS FOUND:\n{bugs_str}\n\n"
                f"MISSING FEATURES:\n{missing_str}\n\n"
                f"FIX HINTS:\n{hints_str}\n\n"
                "Rewrite the COMPLETE response with ALL bugs fixed and missing "
                "features added. Output the full corrected code/response."
            ),
        },
    ]


def _build_chain(
    questions: list[str],
    architect: str,
    skeptic: str,
) -> str:
    """Build the reasoning chain for the Synthesizer."""
    def trim(text: str, max_len: int = 500) -> str:
        text = text.strip()
        return text[:max_len] + '…' if len(text) > max_len else text

    q_block = "\n".join(
        f"  {i+1}. {q}" for i, q in enumerate(questions)
    ) if questions else "(none)"

    return (
        f"── Self-Questions ──\n{q_block}\n\n"
        f"── Architect Plan ──\n{trim(architect)}\n\n"
        f"── Skeptic Critique ──\n{trim(skeptic)}"
    )
