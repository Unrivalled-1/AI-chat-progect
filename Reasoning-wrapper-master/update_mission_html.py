import re

with open("templates/index.html", "r", encoding="utf-8") as f:
    html = f.read()

old_html = r"""      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <div id="mission-page-project-label" style="display:none;font-size:0.78rem;font-weight:700;color:var(--primary);padding:4px 8px;border:1px solid var(--primary);border-radius:999px;background:var(--primary-glow);"></div>
        <div style="font-weight:700;color:var(--thinking-step);">Mission Control Hub</div>
        <div id="mission-page-meta" style="font-size:0.72rem;color:var(--text-muted);">Projects contain agents. Agents are persistent AI workers. "Steps" are internal reasoning stages inside one response.</div>
        <button id="mission-page-close" class="hdr-btn" style="margin-left:auto;">Back to Chat</button>
      </div>"""

new_html = """      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <div id="mission-page-project-label" style="display:none;font-size:0.8rem;font-weight:700;color:var(--primary);padding:4px 10px;border:1px solid var(--primary);border-radius:999px;background:var(--primary-glow);box-shadow:0 0 10px var(--primary-glow);"></div>
        <div style="font-weight:800;font-size:1.3rem;background:linear-gradient(90deg, #00d2ff 0%, #3a7bd5 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;text-shadow:0 2px 10px rgba(0, 210, 255, 0.2);letter-spacing:0.5px;">Mission Control Hub</div>
        <div id="mission-page-meta" style="font-size:0.75rem;color:var(--text-muted);border-left:1px solid rgba(255,255,255,0.2);padding-left:12px;margin-top:4px;">Projects contain agents. Agents are persistent AI workers. "Steps" are internal reasoning stages inside one response.</div>
        <button id="mission-page-close" class="hdr-btn" style="margin-left:auto;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;transition:all 0.2s;">Back to Chat</button>
      </div>"""

html = html.replace(old_html, new_html)

with open("templates/index.html", "w", encoding="utf-8") as f:
    f.write(html)
print("Updated HTML in index.html")
