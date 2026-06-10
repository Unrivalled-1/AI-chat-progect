from app import _build_web_context
user_msg = "Please summarize."
urls = ["https://news.google.com/"]
auto_search = False
context, sources = _build_web_context(user_msg, web_urls=urls, auto_search=auto_search)
print("Context length:", len(context))
print("Sources:", sources)
