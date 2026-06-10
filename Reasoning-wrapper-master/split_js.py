import re
import os

html_path = "templates/index.html"
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

script_match = re.search(r'<script>(.*?)</script>', html, re.DOTALL)
if script_match and len(script_match.group(1)) > 1000: # Only large scripts
    js_content = script_match.group(1)
    os.makedirs("static/js", exist_ok=True)
    with open("static/js/main.js", "w", encoding="utf-8") as f:
        f.write(js_content.strip())
    
    html = html.replace(script_match.group(0), '<script src="{{ url_for(\'static\', filename=\'js/main.js\') }}"></script>')
    print("Extracted JS to static/js/main.js")

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)
print("Updated index.html")
