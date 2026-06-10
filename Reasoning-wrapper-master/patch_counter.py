import re

with open("templates/index.html", "r") as f:
    text = f.read()

# Make it mobile friendly by adding user-scalable=no 
text = text.replace('content="width=device-width, initial-scale=1.0"', 'content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"')

# Add counter to top bar
old_center = """    <div class="header-center">
      <button id="up-level-btn" class="hdr-btn" type="button" title="Go up one level" aria-label="Up one level">
        <span class="up-arrow">↑</span>
        <span class="up-label">Up</span>
      </button>
    </div>"""

new_center = """    <div class="header-center">
      <button id="up-level-btn" class="hdr-btn" type="button" title="Go up one level" aria-label="Up one level">
        <span class="up-arrow">↑</span>
        <span class="up-label">Up</span>
      </button>
      <span id="update-counter" style="margin-left:8px;font-size:0.75rem;color:var(--primary);font-weight:600;padding:2px 8px;border:1px solid var(--border);border-radius:12px;background:var(--panel-bg);">Updates: 0</span>
    </div>"""

text = text.replace(old_center, new_center)

with open("templates/index.html", "w") as f:
    f.write(text)

