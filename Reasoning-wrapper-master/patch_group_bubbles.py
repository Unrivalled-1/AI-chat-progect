import re
with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Make Group Chat window a flex column:
old_gc_style = r"""<div class="gc-messages" style="flex:1;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:10px;background:var\(--bg\);"></div>"""
new_gc_style = r"""<div class="gc-messages" style="flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px;background:var(--bg);"></div>"""
html = re.sub(old_gc_style, new_gc_style, html)

# Group Chat JS message appending
old_gc_js = r"""const wrap = document.createElement\('div'\);
      wrap.style.padding = '8px';
      wrap.style.borderRadius = '6px';
      wrap.style.border = '1px solid var\(--border\)';
      if \(m.role==='user'\) \{
        wrap.style.background = 'var\(--msg-user\)';
        wrap.style.alignSelf = 'flex-end';
      \} else \{
        wrap.style.background = 'var\(--bg\)';
        wrap.style.alignSelf = 'flex-start';
      \}"""

new_gc_js = r"""const wrap = document.createElement('div');
      wrap.className = m.role === 'user' ? 'msg user' : 'msg assistant';"""

html = re.sub(old_gc_js, new_gc_js, html)

# Also fix the inner content layout for group chat
old_gc_inner = r"""wrap.innerHTML = `<div style="font-size:0\.7rem;font-weight:600;margin-bottom:4px;color:var\(--accent\);">
        \$\{esc\(m.agent_id \|\| m.role\)\}
      </div>
      <div style="font-size:0\.85rem;white-space:pre-wrap;">\$\{esc\(m.content\)\}</div>`;"""

new_gc_inner = r"""wrap.innerHTML = `<div class="role">${esc(m.agent_id || m.role)}</div>
      <div class="msg-text" style="white-space:pre-wrap;">${esc(m.content)}</div>`;"""
html = re.sub(old_gc_inner, new_gc_inner, html)

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
