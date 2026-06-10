import re
import os

html_path = "templates/index.html"
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

os.makedirs("templates/partials", exist_ok=True)

# Find massive divs starting with <div id="xxx-modal">
# A regex balancing braces is hard, but we can look for specific chunks.
# Alternatively, I'll extract some clear IDs.
modals_to_extract = [
    "settings-modal",
    "memory-modal",
    "projects-modal",
    "workshop-modal",
    "calendar-modal",
    "agent-chat-modal",
    "agent-chat-preview-modal",
    "agent-config-modal",
    "project-memory-modal",
    "mission-modal",
    "custom-prompt-modal"
]

def find_div(html, div_id):
    start_tag = f'<div id="{div_id}"'
    start_idx = html.find(start_tag)
    if start_idx == -1: return None, html
    
    # Simple brace counter to find closing div
    open_divs = 0
    curr = start_idx
    while curr < len(html):
        if html[curr:curr+4] == '<div':
            open_divs += 1
            curr += 4
        elif html[curr:curr+5] == '</div':
            open_divs -= 1
            curr += 5
            if open_divs == 0:
                # Found the end
                end_idx = curr + 1 # >
                # Actually, html[curr:curr+6] is '</div>'
                return html[start_idx:curr+1], html[:start_idx] + "{% include 'partials/" + div_id + ".html' %}" + html[curr+1:]
        else:
            curr += 1
    return None, html

for div_id in modals_to_extract:
    chunk, new_html = find_div(html, div_id)
    if chunk:
        html = new_html
        with open(f"templates/partials/{div_id}.html", "w", encoding="utf-8") as out:
            out.write(chunk)
            print(f"Extracted {div_id}")

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)
print("Saved HTML")
