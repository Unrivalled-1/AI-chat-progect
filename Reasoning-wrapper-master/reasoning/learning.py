"""
learning.py — The Evolutionary Learning Loop

On SUCCESS  → Scribe updates manifesto, heuristic XP goes UP.
On FAILURE  → Failed snippet logged, heuristic XP goes DOWN.
"""

import logging

from .constitution import SCRIBE_PREAMBLE, compose_system_prompt
from . import memory

logger = logging.getLogger("vibe.learning")

XP_REWARD = 10   # XP gained per heuristic on success
XP_PENALTY = -8  # XP lost per heuristic on failure


# ── Success path ─────────────────────────────────────────────────────────────

def build_scribe_messages(conversation_summary: str) -> list[dict]:
    """Build prompt for the Scribe to update the manifesto."""
    return [
        {
            "role": "system",
            "content": compose_system_prompt(SCRIBE_PREAMBLE),
        },
        {
            "role": "user",
            "content": (
                "The following task was completed successfully.\n"
                "Write a short manifesto entry describing what was accomplished.\n\n"
                f"{conversation_summary}"
            ),
        },
    ]


def on_success(scribe_text: str, heuristic_ids: list[str]) -> None:
    """Called when the user confirms success."""
    # Update manifesto
    memory.append_to_manifesto(scribe_text)
    logger.info("Manifesto updated with: %s", scribe_text[:80])

    # Reward heuristics
    if heuristic_ids:
        memory.adjust_xp(heuristic_ids, XP_REWARD)
        logger.info("XP +%d for heuristics: %s", XP_REWARD, heuristic_ids)


# ── Failure path ─────────────────────────────────────────────────────────────

def on_failure(summary: str, snippet: str, tags: list[str],
               heuristic_ids: list[str]) -> None:
    """Called when the user reports a failure or the system detects one."""
    # Log the failure
    memory.log_failure(summary, snippet, tags, heuristic_ids)
    logger.info("Failure logged: %s", summary[:80])

    # Penalise heuristics that failed to catch the problem
    if heuristic_ids:
        memory.adjust_xp(heuristic_ids, XP_PENALTY)
        logger.info("XP %d for heuristics: %s", XP_PENALTY, heuristic_ids)
