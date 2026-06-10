import re

path = "templates/index.html"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

# 1. Update openMissionPage
open_miss = """  function openMissionPage(noPush) {
    if (!noPush) window.history.pushState(null, '', '/mission');"""
text = re.sub(r'  function openMissionPage\(\) \{\n', open_miss + '\n', text)

# 2. Update closeMissionPage
close_miss = """  function closeMissionPage(noPush) {
    if (!noPush) window.history.pushState(null, '', '/chat');"""
text = re.sub(r'  function closeMissionPage\(\) \{\n', close_miss + '\n', text)

# 3. Update openSandbox
open_sand = """  function openSandbox(htmlCode, files = null, noPush = false) {
    if (!noPush && window.location.pathname !== '/sandbox') {
        window.history.pushState(null, '', '/sandbox');
    }"""
text = re.sub(r'  function openSandbox\(htmlCode, files = null\) \{\n', open_sand + '\n', text)

# 4. Update closeSandbox
close_sand = """  function closeSandbox(noPush) {
    if (!noPush && window.location.pathname === '/sandbox') {
        window.history.pushState(null, '', '/chat');
    }"""
text = re.sub(r'  function closeSandbox\(\) \{\n', close_sand + '\n', text)

# 5. Add popstate and load handlers at the end of the script block
init_code = """
  // --- URL Routing ---
  function handleUrlRoute() {
    const p = window.location.pathname;
    if (p === '/mission') {
      openMissionPage(true);
    } else if (p === '/sandbox') {
      // Just open an empty sandbox or whatever was there
      openSandbox('', null, true);
    } else {
      closeMissionPage(true);
      closeSandbox(true);
    }
  }
  
  window.addEventListener('popstate', handleUrlRoute);
  
  // Call on initial load slightly delayed to ensure DOM is ready
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(handleUrlRoute, 100);
  });
"""

text = text.replace('</script>\n</body>', init_code + '\n</script>\n</body>')

with open(path, "w", encoding="utf-8") as f:
    f.write(text)

print("Patched.")
