import urllib.request
import json
import sys

url = "http://localhost:5000/api/runs/run_1780607197921_nhnd2"
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode())
    traces = data["run"]["result"]["traces"]
    for t in traces:
        print(t["agent"])
