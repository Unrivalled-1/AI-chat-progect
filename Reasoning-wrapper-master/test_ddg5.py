import json
import sys
import warnings
warnings.filterwarnings("ignore")
try:
    from duckduckgo_search import DDGS
    with DDGS() as ddgs:
        results = []
        try:
            results = list(ddgs.text("best phones", max_results=3))
        except Exception:
            pass
        if not results:
            try:
                results = list(ddgs.news("best phones", max_results=3))
            except Exception as e:
                print("NEWS Exception:", e)
        out = []
        for r in results:
            out.append({
                "title": r.get("title", ""),
                "url": r.get("href", "") or r.get("url", ""),
                "snippet": r.get("body", "") or r.get("snippet", "")
            })
        print(json.dumps(out))
except Exception as e:
    print("FATAL Exception:", e)
