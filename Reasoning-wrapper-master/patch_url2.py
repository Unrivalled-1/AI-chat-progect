path = "templates/index.html"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

init_code = """
  // --- URL Routing ---
  function handleUrlRoute() {
    const p = window.location.pathname;
    if (p === '/mission') {
      openMissionPage(true);
    } else if (p === '/sandbox') {
      openSandbox('', null, true);
    } else {
      closeMissionPage(true);
      closeSandbox(true);
    }
  }
  
  window.addEventListener('popstate', handleUrlRoute);
  
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(handleUrlRoute, 100);
  });
"""

if 'handleUrlRoute' not in text:
    text = text.replace('</script>', init_code + '\n</script>')

with open(path, "w", encoding="utf-8") as f:
    f.write(text)

print("Patched 2.")
