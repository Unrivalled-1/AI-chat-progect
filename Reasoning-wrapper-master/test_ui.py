import re
with open("templates/index.html") as f:
    text = f.read()

print("calendar tile matches:", len(re.findall("mission-widget.*?calendar", text)))
