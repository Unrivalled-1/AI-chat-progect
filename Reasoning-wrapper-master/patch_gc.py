import re

with open("static/js/main.js", "r") as f:
    content = f.read()

# Strip <think> tags from Group Chat as well
old_gc = """  function _gcRenderRichText(text) {
    const raw = String(text || '');"""
new_gc = """  function _gcRenderRichText(text) {
    const raw = String(text || '').replace(/<think>([\\s\\S]*?)<\\/think>/gi, '').trim();"""

content = content.replace(old_gc, new_gc)

with open("static/js/main.js", "w") as f:
    f.write(content)

print("Patched script.")
