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
            results = json.loads(proc.stdout)
        except Exception:
            results = []
            
        if not results:
            import urllib.request
            import urllib.parse
            wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={{urllib.parse.quote(q)}}&utf8=&format=json"
            req = urllib.request.Request(wiki_url, headers={{"User-Agent": "Mozilla/5.0"}})
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                for r in data.get("query", {{}}).get("search", [])[:max_results]:
                    results.append({{
                        "title": r.get("title", ""),
                        "url": f"https://en.wikipedia.org/wiki/{{urllib.parse.quote(r.get('title', '').replace(' ', '_'))}}",
                        "snippet": r.get("snippet", "").replace('<span class="searchmatch">', '').replace('</span>', '')
                    }})
        return results
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("DDGS subprocess error: %s", e)
        return []"""

pattern = r"def _duckduckgo_search\(query: str, max_results: int = 3\) -> list\[dict\]:.*?return \[\]\"\"\""
# Wait, I don't need regex, I can just replace the old new_func from patch4
text = text.replace('        try:\n            return json.loads(proc.stdout)\n        except Exception:\n            return []\n    except Exception as e:\n        import logging', '        try:\n            results = json.loads(proc.stdout)\n        except Exception:\n            results = []\n            \n        if not results:\n            import urllib.request\n            import urllib.parse\n            wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(q)}&utf8=&format=json"\n            req = urllib.request.Request(wiki_url, headers={"User-Agent": "Mozilla/5.0"})\n            with urllib.request.urlopen(req, timeout=5) as resp:\n                data = json.loads(resp.read().decode("utf-8"))\n                for r in data.get("query", {}).get("search", [])[:max_results]:\n                    results.append({\n                        "title": r.get("title", ""),\n                        "url": f"https://en.wikipedia.org/wiki/{urllib.parse.quote(r.get(\'title\', \'\').replace(\' \', \'_\'))}",\n                        "snippet": r.get("snippet", "").replace(\'<span class="searchmatch">\', \'\').replace(\'</span>\', \'\')\n                    })\n        return results\n    except Exception as e:\n        import logging')

with open("app.py", "w") as f:
    f.write(text)
print("Patched with Wikipedia fallback!")
