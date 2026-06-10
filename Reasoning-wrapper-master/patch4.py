import re
with open("app.py", "r") as f:
    text = f.read()

new_func = """def _duckduckgo_search(query: str, max_results: int = 3) -> list[dict]:
    q = (query or "").strip()
    if not q:
        return []
    try:
        import subprocess
        import json
        
        script = f'''
import json
import sys
import warnings
warnings.filterwarnings("ignore")
try:
    from duckduckgo_search import DDGS
    with DDGS() as ddgs:
        results = []
        try:
            results = list(ddgs.text(sys.argv[1], max_results={max_results}))
        except Exception:
            pass
        if not results:
            try:
                results = list(ddgs.news(sys.argv[1], max_results={max_results}))
            except Exception:
                pass
        out = []
        for r in results:
            out.append({{
                "title": r.get("title", ""),
                "url": r.get("href", "") or r.get("url", ""),
                "snippet": r.get("body", "") or r.get("snippet", "")
            }})
        print(json.dumps(out))
except Exception as e:
    print(json.dumps([]))
'''
        proc = subprocess.run(["python3", "-W", "ignore", "-c", script, q], capture_output=True, text=True, timeout=12)
        try:
            return json.loads(proc.stdout)
        except Exception:
            return []
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("DDGS subprocess error: %s", e)
        return []"""

pattern = r"def _duckduckgo_search\(query: str, max_results: int = 3\) -> list\[dict\]:.*?return json\.loads\(proc\.stdout\).*?except Exception:\n\s*return \[\]\n\s*except Exception as e:\n\s*import logging\n\s*logging\.getLogger\(__name__\)\.warning\(\"DDGS subprocess error: %s\", e\)\n\s*return \[\]"
new_text = re.sub(pattern, new_func, text, flags=re.DOTALL)

if text != new_text:
    with open("app.py", "w") as f:
        f.write(new_text)
    print("Patched!")
else:
    print("Pattern not found.")
