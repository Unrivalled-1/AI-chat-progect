import re

with open("reasoning/synthesizer.py", "r") as f:
    text = f.read()

# Replace the HTML forcing prompt
old_prompt = \"\"\"                "Now write your final response incorporating insights from the "\\n                "reasoning chain above. If this is a game/app/demo, output a "\\n                "COMPLETE \\`\\`\\`html code block with a full standalone HTML file."\"\"\"
new_prompt = \"\"\"                "Now write your final response incorporating insights from the "\\n                "reasoning chain above. ONLY return code if explicitly requested "\\n                "or needed to fulfill the prompt. Otherwise, respond naturally in markdown."\"\"\"

text = text.replace(old_prompt, new_prompt)

with open("reasoning/synthesizer.py", "w") as f:
    f.write(text)

