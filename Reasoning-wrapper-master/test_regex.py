import re
user_msg = "Here is my question.\n[AGENT_PROFILE]\nsources=\n- https://example.com\n[/AGENT_PROFILE]"
found_urls = re.findall(r"(https?://[^\s\"\'\\]+)", user_msg)
print(found_urls)
