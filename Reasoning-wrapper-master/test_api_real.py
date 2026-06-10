import urllib.request
import json
import time

url = "http://localhost:5000/api/chat"
headers = {'Content-Type': 'application/json'}
data = {
    "model": "meta-llama/Llama-3.1-8B-Instruct",
    "message": "Hi",
    "mode": "conversational",
    "history": [],
    "hf_api_key": "" # Let's see if there is a default token, or what error we get
}
req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers)
try:
    response = urllib.request.urlopen(req)
    for line in response:
        print(line.decode('utf-8'), end="")
except Exception as e:
    if hasattr(e, 'read'): print(e.read().decode('utf-8'))
    else: print("ERROR", e)
