import re
with open('app.py', 'r') as f:
    text = f.read()

target = """    muse_user = (
        f"Conversation so far:\\n{history_text}\\n\\n"
        f"Latest user message:\\n{user_message}"
    )"""

new_target = """    # Make sure augmented context gets to Muse
    muse_user_msg = user_message
    if history and len(history) > 0 and history[-1].get("role") == "user":
        # The history already holds the augmented message, let's pull it if differ.
        if "[WEB_CONTEXT]" in history[-1]["content"]:
            muse_user_msg = history[-1]["content"]

    muse_user = (
        f"Conversation so far:\\n{history_text}\\n\\n"
        f"Latest user message:\\n{muse_user_msg}"
    )"""

if 'muse_user_msg =' not in text:
    text = text.replace(target, new_target)
    
target2 = """    bard_user = (
        f"Conversation so far:\\n{history_text}\\n\\n"
        f"Latest user message:\\n{user_message}\\n\\n"
        f"Muse notes (internal):\\n{muse_notes}\\n\\n"
        "Now write the final reply for the user."
    )"""

new_target2 = """    bard_user = (
        f"Conversation so far:\\n{history_text}\\n\\n"
        f"Latest user message:\\n{muse_user_msg}\\n\\n"
        f"Muse notes (internal):\\n{muse_notes}\\n\\n"
        "Now write the final reply for the user."
    )"""

if 'muse_user_msg}\\n\\n"' not in text:
    text = text.replace(target2, new_target2)

with open('app.py', 'w') as f:
    f.write(text)
