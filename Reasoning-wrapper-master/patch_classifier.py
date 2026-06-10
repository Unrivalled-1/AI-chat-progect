import re

with open('reasoning/classifier.py', 'r', encoding='utf-8') as f:
    content = f.read()

def_code = """
def _infer_problem_type(text: str, tags: list[str]) -> str:
    lower_text = text.lower()
    if any(k in lower_text for k in ["error", "bug", "fix", "crash", "exception"]):
        return "debug"
    if any(k in lower_text for k in ["create", "generate", "write", "build", "implement"]):
        return "code_gen"
    if any(k in lower_text for k in ["refactor", "rewrite", "clean up", "optimize"]):
        return "refactor"
    if any(k in lower_text for k in ["ui", "css", "html", "frontend"]):
        return "ui"
    if any(k in lower_text for k in ["explain", "how", "why", "what is"]):
        return "explain"
    if "architecture" in lower_text or "system" in lower_text:
        return "architecture"
    return "conversation"

def _strip_fences(raw: str) -> str:
"""

new_content = content.replace("def _strip_fences(raw: str) -> str:", def_code)
with open('reasoning/classifier.py', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Patched:", content != new_content)
