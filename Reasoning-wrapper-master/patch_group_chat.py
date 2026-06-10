import re
with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Fix Group Chat JS
old_gc_js = r"""const groupchatInput = document.getElementById\('mission-groupchat-input'\);
  const groupchatMessages = document.getElementById\('mission-groupchat-messages'\);
  const groupchatSend = document.getElementById\('mission-groupchat-send'\);
  if\(groupchatSend\) \{
      groupchatSend.addEventListener\('click', \(\) => \{
          if\(!groupchatInput.value.trim\(\)\) return;
          const msg = document.createElement\('div'\);
          msg.textContent = "You: " \+ groupchatInput.value;
          msg.style.padding = "4px";
          msg.style.background = "var\(--msg-user\)";
          msg.style.borderRadius = "4px";
          groupchatMessages.appendChild\(msg\);
          groupchatInput.value = "";
          groupchatMessages.scrollTop = groupchatMessages.scrollHeight;
      \}\);
  \}"""

new_gc_js = r"""const groupchatInput = document.getElementById('mission-groupchat-input');
  const groupchatMessages = document.getElementById('mission-groupchat-messages');
  const groupchatSend = document.getElementById('mission-groupchat-send');
  
  function appendGroupMsg(role, senderName, text) {
      if(!groupchatMessages) return;
      const wrap = document.createElement('div');
      wrap.className = role === 'user' ? 'msg user' : 'msg assistant';
      
      let html = "";
      if(role !== 'user' && senderName) {
         html += `<div class="role" style="font-size:0.75rem;font-weight:600;margin-bottom:4px;opacity:0.8;">${esc(senderName)}</div>`;
      }
      html += `<div class="msg-text" style="white-space:pre-wrap;font-size:0.85rem;">${esc(text)}</div>`;
      
      wrap.innerHTML = html;
      groupchatMessages.appendChild(wrap);
      groupchatMessages.scrollTop = groupchatMessages.scrollHeight;
  }
  
  if(groupchatSend) {
      groupchatSend.addEventListener('click', async () => {
          const rawText = groupchatInput.value.trim();
          if(!rawText) return;
          
          appendGroupMsg('user', 'You', rawText);
          groupchatInput.value = "";
          
          let targets = [];
          if (rawText.toLowerCase().startsWith('@all')) {
              targets = missionAgents; // All agents
          } else {
              const match = rawText.match(/^@([^\s]+)/);
              if (match) {
                  const name = match[1].toLowerCase();
                  const found = missionAgents.find(a => (a.name || '').toLowerCase() === name);
                  if (found) targets = [found];
              }
          }
          
          if (targets.length === 0) {
              appendGroupMsg('assistant', 'System', '⚠️ No valid agent found. Start message with @agentName or @all');
              return;
          }
          
          for (const agent of targets) {
             const cleanText = rawText.replace(/^@[^\s]+\s*/, '').trim();
             // We use callChatApi directly or sendCommandToAgent behind the scenes. 
             // sendCommandToAgent has a lot of logic already. Let's just wrap it.
             appendGroupMsg('assistant', 'System', `⏳ Waiting for ${agent.name || 'Agent'}...`);
             try {
                // Actually trigger their logic
                await sendCommandToAgent(agent, "Group message from User: " + cleanText);
                
                // Read the latest message from that agent's session
                const sid = agent.chat_id;
                if(sid && store.sessions[sid]) {
                    const sess = store.sessions[sid];
                    const lastMsg = sess.messages[sess.messages.length - 1];
                    if(lastMsg && lastMsg.role === 'assistant') {
                       // Remove the "Waiting for" message
                       groupchatMessages.removeChild(groupchatMessages.lastChild);
                       appendGroupMsg('assistant', agent.name || 'Agent', lastMsg.content || '');
                    }
                }
             } catch (e) {
                groupchatMessages.removeChild(groupchatMessages.lastChild);
                appendGroupMsg('assistant', 'System', `⚠️ ${agent.name} failed: ${e.message}`);
             }
          }
      });
  }
  groupchatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
          e.preventDefault();
          groupchatSend?.click();
      }
  });"""

html = re.sub(old_gc_js, new_gc_js, html)

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
