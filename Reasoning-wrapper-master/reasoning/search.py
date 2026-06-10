import urllib.request
import urllib.error
import urllib.parse
import json
import re

def duckduckgo_search(query: str, max_results: int = 3) -> list:
    """Basic DuckDuckGo HTML search scraper that works without API keys."""
    url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(query)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    )
    results = []
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            html = response.read().decode("utf-8")
        
        snippets = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', html, re.IGNORECASE | re.DOTALL)
        urls = re.findall(r'<a class="result__url" href="([^"]+)">([^<]+)</a>', html, re.IGNORECASE)
        
        for i in range(min(max_results, len(urls))):
            raw_url = urls[i][0]
            if raw_url.startswith("//duckduckgo.com/l/?uddg="):
                raw_url = urllib.parse.unquote(raw_url.split("uddg=")[1].split("&")[0])
            title = urls[i][1].strip()
            desc = re.sub(r'<[^>]+>', '', snippets[i]).strip() if i < len(snippets) else ""
            results.append({"title": title, "url": raw_url, "description": desc})
    except Exception:
        pass
    return results

def fetch_web_excerpt(url: str, max_chars: int = 2000) -> str:
    if not url.startswith("http"):
        return ""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            html = response.read().decode("utf-8", errors="ignore")
        text = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.IGNORECASE | re.DOTALL)
        text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.IGNORECASE | re.DOTALL)
        text = re.sub(r'<[^>]+>', ' ', text)
        text = " ".join(text.split())
        return text[:max_chars]
    except Exception:
        return ""
