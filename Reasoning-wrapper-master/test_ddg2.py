from duckduckgo_search import DDGS
with DDGS() as ddgs:
    print(list(ddgs.text("best phones vs 2026", max_results=3)))
