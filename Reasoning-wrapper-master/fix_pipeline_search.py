import re
with open('reasoning/pipeline.py', 'r', encoding='utf-8') as f:
    text = f.read()

import_statement = "from .search import duckduckgo_search, fetch_web_excerpt"
if import_statement not in text:
    text = text.replace(
        "from .classifier import (",
        "" + import_statement + "\nfrom .classifier import ("
    )

target = """        result.classification = cls_data["classification"]
        result.tags = cls_data["tags"]
        result.summary = cls_data["summary"]"""

new_target = """        result.classification = cls_data["classification"]
        result.tags = cls_data["tags"]
        result.summary = cls_data["summary"]
        
        # --- Web Search Gathering ---
        if cls_data.get("needs_web_search") and reasoning_mode == "fast":
            s_t0 = time.perf_counter()
            hits = duckduckgo_search(user_message, max_results=3)
            if hits:
                chunks = []
                for h in hits:
                    excerpt = fetch_web_excerpt(h["url"], max_chars=1200)
                    chunks.append(f"Title: {h['title']}\\nURL: {h['url']}\\nContent: {excerpt}\\n")
                search_context = "[AUTO_GATHERED_WEB_CONTEXT]\\n" + "\\n".join(chunks) + "\\n[/AUTO_GATHERED_WEB_CONTEXT]\\n\\n"
                
                result.traces.append(AgentTrace(
                    agent="Classifier (Search)",
                    content=f"Gathered live web context from {len(hits)} sources.",
                    input_messages=[{"role": "system", "content": "Search query: " + user_message}],
                    elapsed_ms=int((time.perf_counter() - s_t0) * 1000),
                ))
                user_message = search_context + user_message
"""

if '# --- Web Search Gathering ---' not in text:
    text = text.replace(target, new_target)

with open('reasoning/pipeline.py', 'w', encoding='utf-8') as f:
    f.write(text)
