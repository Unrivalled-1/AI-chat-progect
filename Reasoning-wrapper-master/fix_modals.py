import re
import os

html_path = "templates/index.html"
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

# Fix the stray `>` left after my previous script
html = re.sub(r'(\{% include \'partials/(.*?)\.html\' %\})>', r'\1', html)

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)

for modal in os.listdir("templates/partials"):
    if not modal.endswith(".html"): continue
    p = os.path.join("templates/partials", modal)
    with open(p, "r", encoding="utf-8") as f:
        m_html = f.read()
    if not m_html.endswith(">") and m_html.endswith("</div"):
        m_html += ">"
        with open(p, "w", encoding="utf-8") as f:
            f.write(m_html)

print("Fixed modals")
