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
        results = list(ddgs.text("best phones", max_results=3))
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
proc = subprocess.run(["python3", "-W", "ignore", "-c", script], capture_output=True, text=True, timeout=10)
print("STDOUT:", proc.stdout)
print("STDERR:", proc.stderr)
try:
    print("JSON:", json.loads(proc.stdout))
except Exception as e:
    print("JSON Error:", e)
