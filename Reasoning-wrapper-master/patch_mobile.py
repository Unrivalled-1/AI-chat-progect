import re

with open("static/css/main.css", "r") as f:
    text = f.read()

# Add a media query to disable sidebar padding on really small screens
media_query = """
    @media (max-width: 600px) {
      #main.sidebar-open { padding-left: 0 !important; }
      #sidebar { box-shadow: 20px 0 60px rgba(0,0,0,0.6); }
      .toast-container { right: 10px; bottom: 10px; }
    }
"""

if "#main.sidebar-open { padding-left: 0 !important; }" not in text:
    text += media_query

with open("static/css/main.css", "w") as f:
    f.write(text)

print("Patched.")
