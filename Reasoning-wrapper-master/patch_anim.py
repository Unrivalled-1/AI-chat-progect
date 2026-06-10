import re

with open("templates/index.html", "r") as f:
    text = f.read()

text = text.replace(
    "animation: typing-bounce 1.4s infinite ease-in-out both;",
    "animation: typing-bounce 1.4s infinite ease-in-out;"
)

text = re.sub(
    r"@keyframes typing-bounce \{.*?\}",
    "@keyframes typing-bounce {\\n      0%,80%,100% { transform: translateY(0); opacity: 0.3; }\\n      40% { transform: translateY(-6px); opacity: 1; }\\n    }",
    text, flags=re.DOTALL
)

with open("templates/index.html", "w") as f:
    f.write(text)

