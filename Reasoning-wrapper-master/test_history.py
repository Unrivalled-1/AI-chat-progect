import json

MAX_CONVERSATION_HISTORY_CHARS = 100000

def _normalize_history(history, user_msg: str) -> list[dict]:
    if not isinstance(history, list):
        history = []

    kept_reversed = []
    total_chars = 0
    for item in reversed(history):
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        if role not in {"user", "assistant"}:
            continue
        content = str(item.get("content") or "").strip()
        if not content:
            continue
        content = content[:20000]
        if total_chars + len(content) > MAX_CONVERSATION_HISTORY_CHARS:
            break
        total_chars += len(content)
        kept_reversed.append({"role": role, "content": content})

    normalized = list(reversed(kept_reversed))

    if normalized and normalized[-1].get("role") == "user":
        normalized[-1]["content"] = user_msg[:20000]
    else:
        normalized.append({"role": "user", "content": user_msg[:20000]})

    return normalized

history = [
    {"role": "user", "content": "hi"},
    {"role": "user", "content": "hello msg\n\n[FILES]"}
]
out_h = _normalize_history(history, "hello msg\n\n[FILES]")
print(json.dumps(out_h, indent=2))
