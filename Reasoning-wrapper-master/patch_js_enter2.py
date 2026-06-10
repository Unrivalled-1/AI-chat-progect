import re

with open('script.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_code = """  agentChatInput?.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    agentChatSend?.click();
  });"""

new_code = """  agentChatInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        agentChatSend?.click();
    }
  });"""

new_content = content.replace(old_code, new_code)
with open('script.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print(content == new_content)
