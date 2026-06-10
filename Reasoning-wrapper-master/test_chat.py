import requests
import os
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

payload = {
    "message": "those are out yet",
    "history": [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi there!"},
        {"role": "user", "content": "those are out yet"}
    ],
    "mode": "conversational",
    "model": "gemini-2.5-flash",
    "include_trace_prompts": True,
    "api_key": api_key
}

r = requests.post("http://localhost:5000/api/chat", json=payload)
data = r.json()
if data.get("traces"):
    for t in data["traces"]:
        if t["agent"] == "Muse":
            for msg in t.get("input_messages", []):
                if msg["role"] == "user":
                    print("--- MUSE USER PROMPT ---")
                    print(msg["content"])
