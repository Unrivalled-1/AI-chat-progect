"""
classifier.py — The Classifier Agent

First agent in the pipeline. Reads the raw user message and outputs:
  classification  — NEW_REQUEST | ITERATION | RETRY | SUCCESS | CLARIFICATION
  problem_type    — code_gen | debug | refactor | explain | architecture |
                    ui | creative | math | conversation
  complexity      — simple | medium | complex
  tags            — 2-5 lowercase technical keywords
  summary         — one-line description of the request
  intent_detail   — what specific outcome the user expects

Downstream agents (Introspector, Architect, Skeptic, Historian) all receive
these fields so they can tailor their reasoning to the exact task type.
"""

import json
import logging

from .constitution import CLASSIFIER_PREAMBLE, compose_system_prompt

logger = logging.getLogger("vibe.classifier")


_VALID_CLASSIFICATIONS = {"NEW_REQUEST", "ITERATION", "RETRY", "SUCCESS", "CLARIFICATION"}

_VALID_PROBLEM_TYPES = {
    "code_gen", "debug", "refactor", "explain",
    "architecture", "ui", "creative", "math", "conversation",
}

_VALID_COMPLEXITY = {"simple", "medium", "complex"}



def _infer_problem_type(text: str, tags: list[str]) -> str:
    lower_text = text.lower()
    if any(k in lower_text for k in ["error", "bug", "fix", "crash", "exception"]):
        return "debug"
    if any(k in lower_text for k in ["create", "generate", "write", "build", "implement"]):
        return "code_gen"
    if any(k in lower_text for k in ["refactor", "rewrite", "clean up", "optimize"]):
        return "refactor"
    if any(k in lower_text for k in ["ui", "css", "html", "frontend"]):
        return "ui"
    if any(k in lower_text for k in ["explain", "how", "why", "what is"]):
        return "explain"
    if "architecture" in lower_text or "system" in lower_text:
        return "architecture"
    return "conversation"

def _strip_fences(raw: str) -> str:

    cleaned = (raw or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("```", 1)[0]
    return cleaned.strip()


def parse_classification_json(raw: str) -> dict | None:
    """Strict parser that returns None when payload is not valid classifier JSON."""
    cleaned = _strip_fences(raw)
    try:
        data = json.loads(cleaned)
    except (json.JSONDecodeError, TypeError):
        return None

    if not isinstance(data, dict):
        return None

    classification = str(data.get("classification", "")).upper()
    if classification not in _VALID_CLASSIFICATIONS:
        return None

    tags_raw = data.get("tags", [])
    tags = [str(t).lower() for t in tags_raw if str(t).strip()][:5] if isinstance(tags_raw, list) else []
    if not tags:
        tags = _extract_fallback_tags(cleaned)

    problem_type = str(data.get("problem_type", "")).lower()
    if problem_type not in _VALID_PROBLEM_TYPES:
        problem_type = _infer_problem_type(cleaned, tags)

    complexity = str(data.get("complexity", "")).lower()
    if complexity not in _VALID_COMPLEXITY:
        complexity = "medium"

    return {
        "classification": classification,
        "problem_type": problem_type,
        "complexity": complexity,
        "tags": tags,
        "summary": str(data.get("summary", user_message_fallback(cleaned))),
        "intent_detail": str(data.get("intent_detail", "")),
        "needs_web_search": bool(data.get("needs_web_search", False)),
    }


def is_valid_classification_json(raw: str) -> bool:
    return parse_classification_json(raw) is not None


def build_classifier_messages(user_message: str) -> list[dict]:
    """Build the message list for the classifier LLM call."""
    import re
    clean_msg = user_message
    clean_msg = re.sub(r'\[AGENT_PROFILE\].*?\[/AGENT_PROFILE\]', '', clean_msg, flags=re.DOTALL)
    clean_msg = re.sub(r'\[PROJECT_INFO_FILES\].*?\[/PROJECT_INFO_FILES\]', '', clean_msg, flags=re.DOTALL)
    clean_msg = re.sub(r'\[SYSTEM:[^\]]*\].*?\[/SYSTEM:[^\]]*\]', '', clean_msg, flags=re.DOTALL)
    clean_msg = re.sub(r'\[SYSTEM CONTEXT\].*', '', clean_msg, flags=re.DOTALL)
    clean_msg = clean_msg.strip()
    if not clean_msg:
        clean_msg = user_message[:500] # fallback

    return [
        {
            "role": "system",
            "content": compose_system_prompt(CLASSIFIER_PREAMBLE),
        },
        {
            "role": "user",
            "content": clean_msg,
        },
    ]


def parse_classification(raw: str) -> dict:
    """
    Parse the classifier's JSON response.
    Returns a dict with keys: classification, tags, summary.
    Falls back to NEW_REQUEST if parsing fails.
    """
    parsed = parse_classification_json(raw)
    if parsed is not None:
        return parsed

    cleaned = _strip_fences(raw)

    try:
        # Keep fallback behavior for resilience.
        data = json.loads(cleaned)
        classification = str(data.get("classification", "NEW_REQUEST")).upper()
        if classification not in _VALID_CLASSIFICATIONS:
            classification = "NEW_REQUEST"
        tags = [str(t).lower() for t in data.get("tags", [])]
        if not tags:
            tags = _extract_fallback_tags(cleaned)
        problem_type = str(data.get("problem_type", "")).lower()
        if problem_type not in _VALID_PROBLEM_TYPES:
            problem_type = _infer_problem_type(cleaned, tags)
        complexity = str(data.get("complexity", "medium")).lower()
        if complexity not in _VALID_COMPLEXITY:
            complexity = "medium"
        return {
            "classification": classification,
            "problem_type": problem_type,
            "complexity": complexity,
            "tags": tags,
            "summary": data.get("summary", user_message_fallback(cleaned)),
            "intent_detail": data.get("intent_detail", ""),
            "needs_web_search": bool(data.get("needs_web_search", False)),
        }
    except (json.JSONDecodeError, AttributeError) as exc:
        logger.warning("Classifier parse failed: %s — raw: %s", exc, raw[:200])
        tags = _extract_fallback_tags(raw)
        return {
            "classification": "NEW_REQUEST",
            "problem_type": _infer_problem_type(raw, tags),
            "complexity": "medium",
            "tags": tags,
            "summary": raw[:120],
            "needs_web_search": False,
        }


def user_message_fallback(text: str) -> str:
    return text[:120] if len(text) > 120 else text


# Common keyword → tag mapping for fallback extraction
_TAG_KEYWORDS = {
    "async": "async", "await": "async", "concurrency": "concurrency",
    "state": "state", "variable": "state",
    "ui": "ui", "frontend": "frontend", "html": "frontend", "css": "frontend",
    "api": "api", "endpoint": "api", "route": "api", "rest": "api",
    "database": "database", "sql": "database", "query": "database",
    "security": "security", "auth": "security", "token": "security",
    "error": "error-handling", "exception": "error-handling", "try": "error-handling",
    "test": "testing", "unittest": "testing", "pytest": "testing",
    "function": "architecture", "class": "architecture", "module": "architecture",
    "performance": "performance", "speed": "performance", "slow": "performance",
    "file": "io", "read": "io", "write": "io", "path": "io",
    "string": "strings", "text": "strings", "parse": "strings",
    "list": "data-structures", "dict": "data-structures", "array": "data-structures",
    "python": "python", "javascript": "javascript", "js": "javascript",
}


def _extract_fallback_tags(text: str) -> list[str]:
    """Extract tags from raw text by keyword matching when JSON parsing fails."""
    words = set(text.lower().split())
    tags = set()
    for keyword, tag in _TAG_KEYWORDS.items():
        if keyword in words:
            tags.add(tag)
    return list(tags)[:5] if tags else ["general"]
