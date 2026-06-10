"""
strategists.py — The Strategy Fork (Architect · Skeptic · Historian)

Each agent receives the FULL chain of outputs from all prior agents
so the logic tree genuinely builds on itself.
"""

from .constitution import (
    ARCHITECT_PREAMBLE,
    SKEPTIC_PREAMBLE,
    HISTORIAN_PREAMBLE,
    compose_system_prompt,
)


FAST_REASONER_PREAMBLE = (
    "You are PlannerCritic, a merged Architect + Skeptic agent. "
    "Produce a compact but high-quality plan and self-critique in one pass. "
    "Be concrete, prioritize correctness, and include edge cases."
)


def build_architect_messages(
    context_slice: str,
    generated_questions: list[str] | None = None,
    recent_failures: list[dict] | None = None,
) -> list[dict]:
    """Architect receives context + Introspector's questions."""
    q_block = ""
    if generated_questions:
        q_block = (
            "\n\n## INTROSPECTOR'S SELF-QUESTIONS (address these in your plan)\n"
            + "\n".join(f"  {i+1}. {q}" for i, q in enumerate(generated_questions))
        )

    failure_block = ""
    if recent_failures:
        compact = []
        for f in recent_failures[-5:]:
            ts = (f.get("timestamp", "") or "")[:10]
            summary = (f.get("summary", "") or "").strip()[:220]
            if summary:
                compact.append(f"  - [{ts}] {summary}")
        if compact:
            failure_block = (
                "\n\n## MEMORY: RECENT FAILURES TO AVOID\n"
                + "\n".join(compact)
                + "\nUse these to proactively avoid repeating known bad patterns."
            )

    return [
        {
            "role": "system",
            "content": compose_system_prompt(ARCHITECT_PREAMBLE),
        },
        {
            "role": "user",
            "content": (
                "Produce a short numbered plan for the following task.\n"
                "Address the Introspector's questions within your plan.\n\n"
                f"{context_slice}"
                f"{q_block}"
                f"{failure_block}"
            ),
        },
    ]


def build_skeptic_messages(
    context_slice: str,
    architect_plan: str,
    generated_questions: list[str] | None = None,
) -> list[dict]:
    """Skeptic receives context + Introspector questions + Architect's full plan."""
    question_block = ""
    if generated_questions:
        question_block = (
            "\n\n## INTROSPECTOR'S SELF-QUESTIONS\n"
            + "\n".join(f"- {q}" for q in generated_questions)
        )
    return [
        {
            "role": "system",
            "content": compose_system_prompt(SKEPTIC_PREAMBLE),
        },
        {
            "role": "user",
            "content": (
                "## Context\n"
                f"{context_slice}\n\n"
                "## Architect's Plan\n"
                f"{architect_plan}\n"
                f"{question_block}\n\n"
                "Review the Architect's plan against the context and questions. "
                "List any flaws, missing edge cases, or risks. "
                "Suggest a concrete fix for each flaw. Be brief."
            ),
        },
    ]


def build_historian_messages(
    context_slice: str,
    architect_plan: str,
    skeptic_critique: str,
) -> list[dict]:
    """Historian receives context + Architect plan + Skeptic critique."""
    return [
        {
            "role": "system",
            "content": compose_system_prompt(HISTORIAN_PREAMBLE),
        },
        {
            "role": "user",
            "content": (
                "## Context\n"
                f"{context_slice}\n\n"
                "## Architect's Plan\n"
                f"{architect_plan}\n\n"
                "## Skeptic's Critique\n"
                f"{skeptic_critique}\n\n"
                "Cross-reference the plan AND the Skeptic's concerns against past failures. "
                "Flag anything that resembles a known failure pattern and suggest how to avoid it."
            ),
        },
    ]


def build_fast_reasoner_messages(
    context_slice: str,
    user_message: str,
    generated_questions: list[str] | None = None,
) -> list[dict]:
    """Merged Architect+Skeptic prompt for fast mode (single API call)."""
    q_block = ""
    if generated_questions:
        q_block = (
            "\n\n## SELF-QUESTIONS\n"
            + "\n".join(f"- {q}" for q in generated_questions[:6])
        )

    return [
        {
            "role": "system",
            "content": compose_system_prompt(FAST_REASONER_PREAMBLE),
        },
        {
            "role": "user",
            "content": (
                "Create a fast reasoning brief for this task.\n\n"
                "Output format (strict plain text):\n"
                "PLAN:\n"
                "1) ...\n"
                "2) ...\n"
                "3) ...\n\n"
                "RISKS:\n"
                "- ...\n"
                "- ...\n\n"
                "FIXES:\n"
                "- ...\n"
                "- ...\n\n"
                f"## USER REQUEST\n{user_message}\n\n"
                f"## CONTEXT\n{context_slice}"
                f"{q_block}\n"
            ),
        },
    ]

def build_architect_v2_messages(
    context_slice: str,
    architect_plan_v1: str,
    skeptic_critique: str,
    generated_questions: list[str] | None = None,
) -> list[dict]:
    """Architect receives its V1 plan and Skeptic's critique to produce a V2 plan."""
    q_block = ""
    if generated_questions:
        q_block = (
            "\n\n## INTROSPECTOR'S SELF-QUESTIONS\n"
            + "\n".join(f"- {q}" for q in generated_questions)
        )
    return [
        {
            "role": "system",
            "content": compose_system_prompt(ARCHITECT_PREAMBLE),
        },
        {
            "role": "user",
            "content": (
                "## Context\n"
                f"{context_slice}\n"
                f"{q_block}\n\n"
                "## Your Previous Plan (V1)\n"
                f"{architect_plan_v1}\n\n"
                "## Skeptic's Critique\n"
                f"{skeptic_critique}\n\n"
                "Revise your plan to address the Skeptic's listed flaws and risks. "
                "Output ONLY your final, corrected V2 numbered plan."
            ),
        },
    ]

