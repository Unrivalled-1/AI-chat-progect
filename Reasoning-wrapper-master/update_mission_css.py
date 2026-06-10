import re

with open("templates/index.html", "r", encoding="utf-8") as f:
    html = f.read()

old_css = r"""    \.mission-widget \{
      position: relative;
      border: 1px solid var\(--border\);
      border-radius: 14px;
      background: linear-gradient\(180deg, var\(--panel-bg\), rgba\(255,255,255,0\.01\)\);
      box-shadow: 0 8px 24px rgba\(0,0,0,0\.25\);
      padding: 10px;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      contain: layout paint;
      backdrop-filter: blur\(8px\);
      -webkit-backdrop-filter: blur\(8px\);
      z-index: 2;
    \}
    \.mission-widget\.dragging \{ opacity: 0\.5; \}"""

# Alternative basic regex if the above is inaccurate.
old_css_alt = r'\.mission-widget \{(.*?)\}\n    \.mission-widget\.dragging'

new_css = """.mission-widget {
      position: relative;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: linear-gradient(135deg, rgba(8, 12, 18, 0.7), rgba(20, 25, 35, 0.8));
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.1);
      padding: 10px;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      contain: layout paint;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 2;
      transition: box-shadow 0.3s ease, border-color 0.3s ease, transform 0.2s ease;
    }
    .mission-widget:hover {
      box-shadow: 0 8px 30px rgba(0, 230, 255, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.15);
      border-color: rgba(0, 230, 255, 0.4);
      transform: translateY(-2px);
    }
    .mission-widget.dragging"""

html = re.sub(old_css_alt, new_css, html, flags=re.DOTALL)

with open("templates/index.html", "w", encoding="utf-8") as f:
    f.write(html)
print("Updated CSS in index.html")
