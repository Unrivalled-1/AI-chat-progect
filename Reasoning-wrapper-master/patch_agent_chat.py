import re

with open("templates/index.html", "r") as f:
    text = f.read()

old_code = """    const { res, data } = await callChatApi({
      message: outbound,
      mode,
      history,
      customMode: null,
      sharedUrl: '',
    });"""

new_code = """    const acb = document.getElementById('agent-chat-messages');
    let typId = 'typ-' + Date.now();
    if (acb) {
      const div = document.createElement('div');
      div.className = 'msg assistant typing-indicator';
      div.id = typId;
      div.style.alignSelf = 'flex-start';
      div.style.marginBottom = '10px';
      div.innerHTML = '<span></span><span></span><span></span>';
      acb.appendChild(div);
      acb.scrollTop = acb.scrollHeight;
    }

    const { res, data } = await callChatApi({
      message: outbound,
      mode,
      history,
      customMode: null,
      sharedUrl: '',
    });

    if (acb) {
      const tEl = document.getElementById(typId);
      if (tEl) tEl.remove();
    }"""

text = text.replace(old_code, new_code)

with open("templates/index.html", "w") as f:
    f.write(text)

