with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re

# Update the listener logic
old_js = """const resetBtn = document.getElementById('reset-btn');
      if (resetBtn) resetBtn.click();"""

new_js = """const resetBtn = document.getElementById('reset-btn');
      if (resetBtn) resetBtn.click();
      
      const missionPage = document.getElementById('mission-page');
      const chatPane = document.getElementById('chat-pane');
      if (missionPage) missionPage.style.display = 'none';
      if (chatPane) chatPane.style.display = '';"""

if old_js in html:
    html = html.replace(old_js, new_js)
    with open('templates/index.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print("Fixed.")
else:
    print("Could not find string")

