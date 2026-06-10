import re

with open("app.py", "r") as f:
    text = f.read()

repl = '''def run_conversational_chat(client, selected_model: str, user_message: str, history: list[dict] | None = None) -> tuple[str, list[dict], str]:
    history_list = history or []
    # The last message in history by the time this is called is often the current user message itself.
    if history_list and history_list[-1].get("role") == "user" and history_list[-1].get("content") == user_message:
        history_list = history_list[:-1]
        
    history_text = _history_to_text(history_list)'''

text = re.sub(
    r'def run_conversational_chat\(client, selected_model: str, user_message: str, history: list\[dict\] \| None = None\) -> tuple\[str, list\[dict\], str\]:\n    history_text = _history_to_text\(history or \[\]\)',
    repl,
    text,
    flags=re.DOTALL
)

with open("app.py", "w") as f:
    f.write(text)
