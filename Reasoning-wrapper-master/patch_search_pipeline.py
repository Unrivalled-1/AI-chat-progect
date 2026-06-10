import re

with open("reasoning/pipeline.py", "r") as f:
    text = f.read()

import_statement = "from .classifier import (\n    build_classifier_messages,\n    parse_classification_json,\n    is_valid_classification_json,\n    parse_classification,\n)\n"
if "from .search import duckduckgo_search, fetch_web_excerpt" not in text:
    text = text.replace(import_statement, import_statement + "from .search import duckduckgo_search, fetch_web_excerpt\n")

target_block = """        cls_result = parse_classification(cls_raw)
        result.classification = cls_result["classification"]
        result.tags = cls_result["tags"]
        elapsed = int((time.perf_counter() - t0) * 1000)
        
        result.traces.append(AgentTrace("""

new_block = """        cls_result = parse_classification(cls_raw)
        result.classification = cls_result["classification"]
        result.tags = cls_result["tags"]
        elapsed = int((time.perf_counter() - t0) * 1000)
        
        # --- Web Search Gathering (Fast Reasoning extension) ---
        search_context = ""
        if cls_result.get("needs_web_search") and reasoning_mode == "fast":
            s_t0 = time.perf_counter()
            hits = duckduckgo_search(user_message, max_results=2)
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

        result.traces.append(AgentTrace("""

if "from .search import duckduckgo_search" in text and "search_context =" not in text:
    text = text.replace(target_block, new_block)

with open("reasoning/pipeline.py", "w") as f:
    f.write(text)

print("Pipeline Search Patch Applied.")
