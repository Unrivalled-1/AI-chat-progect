with open("app.py", "r", encoding="utf-8") as f:
    text = f.read()
text = text.replace('"id": "moonshotai/Kimi-K2-Instruct"', '"id": "moonshotai/Moonlight-16B-A3B-Instruct"')
with open("app.py", "w", encoding="utf-8") as f:
    f.write(text)
