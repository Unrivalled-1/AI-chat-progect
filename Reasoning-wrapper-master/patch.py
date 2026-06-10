import re

with open("app.py", "r") as f:
    text = f.read()

text = re.sub(
    r'def _should_auto_search\(user_msg: str\) -> bool:.*?return text\.endswith\("\?"\) and len\(text\.split\(\)\) >= 7',
    '''def _should_auto_search(user_msg: str) -> bool:
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
    
    if "?" in text and len(text.split()) >= 4:
        return True
        
    if "look up" in text or "search" in text:
        return True
        
    return False''',
    text,
    flags=re.DOTALL
)

with open("app.py", "w") as f:
    f.write(text)
