import re

html = open('templates/index.html', 'r').read()

# Fix 1: agent chat push
old_agent_push = r"sess.messages.push\(\{ role: 'assistant', content: data.reply, classification: data.classification, traces: data.traces \|\| \[\] \}\);"
new_agent_push = r"sess.messages.push({ role: 'assistant', content: data.reply, classification: data.classification, traces: data.traces || [], web_sources: data.web_sources || [] });"

html = re.sub(old_agent_push, new_agent_push, html)

# Fix 2: main chat initialization reload
old_init_load = r"addAssistantMsg\(m.content, m.classification, m.traces, false\);"
new_init_load = r"addAssistantMsg(m.content, m.classification, m.traces, false, m.web_sources || []);"

html = re.sub(old_init_load, new_init_load, html)

# Fix 3: Group Chat context menu default block issue
# Instead of assuming it's unhidden, let's explicitly add it to the project context menu condition
old_cm = r"if \(missionContextAddProject\) missionContextAddProject.style.display = 'none';"
new_cm = r"""if (missionContextAddProject) missionContextAddProject.style.display = 'none';
      if (missionContextAddGroupChat) missionContextAddGroupChat.style.display = 'block';"""

html = re.sub(old_cm, new_cm, html)

old_cm_else = r"if \(missionContextAddManager\) missionContextAddManager.style.display = 'none';"
new_cm_else = r"""if (missionContextAddManager) missionContextAddManager.style.display = 'none';
      if (missionContextAddGroupChat) missionContextAddGroupChat.style.display = 'none';"""

html = re.sub(old_cm_else, new_cm_else, html)

open('templates/index.html', 'w').write(html)
