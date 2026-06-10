import re
import os
import shutil

html_path = "templates/index.html"
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

# 1. Extract CSS
style_match = re.search(r'<style>(.*?)</style>', html, re.DOTALL)
if style_match:
    css_content = style_match.group(1)
    os.makedirs("static/css", exist_ok=True)
    with open("static/css/main.css", "w", encoding="utf-8") as f:
        f.write(css_content.strip())
    
    html = html.replace(style_match.group(0), '<link rel="stylesheet" href="{{ url_for(\'static\', filename=\'css/main.css\') }}" />')
    print("Extracted CSS to static/css/main.css")

# Write back
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)
print("Updated index.html")
