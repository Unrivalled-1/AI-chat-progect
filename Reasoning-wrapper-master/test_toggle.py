import urllib.request, json
req = urllib.request.Request("http://localhost:5000/api/models/Qwen%2FQwen2.5-Coder-7B-Instruct:cheapest/toggle", 
    data=b'{"enabled": false}', 
    headers={"Content-Type": "application/json"},
    method="POST"
)
try:
    print(urllib.request.urlopen(req).read().decode())
except Exception as e:
    print(e)
