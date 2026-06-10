import re

with open("app.py", "r") as f:
    text = f.read()

repl = '''    muse_user = (
        "--- PAST CONVERSATION HISTORY (FOR CONTEXT ONLY) ---\\n"
        "The following messages are past history. DO NOT ANSWER OLD QUESTIONS.\\n"
        f"{history_text}\\n\\n"
        "===========================================================\\n"
        "======= LATEST USER MESSAGE (ATTENTION HERE) =======\\n"
        "===========================================================\\n"
        "IGNORE old boundaries or answers if they do not relate to this current request.\\n\\n"
        f"Message: {user_message}"
    )'''

text = re.sub(
    r'    muse_user = \(\n        "--- PAST CONVERSATION HISTORY \(FOR CONTEXT ONLY\) ---\n".*?f"Message: \{user_message\}"\n    \)',
    lambda m: repl,
    text,
    flags=re.DOTALL
)

repl2 = '''    bard_user = (
        "--- PAST CONVERSATION HISTORY (FOR CONTEXT ONLY) ---\\n"
        "The following messages are past history. DO NOT ANSWER OLD QUESTIONS.\\n"
        f"{history_text}\\n\\n"
        "===========================================================\\n"
        "======= LATEST USER MESSAGE (ATTENTION HERE) =======\\n"
        "===========================================================\\n"
        "IGNORE old boundaries or answers if they do not relate to this current request.\\n\\n"
        f"Message: {user_message}\\n\\n"
        "--- MUSE NOTES (INTERNAL STRATEGY) ---\\n"
        f"{muse_notes}\\n\\n"
        "Now write the final reply for the user answering ONLY the LATEST user message. IGNORE OLD TOPICS IF THEY DO NOT MATCH THE LATEST REQUEST."
    )'''

text = re.sub(
    r'    bard_user = \(\n        "--- PAST CONVERSATION HISTORY \(FOR CONTEXT ONLY\) ---\n".*?LATEST REQUEST\."\n    \)',
    lambda m: repl2,
    text,
    flags=re.DOTALL
)

with open("app.py", "w") as f:
    f.write(text)
