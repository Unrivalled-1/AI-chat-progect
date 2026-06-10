import re
with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Update the main CSS for .msg
old_msg_css = r"""\.msg \{
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 6px;
  max-width: 85%;
  line-height: 1\.5;
  border: 1px solid var\(--border\);
\}
\.msg\.user \{
  background: var\(--msg-user\);
  align-self: flex-end;
  border-bottom-right-radius: 2px;
\}
\.msg\.assistant \{
  background: var\(--msg-assistant\);
  align-self: flex-start;
  border-bottom-left-radius: 2px;
\}"""

new_msg_css = r""".msg {
  margin-bottom: 2px;
  padding: 12px 16px;
  border-radius: 18px;
  max-width: 75%;
  line-height: 1.5;
  position: relative;
  word-wrap: break-word;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}
.msg.user {
  background: var(--msg-user);
  align-self: flex-end;
  border-bottom-right-radius: 4px;
  color: white; /* Make text white for user bubble */
  margin-left: auto; /* Ensure it pushes to the right */
}
.msg.assistant {
  background: var(--msg-assistant);
  align-self: flex-start;
  border-bottom-left-radius: 4px;
  border: 1px solid var(--border);
}
.msg .role {
  font-size: 0.75rem;
  font-weight: 600;
  margin-bottom: 4px;
  opacity: 0.8;
}
.msg.user .role {
  display: none; /* Hide 'You' role prefix in normal chat to look like iMessage */
}
"""

html = re.sub(old_msg_css, new_msg_css, html)

# Fix #chat-box so flex layout actually pushes msg to the sides
old_chatbox = r"""#chat-box \{
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  box-sizing: border-box;
\}"""

new_chatbox = r"""#chat-box {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px; /* space between messages */
}"""

html = re.sub(old_chatbox, new_chatbox, html)

# The user color shouldn't be too light if text is white
old_root = r"""--msg-user: #e3f2fd;"""
new_root = r"""--msg-user: #007aff; /* iMessage blue */"""
html = html.replace(old_root, new_root)

old_dark_root = r"""--msg-user: #1a3a5a;"""
new_dark_root = r"""--msg-user: #0a84ff; /* Dark mode blue */"""
html = html.replace(old_dark_root, new_dark_root)


with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
