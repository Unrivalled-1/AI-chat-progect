import re
with open('reasoning/pipeline.py', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(
    'error: str | None = None',
    'error: str | None = None\n    checkpoints: list = field(default_factory=list)\n    memory_influence: list = field(default_factory=list)'
)

with open('reasoning/pipeline.py', 'w', encoding='utf-8') as f:
    f.write(text)
