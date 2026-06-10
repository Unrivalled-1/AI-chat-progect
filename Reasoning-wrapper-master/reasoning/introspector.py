"""
introspector.py — The Self-Questioning Engine

Instead of relying solely on pre-made heuristic questions, the Introspector
GENERATES its own questions dynamically for each problem.  It looks at:

  1. Similar past thought processes that WORKED  → reuse those question patterns
  2. Similar past thought processes that FAILED  → avoid those patterns
  3. The specific nature of the current problem  → generate fresh questions

The best-performing questions are saved when they lead to success,
and marked as failed when they don't, creating a self-improving loop.
"""

import json
import logging
import re

from .constitution import (
    INTROSPECTOR_PREAMBLE,
    THOUGHT_RECORDER_PREAMBLE,
    compose_system_prompt,
)
from . import memory

logger = logging.getLogger("vibe.introspector")


def _extract_json(raw: str, expected_type: str = "array") -> str:
    """Extracts a JSON array or object from a string that might contain conversational filler."""
    pattern = r'\[.*\]' if expected_type == "array" else r'\{.*\}'
    match = re.search(pattern, raw, re.DOTALL | re.MULTILINE)
    if match:
        return match.group(0)
    return raw

def parse_introspector_json(raw: str) -> list[str] | None:
    """Strict parser that returns None when payload is not a JSON array of strings."""
    cleaned = _extract_json(raw, expected_type="array")
    try:
        questions = json.loads(cleaned)
    except (json.JSONDecodeError, TypeError):
        return None

    if not isinstance(questions, list):
        return None

    normalized = [str(q).strip() for q in questions if str(q).strip()][:5]
    if not normalized:
        return None
    return normalized


def is_valid_introspector_json(raw: str) -> bool:
    return parse_introspector_json(raw) is not None


def build_introspector_messages(
    user_message: str,
    tags: list[str],
    summary: str,
    context_slice: str = "",
) -> list[dict]:
    """
    Build the prompt for the Introspector to generate custom self-questions.
    Pulls similar past thought processes from the journal for guidance.
    """
    # Find similar past thought processes
    similar_successes = memory.find_similar_thoughts(tags, succeeded=True, n=3)
    similar_failures = memory.find_similar_thoughts(tags, succeeded=False, n=2)

    # Format past thought processes for context
    success_block = ""
    if similar_successes:
        entries = []
        for t in similar_successes:
            entries.append(
                f"  Problem type: {t.get('problem_type', '?')}\n"
                f"  Questions that worked: {json.dumps(t.get('key_questions', []))}\n"
                f"  Approach: {t.get('approach_summary', '?')}\n"
                f"  Reuse hint: {t.get('reuse_hint', '?')}"
            )
        success_block = (
            "PAST SUCCESSES (similar problems):\n" + "\n---\n".join(entries)
        )
    else:
        success_block = "PAST SUCCESSES: (none found for similar problems)"

    failure_block = ""
    if similar_failures:
        entries = []
        for t in similar_failures:
            entries.append(
                f"  Problem type: {t.get('problem_type', '?')}\n"
                f"  Questions that failed: {json.dumps(t.get('key_questions', []))}\n"
                f"  What went wrong: {t.get('pitfalls_avoided', '?')}"
            )
        failure_block = (
            "PAST FAILURES (avoid these patterns):\n" + "\n---\n".join(entries)
        )
    else:
        failure_block = "PAST FAILURES: (none recorded)"

    return [
        {
            "role": "system",
            "content": compose_system_prompt(INTROSPECTOR_PREAMBLE),
        },
        {
            "role": "user",
            "content": (
                f"USER REQUEST: {user_message}\n"
                f"SUMMARY: {summary}\n"
                f"TAGS: {', '.join(tags)}\n\n"
                f"{success_block}\n\n"
                f"{failure_block}\n\n"
                "Now generate 3-5 specific self-questions for this problem. "
                "Output ONLY a JSON array of strings."
            ),
        },
    ]


def parse_introspector_response(raw: str) -> list[str]:
    """Parse the Introspector's JSON array of questions."""
    strict = parse_introspector_json(raw)
    if strict is not None:
        return strict

    cleaned = _extract_json(raw, expected_type="array")

    try:
        questions = json.loads(cleaned)
        if isinstance(questions, list):
            return [str(q) for q in questions[:5]]
    except (json.JSONDecodeError, TypeError) as exc:
        logger.warning("Introspector parse failed: %s — raw: %s", exc, raw[:200])

    # Fallback: split by newlines and clean up
    lines = [
        line.strip().lstrip("-•*0123456789.) ").strip('"')
        for line in raw.strip().split("\n")
        if line.strip() and "?" in line
    ]
    return lines[:5] if lines else ["What is the simplest correct approach?"]


def build_thought_recorder_messages(
    user_message: str,
    generated_questions: list[str],
    architect_plan: str,
    final_reply: str,
) -> list[dict]:
    """
    Build prompt for the Thought Recorder to extract the successful
    thought process for future reuse.
    """
    return [
        {
            "role": "system",
            "content": compose_system_prompt(THOUGHT_RECORDER_PREAMBLE),
        },
        {
            "role": "user",
            "content": (
                f"ORIGINAL REQUEST: {user_message}\n\n"
                f"SELF-GENERATED QUESTIONS:\n"
                + "\n".join(f"  - {q}" for q in generated_questions)
                + f"\n\nARCHITECT'S PLAN:\n{architect_plan[:500]}\n\n"
                f"FINAL OUTPUT (excerpt):\n{final_reply[:500]}\n\n"
                "Now extract the thought process as a JSON object."
            ),
        },
    ]


def parse_thought_record(raw: str) -> dict:
    """Parse the Thought Recorder's JSON output."""
    cleaned = _extract_json(raw, expected_type="object")

    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return {
                "problem_type": str(data.get("problem_type", "general")),
                "key_questions": [
                    str(q) for q in data.get("key_questions", [])
                ][:5],
                "approach_summary": str(
                    data.get("approach_summary", "")
                )[:300],
                "pitfalls_avoided": str(
                    data.get("pitfalls_avoided", "")
                )[:200],
                "reuse_hint": str(data.get("reuse_hint", ""))[:200],
            }
    except (json.JSONDecodeError, TypeError) as exc:
        logger.warning(
            "Thought record parse failed: %s — raw: %s", exc, raw[:200]
        )

    return {
        "problem_type": "general",
        "key_questions": [],
        "approach_summary": raw[:200],
        "pitfalls_avoided": "",
        "reuse_hint": "",
    }
