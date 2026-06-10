import urllib.request
import urllib.parse

data = urllib.parse.urlencode({'q': 'best phones 2026'}).encode('utf-8')
req = urllib.request.Request('https://lite.duckduckgo.com/lite/', data=data, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
resp = urllib.request.urlopen(req)
html = resp.read().decode('utf-8')
print(html[:2000])
