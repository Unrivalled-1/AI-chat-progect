import re

with open("templates/index.html", "r") as f:
    text = f.read()

text = text.replace(
    "@keyframes typing-bounce {\\n      0%,80%,100% { transform: scale(0) translateY(0); }\\n      40%          { transform: scale(1) translateY(-6px); }\\n    }",
    "@keyframes typing-bounce {\\n      0%,80%,100% { opacity: 0.3; transform: translateY(0); }\\n      40% { opacity: 1; transform: translateY(-6px); }\\n    }"
)

# And let's adjust the .typing-indicator spans
text = text.replace(
    "animation: typing-bounce 1.4s infinite ease-in-out both;",
    "animation: typing-bounce 1.4s infinite ease-in-out;"
)

with open("templates/index.html", "w") as f:
    f.write(text)

