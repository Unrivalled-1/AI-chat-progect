import re

with open("app.py", "r") as f:
    content = f.read()

old_func = """def _duckduckgo_search(query: str, max_results: int = 3) -> list[dict]:
    q = (query or "").strip()
    if not q:
        return []
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(q, max_results=max_results))
            out = []
            for r in results:
                out.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", "")
                })
            return out
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("DDGS error: %s", e)
        return []"""

new_func = """def _duckduckgo_search(query: str, max_results: int = 3) -> list[dict]:
    q = (query or "").strip()
    if not q:
        return []
    try:
        import subprocess
        import json
        import shlex
        
        script = f'''
import json
import sys
try:
    from duckduckgo_search import DDGS
    with DDGS() as ddgs:
        results = list(ddgs.text(sys.argv[1], max_results={max_results}))
        out = []
        for r in results:
            out.append({{
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": r.get("body", "")
            }})
        print(json.dumps(out))
except Exception as e:
    print(json.dumps([]))
'''
        proc = subprocess.run(["python3", "-c", script, q], capture_output=True, text=True, timeout=10)
        return json.loads(proc.stdout)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("DDGS error: %s", e)
        return []"""

if old_func in content:
    content = content.replace(old_func, new_func)
    with open("app.py", "w") as f:
        f.write(content)
    print("Patched app.py with subprocess DDGS!")
else:
    print("Could not find old_func in app.py!")
