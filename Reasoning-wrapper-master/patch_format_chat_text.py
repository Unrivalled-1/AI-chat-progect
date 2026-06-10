import re

with open("static/js/main.js", "r") as f:
    content = f.read()

old_format = """  function formatChatText(text) {
    if (!text) return '';
    let escaped = esc(text);"""

new_format = """  function formatChatText(text) {
    if (!text) return '';
    // Strip out <think> tags entirely, assuming traces are handled natively
    let noThink = text.replace(/<think>([\\s\\S]*?)<\\/think>/gi, '').trim();
    let escaped = esc(noThink);"""

content = content.replace(old_format, new_format)

with open("static/js/main.js", "w") as f:
    f.write(content)

print("Patched script.")
