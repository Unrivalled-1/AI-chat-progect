# Vibe Coding — Session Reference & Workflow Guide
**Date:** February 25, 2026  
**Project:** Reasoning Wrapper (AI Chat Engine)  
**Status:** Fully mobile-responsive, Docker-ready, deployed to GitHub

---

## 📌 Session Addendum — March 23, 2026 (Critical Stabilization)

### Major Issues Found + Fixed
1. **Model routing regressions (HF router aliases):**
  - Normalized generic Llama/Qwen model routing to proxy-friendly tags (e.g. `:cheapest`) where needed.
  - Removed a restrictive fallback exception path that was failing valid model flows.

2. **Web context ingestion bugs:**
  - Fixed nested `mode_config` URL extraction so URLs embedded in custom mode payloads are discovered.
  - Increased fetch context sizes to avoid premature truncation of useful page content.

3. **Reasoning pipeline crash:**
  - Restored missing `_infer_problem_type()` in classifier fallback path.
  - Fixed runtime error: `Pipeline error: name '_infer_problem_type' is not defined`.

4. **Reasoning response serialization crash (500):**
  - Fixed backend trace serialization to be backward-compatible with current `AgentTrace` fields.
  - Prevented crash on missing attributes like `trace_id`.

5. **Gemini dependency crash:**
  - Removed hard runtime dependency on `google.api_core` exception classes in pipeline Gemini path.
  - Replaced with robust generic exception handling + clearer error text.

6. **Conversational search behavior:**
  - Updated conversational prompt to avoid false “I can’t browse/search” claims when web context is attached.
  - Added safeguard retry when model still claims no web access despite `[WEB_CONTEXT]`.

7. **PDF web-fetch quality fix:**
  - Added PDF-aware extraction in `_fetch_web_excerpt()`.
  - Added `pypdf` dependency for text extraction.
  - Prevents raw `%PDF-1.x` binary streams from being injected as context when user shares PDF URLs.

8. **Frontend agent-chat UX fixes:**
  - Agent modal compose input upgraded to multiline textarea behavior.
  - Added immediate user-message rendering in agent chat so sent text appears instantly (before AI reply).
  - Added stronger fetch/non-JSON error handling in frontend API caller.

9. **Main chat / scroll stability improvements:**
  - Added key flexbox containment constraints (`min-height: 0` / bounds fixes) to reduce scrollbar thrash and resizing jitter.

10. **Naming cleanup for conversational agents:**
   - Renamed “Bard” to “Guide” across active runtime paths to prevent provider-identity confusion.

### Operational Notes
- Prefer running app with project venv (`venv/bin/python app.py`) so new dependencies (e.g. `pypdf`) are available.
- After any backend change: compile-check + restart server.
- If UI appears unchanged after edits: hard refresh browser and verify correct Python process is running.

---

## 📋 Session Summary

### What We Built Today
1. **Docker Support** — Added `Dockerfile` and `docker-compose.yml` for one-command deployment
2. **Mobile-First UI** — Implemented responsive design for all modern phones (1264×2780, iPhone, Pixel, Galaxy, OnePlus)
3. **Bottom Navigation Bar** — Mobile-only nav with Settings, Memory, Projects, Workshop, New Chat buttons
4. **Mobile Control Pills** — Horizontal scroll pills for mode/model selection on mobile
5. **Text Overflow Fix** — Fixed message bubble text being cut off with proper word-break CSS

### Key Technologies
- **Backend:** Python 3.11, Flask, Flask-SocketIO
- **Frontend:** HTML5, CSS3 (Glassmorphism + Prism design), Vanilla JavaScript
- **Deployment:** Docker, GitHub, localhost:5000
- **Mobile Support:** Responsive breakpoints at 900px, 768px, 430px, 375px

---

## 🛠 What Worked Well (Best Practices)

### 1. **Git Workflow — Terminal Stuck Issues**
**Problem:** Nano editor getting stuck during merge/rebase operations  
**Solution That Worked:**
```bash
# Kill nano forcefully
pkill -9 nano 2>/dev/null

# Abort stuck operations
git rebase --abort 2>/dev/null
git merge --abort 2>/dev/null

# Use GIT_EDITOR=true to skip editor prompts
GIT_EDITOR=true git commit --no-edit -m "message"

# Soft reset to align with remote before re-committing
git fetch origin
git reset --soft origin/master
git add -A
git commit -m "message"
git push origin master
```
**Lesson:** Always use `git reset --soft` when local is behind remote — it preserves your changes while aligning the branch.

### 2. **Docker Setup**
**What We Did:**
- Created minimal `Dockerfile` using `python:3.11-slim`
- Set up `docker-compose.yml` with volume mounts for persistent data
- Used `.env.example` for API key templates

**Best Practices:**
```dockerfile
# Copy requirements FIRST for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Then copy app code
COPY . .
```

### 3. **Mobile Responsive Design**
**Key Decisions:**
- Used `100dvh` (dynamic viewport height) instead of `100vh` for mobile browser chrome
- Overlay sidebar instead of shifting layout on mobile (`padding-left: 0 !important`)
- `min-height: 44px` for all touch targets (Apple/Google standards)
- `font-size: 16px` on inputs to prevent iOS auto-zoom

**CSS Breakpoints Used:**
```css
@media (max-width: 900px) { /* Hide less-used buttons */ }
@media (max-width: 768px) { /* Full mobile UI chrome */ }
@media (max-width: 430px) { /* Standard phone widths */ }
@media (max-width: 375px) { /* Older small phones */ }
```

### 4. **Text Overflow Fix**
**Problem:** Message bubbles cut off text with `overflow: hidden`  
**Solution:**
```css
.msg {
  overflow: visible;  /* Not hidden */
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
}
```

### 5. **Multi-Edit Efficiency**
**Tool Used:** `multi_replace_string_in_file` for simultaneous edits  
**Benefit:** Reduced API calls, faster iterations when making 2+ related changes  
**Example:** Fixed both `.msg` and `.msg-text` in one call

### 6. **Server Management**
**Best Practice for Localhost:**
```bash
# Check if running
lsof -i :5000

# Start in background
python3 app.py &  # or use isBackground=true in terminal

# Always restart after updates
pkill -f "python3 app.py"
sleep 1
cd "/home/joe/Ai chat progect" && python3 app.py &
```

---

## 📝 Deployment Workflow (What to Do on Future Updates)

### Standard Update Procedure
```bash
# 1. Make code changes (in VS Code or edit tools)

# 2. Verify changes
git status

# 3. Stage and commit
git add -A
git commit -m "feat/fix: clear description"

# 4. Push to GitHub
git push origin master

# 5. Restart server
pkill -f "python3 app.py"
sleep 1
cd "/home/joe/Ai chat progect" && python3 app.py &
```

### If Git Gets Stuck
```bash
# Kill any editor processes
pkill -9 nano

# Abort stuck operations
git rebase --abort
git merge --abort

# Reset and retry
git fetch origin
git reset --soft origin/master
git add -A
git commit -m "message"
git push origin master
```

### Docker Deployment (for production)
```bash
# Build image
docker compose build

# Run services
docker compose up -d

# Check logs
docker compose logs -f app

# Stop
docker compose down
```

---

## 🎯 Important Files & Locations

| File | Purpose | Last Modified |
|---|---|---|
| `templates/index.html` | Main UI + CSS + JS (2495 lines) | Text overflow fix |
| `Dockerfile` | Docker image definition | Docker setup |
| `docker-compose.yml` | Service orchestration | Docker setup |
| `.env.example` | API key template | Docker setup |
| `README.md` | Project documentation | Docker + mobile sections added |
| `app.py` | Flask server | Running on :5000 |

---

## 🔧 CSS Classes & Responsive Patterns

### Mobile Navigation
```html
<!-- Bottom nav (mobile only) -->
<nav id="mobile-nav"> ... </nav>

<!-- Mobile control pills -->
<div id="mobile-controls">
  <button class="mob-pill" id="mob-pill-mode">🧠 Reasoning</button>
  <!-- ... -->
</div>
```

### Sidebar Overlay (Mobile)
```css
#sidebar {
  position: absolute;
  transform: translateX(-100%);  /* Hidden off-screen */
}
#sidebar.open {
  transform: translateX(0);  /* Slide in */
}
```

### Message Bubbles
```css
.msg {
  max-width: 82%;  /* Desktop */
  overflow: visible;  /* Show all text */
  word-break: break-word;  /* Wrap long words */
}

@media (max-width: 768px) {
  .msg { max-width: 90%; }  /* Wider on mobile */
}
```

---

## ✅ Testing Checklist (For Future Updates)

- [ ] Desktop (1920×1080): Check header buttons, modals, sidebar
- [ ] Tablet (768px): Check that mobile UI appears correctly
- [ ] Mobile Portrait (430px): Check bottom nav, text bubbles, input bar
- [ ] Mobile Portrait (375px): Check cramped layout, pill text visibility
- [ ] Long Messages: Verify text wraps and is fully visible
- [ ] Code Blocks: Ensure syntax highlighting and scrolling works
- [ ] Themes: Test all 8 themes on both desktop and mobile
- [ ] Sidebar: Tap to open/close, backdrop tap-to-close on mobile
- [ ] API Keys: Settings modal opens, keys save to localStorage
- [ ] Localhost: Server starts without errors, app loads at http://localhost:5000

---

## 🚀 Quick Reference: Command Snippets

### Start Server
```bash
cd "/home/joe/Ai chat progect" && python3 app.py &
```

### Update & Deploy
```bash
cd "/home/joe/Ai chat progect" && \
git add -A && \
git commit -m "message" && \
git push origin master && \
pkill -f "python3 app.py"; sleep 1; python3 app.py &
```

### GitHub Repository
```
https://github.com/Unrivalled-1/Reasoning-wrapper
```

### Localhost URL
```
http://localhost:5000
```

---

## 💡 Lessons Learned

1. **Always soft-reset when behind remote** — Preserves local work while aligning branches
2. **Mobile-first CSS breakpoints** — Start with smallest devices, work up to desktop
3. **Viewport meta tag is critical** — `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
4. **Touch targets need min 44px** — Apple/Google accessibility guidelines
5. **Avoid overflow:hidden on user-generated content** — Use `overflow: visible` + word-break instead
6. **Use 100dvh instead of 100vh** — Accounts for mobile browser chrome
7. **Sidebar overlays > layout shifts on mobile** — Better UX, no jarring movement
8. **Volume mounts in Docker** — Persist data even if container restarts
9. **Test on real devices** — CSS media queries don't catch all edge cases
10. **Keep git history clean** — Clear commit messages, frequent small commits

---

## 📞 Support Notes

**If Server Won't Start:**
```bash
# Check for port conflicts
lsof -i :5000

# Kill any lingering processes
pkill -f python3

# Check dependencies
pip install -r requirements.txt

# Try starting again
python3 app.py
```

**If Git Operations Fail:**
```bash
# Hard reset to clean state (CAUTION: loses local uncommitted changes)
git reset --hard origin/master

# Or use soft reset (preserves changes)
git reset --soft origin/master
```

**If Docker Needed:**
```bash
# Make sure Docker is installed and running
docker --version
docker-compose --version

# Then build & run
docker compose up --build
```

---

## 🎓 For Next Session

**Remember to:**
1. ✅ Restart localhost after each update
2. ✅ Check git status before committing
3. ✅ Test on mobile (use DevTools device emulation or real phone)
4. ✅ Push to GitHub after every significant change
5. ✅ Use `multi_replace_string_in_file` when making 2+ related edits
6. ✅ Keep track of what works well in this doc

**Areas to Explore:**
- [ ] Add PWA support for offline functionality
- [ ] Implement service workers for caching
- [ ] Add haptic feedback on mobile buttons
- [ ] Test on actual devices (not just browser emulation)
- [ ] Optimize images for mobile
- [ ] Add dark mode override for system preference
- [ ] Implement gesture controls (swipe for sidebar)

---

**Last Updated:** February 25, 2026 @ 21:28 UTC  
**Server Status:** ✅ Running on http://localhost:5000  
**GitHub Sync:** ✅ Latest commit pushed  
**Mobile Tested:** ✅ Responsive on 430px–1264px

## 📌 Session Addendum — May 11, 2026 (Refactoring & Theme Glow Up)

### Major Issues Found + Fixed
1. **Index Template Refactoring:**
  - `templates/index.html` had grown excessively large (~450KB). 
  - Restructured the frontend by running utility split scripts (`split_js.py`, `split_ui.py`, `split_modals.py`).
  - Extracted JavaScript into `static/js/main.js`.
  - Extracted CSS styling into `static/css/main.css`.
  - Extracted HTML modals into separate files under `templates/partials/`.
  - Result: `index.html` reduced to ~24KB, significantly improving maintainability.

2. **Template Serving Confusion Fixed:**
  - Diagnosed that `index.html` was properly being served via `@app.route("/")`, but verified edits via a visible banner injection test safely removed after confirmation.

### Features Added
- **Enhanced Theme Glow Effects:**
  - Updated `static/css/main.css` to add stronger, smoother glowing backgrounds behind the chat container and decorative orbs depending on active themes, making the UI visuals feel significantly more modern and polished.

## 📌 Session Addendum — June 5, 2026 (Agentic Tooling & Workshop Architecture)

### Major Architectural Features Added
1. **Agentic Web Search Infrastructure (`_llm_decide_search_query`)**
   - Implemented a pre-routing "Search Planner" that evaluates if a user's prompt requires live web context.
   - If required, it outputs a `<search>` tag, which triggers `_duckduckgo_search` to fetch the top 3 results and extracts excerpts up to 8000 characters using `pypdf` / `BeautifulSoup`.
   - Results are automatically injected into the augmented user prompt before the main LLM processes it.

2. **Custom Mode Model Locking (`step_model`)**
   - Enhanced the Agent Workshop to support heterogeneous multi-agent pipelines.
   - Added a "Lock Step Models" toggle in the UI (`usePerStepModels`).
   - `run_custom_mode_chat` was modified to dynamically extract and assign the correct `step_model` to each node based on the pipeline configuration, gracefully falling back to the global active model.

3. **Agent Abilities Framework & Feed-Forward Pipeline**
   - Replaced basic Custom Mode generation with a powerful "Feed-Forward" tool architecture.
   - Agents can be assigned specific toggles in the Workshop: **Web Search**, **Read Calendar**, **Read Email**, and **Route / Skip**.
   - **Execution Hook:** When an agent invokes a tool (e.g. `<email_pull/>`), the execution loop intercepts the text generation, runs the associated backend Python method (e.g., IMAP inbox fetch), and bundles the raw data into `prior_outputs`.
   - **Forwarding:** This data is routed to the *next* agent in the circuit, allowing specialized "Retriever" agents to pass their fetched state directly into "Synthesizer" agents without wasting cycles attempting to summarize the raw payload themselves.

### Fixes
- Resolved `NameError: name 'get_active_client' is not defined` causing 500 crashes on all chat requests by hoisting explicit client instantiation logic (`is_gemini`, `is_local`, `InferenceClient`) into `api_chat` before the Search Planner is executed.
