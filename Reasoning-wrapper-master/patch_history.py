import re
with open("app.py", "r") as f: content = f.read()

def _repl(m):
    return """def _history_to_text(history: list[dict], max_chars: int = 6000) -> str:
    lines = []
    total = 0
    # Keep newest first for max length, then reverse at end
    for msg in reversed(history):
        role = (msg.get("role") or "user").upper()
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        block = f"{role}: {content}\\n"
        if total + len(block) > max_chars:
            break
        lines.append(block)
        total += len(block)
    
    return "\\n".join(reversed(lines)) if lines else "(no prior conversation)"
"""

content = re.sub(
    r'def _history_to_text\(history: list\[dict\], max_chars: int = 6000\) -> str:(.*?)(?=def _available_workshop_files)',
    _repl,
    content,
    flags=re.DOTALL
)

with open("app.py", "w") as f: f.write(content)
