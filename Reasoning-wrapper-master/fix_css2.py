with open("templates/index.html", "r") as f:
    text = f.read()

start = text.find("@keyframes typing-bounce")
end = text.find("@keyframes backdrop-in")
if start != -1 and end != -1:
    old = text[start:end]
    new = "@keyframes typing-bounce {\n      0%,80%,100% { transform: translateY(0); opacity: 0.3; }\n      40% { transform: translateY(-6px); opacity: 1; }\n    }\n    "
    text = text.replace(old, new)
    with open("templates/index.html", "w") as f:
        f.write(text)

