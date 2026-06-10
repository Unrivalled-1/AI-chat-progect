import re

with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Add Active Agents button in header
header_btn_str = '''      <button id="toggle-sandbox" class="hdr-btn">Sandbox</button>'''
if 'id="active-agents-btn"' not in html:
    html = html.replace(header_btn_str, header_btn_str + '''\n      <button id="active-agents-btn" class="hdr-btn" style="position:relative;">Active Agents <span id="active-agents-count" style="background:var(--primary);color:#fff;border-radius:10px;padding:0 6px;margin-left:4px;font-size:0.65rem;">0</span></button>''')

# 2. Add Active Agents modal HTML
if 'id="active-agents-modal"' not in html:
    modal_html = '''
  <div id="active-agents-modal" style="display:none;position:absolute;top:60px;right:20px;width:300px;background:var(--menu-bg);border:1px solid var(--border);border-radius:8px;padding:12px;z-index:999;box-shadow:var(--glass-shadow);backdrop-filter:blur(10px);">
    <div style="font-size:0.8rem;font-weight:bold;margin-bottom:8px;border-bottom:1px solid var(--border);padding-bottom:6px;">Active Agents</div>
    <div id="active-agents-list" style="max-height:200px;overflow:auto;font-size:0.75rem;display:flex;flex-direction:column;gap:6px;">
       <div style="opacity:0.6;font-style:italic;">No active agents.</div>
    </div>
  </div>
'''
    html = html.replace('<!-- Settings Modal -->', modal_html + '\n  <!-- Settings Modal -->')

# 3. Add Group Chat widget to mission-widget-grid
groupchat_widget = '''
        <section class="mission-widget w-size-1x1" draggable="true" data-widget-id="groupchat">
          <div class="mission-widget-header">
            <span>Group Chat</span>
            <div class="spacer"></div>
            <button class="hdr-btn" data-widget-unlock="groupchat">Unlock Size</button>
          </div>
          <div class="mission-widget-body" style="display:flex;flex-direction:column;flex:1;gap:8px;">
            <div id="mission-groupchat-messages" style="flex:1;min-height:100px;overflow:auto;background:var(--code-bg);border:1px solid var(--border);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:6px;font-size:0.75rem;">
               <div style="opacity:0.6;font-style:italic;">Start chatting with your agents...</div>
            </div>
            <div style="display:flex;gap:4px;">
               <input id="mission-groupchat-input" type="text" placeholder="@Agent message..." style="flex:1;padding:6px;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.75rem;" />
               <button id="mission-groupchat-send" class="hdr-btn">Send</button>
            </div>
          </div>
          <div class="mission-widget-resize-handle" data-widget-handle="groupchat" title="Resize widget"></div>
        </section>
'''
if 'data-widget-id="groupchat"' not in html:
    html = html.replace('<div id="mission-grid-context-menu"', groupchat_widget + '\n      <div id="mission-grid-context-menu"')

# 4. Fix Calendar - "tile is blank and cant move it"- make sure it doesn't have broken styles. 
# It turns out Calendar has a bunch of items wrapped incorrectly or lacking flex layout 
# We'll also just add `flex: 1` to mission-widget-body in Calendar so it can stretch correctly 
html = html.replace('<div class="mission-widget-body" style="display:flex;flex-direction:column;gap:8px;">', '<div class="mission-widget-body" style="display:flex;flex-direction:column;gap:8px;flex:1;">')

# 5. Add group chat and active agents simple logic
js_additions = '''
  // -- Active Agents Modal Logic --
  const activeAgentsBtn = document.getElementById('active-agents-btn');
  const activeAgentsModal = document.getElementById('active-agents-modal');
  if(activeAgentsBtn && activeAgentsModal) {
      activeAgentsBtn.addEventListener('click', () => {
          activeAgentsModal.style.display = activeAgentsModal.style.display === 'none' ? 'block' : 'none';
      });
  }
  
  // -- Group Chat Logic --
  const groupchatInput = document.getElementById('mission-groupchat-input');
  const groupchatMessages = document.getElementById('mission-groupchat-messages');
  const groupchatSend = document.getElementById('mission-groupchat-send');
  if(groupchatSend) {
      groupchatSend.addEventListener('click', () => {
          if(!groupchatInput.value.trim()) return;
          const msg = document.createElement('div');
          msg.textContent = "You: " + groupchatInput.value;
          msg.style.padding = "4px";
          msg.style.background = "var(--msg-user)";
          msg.style.borderRadius = "4px";
          groupchatMessages.appendChild(msg);
          groupchatInput.value = "";
          groupchatMessages.scrollTop = groupchatMessages.scrollHeight;
      });
  }
'''

if '// -- Group Chat Logic --' not in html:
    # Inject before end of script
    html = html.replace('</script>', js_additions + '\n</script>')

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
