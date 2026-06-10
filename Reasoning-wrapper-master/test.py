import sys
import app

history = [
    {"role": "user", "content": "hello"},
    {"role": "assistant", "content": "hi there!"},
    {"role": "user", "content": "those are out yet"}
]
user_msg = "those are out yet"

normalized = app._normalize_history(history, user_msg)
print("Normalized:", normalized)

text = app._history_to_text(normalized)
print("History Text:", text)
