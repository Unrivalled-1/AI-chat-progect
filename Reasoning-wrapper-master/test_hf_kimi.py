import urllib.request
import json
import os
try:
    from huggingface_hub import InferenceClient
    client = InferenceClient(token="")
    # It will fail auth, but we want to see if it even attempts it or crashes on auto-router before auth
    m = client.chat_completion(model="moonshotai/Kimi-K2.5:cheapest", messages=[{"role": "user", "content": "hi"}])
    print(m)
except Exception as e:
    print("ERROR:", repr(e))
