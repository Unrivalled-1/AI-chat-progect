import re

with open('templates/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

old_input = '<input id="agent-chat-input" type="text" placeholder="Command this agent..." style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);" />'
new_input = '<textarea id="agent-chat-input" placeholder="Command this agent..." rows="2" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-family:inherit;resize:none;min-height:50px;"></textarea>'

new_content = content.replace(old_input, new_input)
with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(new_content)

print(content == new_content)
