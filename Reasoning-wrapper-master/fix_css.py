with open("templates/index.html", "r") as f:
    text = f.read()

import re
text = re.sub(
    r"@keyframes typing-bounce \{.*?\}\\s*40%[^}]*\}",
    "@keyframes typing-bounce {\\n      0%,80%,100% { transform: translateY(0); opacity: 0.3; }\\n      40% { transform: translateY(-6px); opacity: 1; }\\n    }",
    text, flags=re.DOTALL
)

with open("templates/index.html", "w") as f:
    f.write(text)

