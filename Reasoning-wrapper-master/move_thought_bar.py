import re

def update_html():
    with open('templates/index.html', 'r') as f:
        html = f.read()

    # 1. Remove #active-agents-btn
    btn_regex = r'<button id="active-agents-btn" .*?</button>\n'
    html = re.sub(btn_regex, '', html)

    # 2. Remove active-agents-modal
    modal_regex = r'<div id="active-agents-modal" style=".*?</div>\n    </div>\n  </div>'
    html = re.sub(modal_regex, '', html, flags=re.DOTALL)

    # 3. Modify thinking-bar CSS
    css_old = r"""    #thinking-bar {
      font-size: 0.68rem; color: var(--text-muted); text-align: center; padding: 6px;
      background: rgba(255,255,255,0.015); min-height: 28px; flex-shrink: 0;
      border-bottom: 1px solid var(--glass-border);
      transition: opacity 0.5s;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      backdrop-filter: blur(16px);
    }"""
    css_new = r"""    #thinking-bar {
      font-size: 0.72rem; color: var(--text-muted); text-align: center; padding: 4px 12px;
      background: var(--bg-deep); border-radius: 12px; flex-shrink: 1; flex-grow: 1;
      border: 1px solid var(--glass-border);
      transition: opacity 0.5s, max-width 0.3s;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      margin: 0 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      max-width: 400px;
    }
    #thinking-bar:empty { opacity: 0; pointer-events: none; max-width: 0; padding: 0; border: none; margin: 0; }"""
    html = html.replace(css_old, css_new)

    # 4. Move <div id="thinking-bar"></div>
    div_old = r'    <div id="chat-pane">\n      <div id="thinking-bar"></div>'
    html = html.replace(div_old, '    <div id="chat-pane">')

    header_insert = r'<button id="mission-btn" class="hdr-btn">🛰 Mission Hub</button>'
    header_new = r'<button id="mission-btn" class="hdr-btn">🛰 Mission Hub</button>\n    <div id="thinking-bar"></div>'
    html = html.replace(header_insert, header_new)

    with open('templates/index.html', 'w') as f:
        f.write(html)

if __name__ == '__main__':
    update_html()
