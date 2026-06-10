with open("reasoning/constitution.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    '"intent_detail":  "<one sentence: the specific outcome the user expects>"\n}',
    '"intent_detail":  "<one sentence: the specific outcome the user expects>",\n  "needs_web_search": <true if the request requires fresh internet data, news, prices, or looking up external docs, else false>\n}'
)

with open("reasoning/constitution.py", "w", encoding="utf-8") as f:
    f.write(text)
print("Patched.")
