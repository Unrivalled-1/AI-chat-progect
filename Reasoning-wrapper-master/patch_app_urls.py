import re
with open("app.py", "r") as f:
    text = f.read()

old_code = """    web_urls = _normalize_web_urls(data.get("web_urls"))
    web_auto_search = bool(data.get("web_auto_search", True))
    mode_config = _sanitize_mode_config(data.get("mode_config") or {})"""

new_code = """    web_urls = _normalize_web_urls(data.get("web_urls"))
    web_auto_search = bool(data.get("web_auto_search", True))
    mode_config = _sanitize_mode_config(data.get("mode_config") or {})
    import json
    try:
        config_str = json.dumps(mode_config)
        import re
        found_urls = re.findall(r"(https?://[^\s\\\"\\'\\\\>]+)", config_str)
        for u in found_urls:
            u = u.strip()
            if u not in web_urls and len(web_urls) < 10:  # MAX_WEB_URLS
                web_urls.append(u)
    except Exception:
        pass"""

print(text.replace(old_code, new_code) != text)
with open("app.py", "w") as f:
    f.write(text.replace(old_code, new_code))
