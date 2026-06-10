import requests, json

payload = {
    "message": "hello",
    "mode": "project_manager",
    "history": [{"role": "assistant", "content": "Agent initialized.\n\nInstructions:\nYou are the Project Manager for this workspace. Coordinate tasks and oversee the codebase."}],
    "model": "gemini-2.5-flash",
    "instructions": "",
    "shared_url": "",
    "reasoning_mode": "once"
}

resp = requests.post("http://127.0.0.1:5000/api/chat", json=payload)
print(resp.status_code)
print(resp.text)
