import re

with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Fullscreen Agent Chat
html = re.sub(
    r'<div id="agent-chat-modal">\s*<div class="modal-card" style="width:min\(980px,95vw\);height:min\(84vh,820px\)">',
    r'<div id="agent-chat-modal">\n    <div class="modal-card" style="width:100vw;height:100vh;max-width:none;max-height:none;border-radius:0;border:none;">',
    html
)

# Add dropdowns to agent chat header
header_repl = r'''<div id="agent-chat-actions" style="display:flex; gap:6px; align-items:center;">
              <select id="agent-chat-model" class="hdr-btn" style="padding:4px;font-size:0.7rem;"></select>
              <select id="agent-chat-mode" class="hdr-btn" style="padding:4px;font-size:0.7rem;">
                <option value="reasoning">Reasoning</option>
                <option value="reasoning_fast">Fast Reasoning</option>
                <option value="conversational">Conversational</option>
                <option value="direct">Direct</option>
              </select>
            </div>'''
html = re.sub(r'<div id="agent-chat-actions" style="display:flex; gap:6px;"></div>', header_repl, html)

# 2. Modify callChatApi and addAssistantMsg to handle web_sources and pass modelOverride
html = html.replace(
    'async function callChatApi({ message, mode, history, customMode, sharedUrl }) {',
    'async function callChatApi({ message, mode, history, customMode, sharedUrl, modelOverride }) {'
)
html = html.replace(
    'model: modelSelect?.value,',
    'model: modelOverride || modelSelect?.value,'
)
html = html.replace(
    'function addAssistantMsg(text, classification, traces, save = true) {',
    'function addAssistantMsg(text, classification, traces, save = true, webSources = []) {'
)
html = html.replace(
    'sessionMessages.push({ role: \'assistant\', content: text, classification, traces });',
    'sessionMessages.push({ role: \'assistant\', content: text, classification, traces, web_sources: webSources });'
)

# Insert web_sources bubble in addAssistantMsg
bubble_code = r'''
    let webHtml = '';
    if (Array.isArray(webSources) && webSources.length > 0) {
      const urls = webSources.map(w => `<a href="${esc(w.url)}" target="_blank" style="color:var(--primary);text-decoration:underline;">${esc(w.title || w.url)}</a>`).join(', ');
      webHtml = `<div style="margin-bottom:8px;padding:6px;border-radius:6px;background:var(--code-bg);border:1px solid var(--primary);font-size:0.7rem;opacity:0.9;">🌐 <strong>Searched Web:</strong> ${urls}</div>`;
    }
    bodyHtml += webHtml;
'''
html = html.replace('let foundRunnable = null;', 'let foundRunnable = null;' + bubble_code)

# Insert web_sources bubble in renderAgentChatModal array as well
agent_bubble_code = r'''
      if (Array.isArray(m.web_sources) && m.web_sources.length > 0) {
        const urls = m.web_sources.map(w => `<a href="${esc(w.url)}" target="_blank" style="color:var(--primary);text-decoration:underline;">${esc(w.title || w.url)}</a>`).join(', ');
        tracesHtml += `<div style="margin-bottom:8px;padding:6px;border-radius:6px;background:var(--code-bg);border:1px solid var(--primary);font-size:0.7rem;opacity:0.9;">🌐 <strong>Searched Web:</strong> ${urls}</div>`;
      }
'''
html = html.replace('row.innerHTML = `<div style="font-size:.66rem', agent_bubble_code + '\n      row.innerHTML = `<div style="font-size:.66rem')

# Ensure API call passes web_sources
html = html.replace(
    'addAssistantMsg(data.reply, data.classification, data.traces);',
    'addAssistantMsg(data.reply, data.classification, data.traces, true, data.web_sources);'
)

# 3. Inject model options into OpenAgentChat & update sendCommandToAgent
patch_open_chat = r'''agentChatModal?.classList.add('open');
    renderAgentChatModal(agent.id);
    
    // Copy options from main select
    const modelSel = document.getElementById('agent-chat-model');
    const mainSel = document.getElementById('model-select');
    if (modelSel && mainSel) {
        modelSel.innerHTML = mainSel.innerHTML;
        modelSel.value = agent.model || mainSel.value;
    }
    const modeSel = document.getElementById('agent-chat-mode');
    if (modeSel) modeSel.value = agent.mode || 'reasoning_fast';
  }'''
html = re.sub(r"agentChatModal\?\.classList\.add\('open'\);\s*renderAgentChatModal\(agent\.id\);\s*\}", patch_open_chat, html)

# Pass overrides to sendCommandToAgent
html = html.replace('const mode = (agent.mode || \'reasoning_fast\');', "const mode = document.getElementById('agent-chat-mode')?.value || agent.mode || 'reasoning_fast';\n    const modelOverride = document.getElementById('agent-chat-model')?.value || null;")
html = html.replace('customMode: null,', 'customMode: null,\n      modelOverride,')

# 4. Context Menu: Add group chat option
ctx_menu_item = r'''<button id="mission-context-add-misc-packager" class="hdr-btn" type="button" style="color:#00ffff;border-color:#00ffff;">Add App Compiler Tool</button>
        <button id="mission-context-add-groupchat" class="hdr-btn" type="button" style="color:#00ff88;border-color:#00ff88;">Add Group Chat</button>'''
html = html.replace('<button id="mission-context-add-misc-packager" class="hdr-btn" type="button" style="color:#00ffff;border-color:#00ffff;">Add App Compiler Tool</button>', ctx_menu_item)

html = html.replace("const missionContextAddMiscPackager = document.getElementById('mission-context-add-misc-packager');", "const missionContextAddMiscPackager = document.getElementById('mission-context-add-misc-packager');\n  const missionContextAddGroupChat = document.getElementById('mission-context-add-groupchat');")

add_gc_listener = r'''missionContextAddMiscPackager?.addEventListener('click', () => {
    missionPendingNewTileType = 'misc';
    missionGridContextMenu?.classList.remove('open');
    createMissionMiscTile('packager', 'App Compiler', 'Select a project to bundle your files into a runnable format.');
  });
  
  missionContextAddGroupChat?.addEventListener('click', () => {
    missionPendingNewTileType = 'misc';
    missionGridContextMenu?.classList.remove('open');
    createMissionMiscTile('groupchat', 'Group Chat', '');
  });'''
html = re.sub(r"missionContextAddMiscPackager\?\.addEventListener\('click', \(\) => \{.*?\}\);", add_gc_listener, html, flags=re.DOTALL)

# 5. Fix sticky note project_id and edit textarea
patch_create_misc = r'''created_at: Date.now(),
      project_id: missionViewMode === 'project' ? missionSelectedProjectId : ''
    };'''
html = re.sub(r'created_at: Date\.now\(\),?\s*\};', patch_create_misc, html)

patch_render_misc = r'''function renderMissionMiscTiles() {
    if (!missionWidgetGrid) return;
    document.querySelectorAll('.misc-tile-dynamic').forEach(el => el.remove());
    
    // Remove the hardcoded groupchat tile if it still exists
    const hardcodedGc = document.querySelector('[data-widget-id="groupchat"]');
    if (hardcodedGc) hardcodedGc.remove();

    missionMiscTiles.forEach((item) => {
      const isProjectView = missionViewMode === 'project';
      if (isProjectView && item.project_id !== missionSelectedProjectId) return;
      if (!isProjectView && item.project_id) return;
'''
html = html.replace('if (missionViewMode !== \'hub\') return;\n\n    missionMiscTiles.forEach((item) => {', patch_render_misc)

patch_textarea_misc = r'''} else if (item.type === 'note') {
        const contentStr = String(item.content || '');
        tile.innerHTML =
          `<div class="mission-widget-header"><span>${esc(item.title || 'Misc Tile')}</span><div class="spacer"></div></div>` +
          `<div class="mission-widget-body" style="display:flex;flex-direction:column;gap:8px;flex:1;">` +
            `<textarea data-misc-textarea="${item.id}" style="flex:1; border:none; resize:none; background:transparent; color:var(--text); font-family:inherit; font-size:.72rem; outline:none; white-space:pre-wrap;" placeholder="Type your note here...">${esc(contentStr)}</textarea>` +
            `<div style="display:flex;gap:6px;flex-wrap:wrap;">` +
              `<button class="hdr-btn" data-misc-delete="${esc(item.id)}">Delete</button>` +
            `</div>` +
          `</div>` +
          `<div class="mission-widget-resize-handle" data-widget-handle="misc-${esc(item.id)}" title="Resize tile"></div>`;
          
        tile.querySelector(`[data-misc-textarea="${item.id}"]`)?.addEventListener('input', (e) => {
           item.content = e.target.value;
           saveMissionMiscTiles(missionMiscTiles);
        });
      } else if (item.type === 'groupchat') {
        tile.innerHTML =
          `<div class="mission-widget-header"><span>Group Chat</span><div class="spacer"></div></div>` +
          `<div class="mission-widget-body" style="display:flex;flex-direction:column;flex:1;gap:8px;">` +
            `<div data-groupchat-msgs="${item.id}" style="flex:1;min-height:100px;overflow:auto;background:var(--code-bg);border:1px solid var(--border);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:6px;font-size:0.75rem;">` +
               `<div style="opacity:0.6;font-style:italic;">Start chatting with your agents...</div>` +
            `</div>` +
            `<div style="display:flex;gap:4px;">` +
               `<input type="text" data-groupchat-input="${item.id}" placeholder="@Agent message..." style="flex:1;padding:6px;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.75rem;" />` +
               `<button data-groupchat-send="${item.id}" class="hdr-btn">Send</button>` +
            `</div>` +
          `</div>` +
          `<div class="mission-widget-resize-handle" data-widget-handle="misc-${esc(item.id)}" title="Resize tile"></div>`;
          
          const inEl = tile.querySelector(`[data-groupchat-input="${item.id}"]`);
          const msgEl = tile.querySelector(`[data-groupchat-msgs="${item.id}"]`);
          const sbdEl = tile.querySelector(`[data-groupchat-send="${item.id}"]`);
          
          const sendMsg = () => {
              if(!inEl.value.trim()) return;
              const msg = document.createElement('div');
              msg.textContent = "You: " + inEl.value;
              msg.style.padding = "4px";
              msg.style.background = "var(--msg-user)";
              msg.style.borderRadius = "4px";
              msgEl.appendChild(msg);
              inEl.value = "";
              msgEl.scrollTop = msgEl.scrollHeight;
          };
          sbdEl?.addEventListener('click', sendMsg);
          inEl?.addEventListener('keydown', (e) => { if(e.key === 'Enter') sendMsg(); });
      }'''

html = re.sub(r'\} else \{\s*const snippet = String\(item\.content.*?\}\);\s*\}', patch_textarea_misc, html, flags=re.DOTALL)

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
