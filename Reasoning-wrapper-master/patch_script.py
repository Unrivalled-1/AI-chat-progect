import re

with open("static/js/main.js", "r") as f:
    content = f.read()

# 1. Add formatChatText helper
helper = """
  function formatChatText(text) {
    if (!text) return '';
    let escaped = esc(text);
    return escaped.replace(/```([\\w-]*)\\n([\\s\\S]*?)```/g, (match, lang, code) => {
      const hd = lang ? `<div style="background:rgba(100,116,139,0.15); padding:3px 8px; font-size:0.65rem; border-bottom:1px solid var(--border); color:var(--primary); font-family:monospace;">${lang}</div>` : '';
      return `<div style="margin:8px 0; border:1px solid var(--border); border-radius:6px; background:rgba(0,0,0,0.5); overflow:hidden; text-align:left;">${hd}<pre style="margin:0; padding:8px; overflow-x:auto; font-size:0.7rem; font-family:monospace; line-height:1.4;"><code style="white-space:pre;">${code}</code></pre></div>`;
    });
  }

"""

if "function formatChatText" not in content:
    content = content.replace("function esc(s)", helper + "  function esc(s)")

# 2. Modify renderAgentChatThread signature and logic
old_thread = """  function renderAgentChatThread(targetEl, messages) {"""
new_thread = """  function renderAgentChatThread(targetEl, messages, showTraces = true) {"""
content = content.replace(old_thread, new_thread)

old_trace_cond = """      if (m.role === 'assistant' && Array.isArray(m.traces) && m.traces.length > 0) {"""
new_trace_cond = """      if (showTraces && m.role === 'assistant' && Array.isArray(m.traces) && m.traces.length > 0) {"""
content = content.replace(old_trace_cond, new_trace_cond)

old_content_render = """                      `<div style="white-space:pre-wrap;font-size:.76rem;">${esc(m.content || '')}</div>`;"""
new_content_render = """                      `<div style="white-space:pre-wrap;font-size:.76rem;">${formatChatText(m.content || '')}</div>`;"""
content = content.replace(old_content_render, new_content_render)

# 3. Modify renderAgentChatPreview to pass false
old_preview_call = """    renderAgentChatThread(agentChatPreviewMessages, summary.messages || []);"""
new_preview_call = """    renderAgentChatThread(agentChatPreviewMessages, summary.messages || [], false);"""
content = content.replace(old_preview_call, new_preview_call)

# 4. Modify renderMissionAgentTiles snippet rendering
old_tile_render = """          `<div style="font-size:.66rem;white-space:pre-wrap;flex-grow:1;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:7px;background:var(--bg);">${esc(lastReplySnippet)}</div>` +"""
new_tile_render = """          `<div style="font-size:.66rem;white-space:pre-wrap;flex-grow:1;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:7px;background:var(--bg);">${formatChatText(lastReplySnippet)}</div>` +"""
content = content.replace(old_tile_render, new_tile_render)

with open("static/js/main.js", "w") as f:
    f.write(content)

print("Patched script.")
