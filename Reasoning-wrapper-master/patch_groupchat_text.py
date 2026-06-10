import re
with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Make sure we don't accidentally hide group chat in non-project views if they want to interact with it there
# Actually, I already ran sed -i "s/if (missionContextAddGroupChat) missionContextAddGroupChat.style.display = 'none';/if (missionContextAddGroupChat) missionContextAddGroupChat.style.display = 'block';/g" templates/index.html

# Let's ensure the Main Chat still looks perfect.
pass
