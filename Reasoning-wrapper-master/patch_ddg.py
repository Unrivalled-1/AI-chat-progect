import re

with open("app.py", "r") as f:
    content = f.read()

old_func = """def _duckduckgo_search(query: str, max_results: int = 3) -> list[dict]:
    q = (query or "").strip()
    if not q:
        return []
    search_url = f"https://duckduckgo.com/html/?q={quote_plus(q[:220])}"
    try:
        req = Request(search_url, headers={"User-Agent": WEB_USER_AGENT, "Accept-Encoding": "identity"})
        with urlopen(req, timeout=8) as resp:  # nosec - fixed trusted endpoint
            html_text = resp.read(300_000).decode("utf-8", errors="ignore")
    except Exception:
        return []

    anchor_re = re.compile(r'(?is)<a[^>]*class=["\']result__a["\'][^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>')
    snippet_re = re.compile(r'(?is)<a[^>]*class=["\']result__snippet["\'][^>]*>(.*?)</a>')
    snippets = [_strip_html_text(m.group(1)) for m in snippet_re.finditer(html_text)]

    results = []
    for idx, m in enumerate(anchor_re.finditer(html_text)):
        url = m.group(1).strip()
        title = _strip_html_text(m.group(2))
        snippet = snippets[idx] if idx < len(snippets) else ""
        results.append({"title": title, "url": url, "snippet": snippet})
        if len(results) >= max_results:
            break
    return results"""

new_func = """def _duckduckgo_search(query: str, max_results: int = 3) -> list[dict]:
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

content = content.replace(old_func, new_func)

with open("app.py", "w") as f:
    f.write(content)

print("Patched app.py")
