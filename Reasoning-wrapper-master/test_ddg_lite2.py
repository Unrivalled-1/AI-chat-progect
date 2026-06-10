import urllib.request
import urllib.parse
from html.parser import HTMLParser

class DDGLiteParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.results = []
        self.current_result = {}
        self.in_title = False
        self.in_snippet = False
        
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and 'class' in attrs and 'result-url' in attrs['class']:
            self.current_result['url'] = attrs.get('href', '')
        elif tag == 'a' and 'class' in attrs and 'result-snippet' in attrs['class']:
            self.in_title = True
        elif tag == 'td' and 'class' in attrs and 'result-snippet' in attrs['class']:
            self.in_snippet = True
            
    def handle_data(self, data):
        if self.in_title:
            self.current_result['title'] = self.current_result.get('title', '') + data
        elif self.in_snippet:
            self.current_result['snippet'] = self.current_result.get('snippet', '') + data
            
    def handle_endtag(self, tag):
        if tag == 'a' and self.in_title:
            self.in_title = False
        elif tag == 'td' and self.in_snippet:
            self.in_snippet = False
            if 'url' in self.current_result:
                self.results.append(self.current_result)
                self.current_result = {}

data = urllib.parse.urlencode({'q': 'best phones 2026'}).encode('utf-8')
req = urllib.request.Request('https://lite.duckduckgo.com/lite/', data=data, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
resp = urllib.request.urlopen(req)
html = resp.read().decode('utf-8')
parser = DDGLiteParser()
parser.feed(html)
print(parser.results)
