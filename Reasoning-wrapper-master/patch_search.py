import re
with open("app.py", "r") as f: content = f.read()

def _repl(m):
    return """def _should_auto_search(user_msg: str) -> bool:
    text = (user_msg or "").strip().lower()
    if not text:
        return False
    if "http://" in text or "https://" in text:
        return False

    triggers = (
        "latest", "current", "today", "news", "update", "price", "weather",
        "who is", "what is", "when did", "where is", "according to", "source",
        "search for", "look up", "release date", "recent", "find", "how to", "tell me about", "explain"
    )
    if any(t in text for t in triggers):
        return True
    
    # Trigger on questions of reasonable length
    if "?" in text and len(text.split()) >= 4:
        return True
        
    # Trigger on commands asking to look things up
    if "look up" in text or "search" in text:
        return True
        
    return False

"""

content = re.sub(
    r'def _should_auto_search\(user_msg: str\) -> bool:(.*?)def _duckduckgo_search',
    _repl + "def _duckduckgo_search",
    content,
    flags=re.DOTALL
)

with open("app.py", "w") as f: f.write(content)
