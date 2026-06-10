import re
with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Update Agent Chat rendering logic to use standard message bubbles
old_agent_msg = r"""msgs.forEach\(m => \{
      const row = document.createElement\('div'\);
      row.style.marginBottom = '8px';
      row.style.padding = '8px';
      row.style.borderRadius = '8px';
      row.style.border = '1px solid var\(--border\)';
      row.style.background = m.role === 'user' \? 'var\(--msg-user\)' : 'var\(--msg-assistant\)';"""

new_agent_msg = r"""msgs.forEach(m => {
      const row = document.createElement('div');
      row.className = m.role === 'user' ? 'msg user' : 'msg assistant';
      row.style.marginBottom = '8px';"""

html = re.sub(old_agent_msg, new_agent_msg, html)

# Also fix the inner HTML assignment for Agent Chat so it uses .msg-text properly
# find the HTML generation for the row interior:
old_inner_html = r"""row.innerHTML = `<div style="font-size:\.66rem;opacity:\.85;margin-bottom:4px;">\$\{esc\(\(m.role \|\| ''\).toUpperCase\(\)\)\}</div>` \+
        tracesHtml \+
        `<div style="white-space:pre-wrap;font-size:0\.8rem;">\$\{m.content \? esc\(m.content\) : '<span style="opacity:0\.5">\(Empty\)</span>'\}</div>`;"""

new_inner_html = r"""row.innerHTML = `<div class="role">${esc((m.role === 'user' ? 'You' : 'Agent'))}</div>` +
        tracesHtml +
        `<div class="msg-text" style="white-space:pre-wrap;">${m.content ? esc(m.content) : '<span style="opacity:0.5">(Empty)</span>'}</div>`;"""

html = re.sub(old_inner_html, new_inner_html, html)

# Make sure #agent-chat-messages behaves like #chat-box (column layout)
# It's an inline style right now:
old_chat_msgs_style = r"""<div id="agent-chat-messages" style="flex:1;overflow:auto;border:1px solid var\(--border\);border-radius:8px;padding:10px;background:var\(--bg\);"></div>"""
new_chat_msgs_style = r"""<div id="agent-chat-messages" style="flex:1;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:20px;background:var(--bg);display:flex;flex-direction:column;gap:12px;"></div>"""
html = re.sub(old_chat_msgs_style, new_chat_msgs_style, html)

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
