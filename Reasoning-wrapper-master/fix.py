with open('app.py', 'r') as f:
    t = f.read()

t = t.replace("\x08", "e\\b")
with open('app.py', 'w') as f:
    f.write(t)
