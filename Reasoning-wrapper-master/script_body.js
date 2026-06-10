  // ── Browser-Side Memory (LocalStorage) ───────────────────────────────────
  // We mirror the chat history here so it persists across refreshes.
  // Structure: 
  // vibe_api_key: string
  // vibe_hf_api_key: string
  // vibe_chat_store_v1: { 
  //    currentId: "...", 
  //    sessions: { [id]: { timestamp: ..., title: "...", messages: [...] } } 
  // }
  // vibe_chat_mode: "reasoning" | "conversational" | "direct"
  // vibe_custom_modes_v1: [{id,name,agents:[{name,persona,files,temperature}]}]
  // vibe_include_trace_prompts: "1" | "0"
  // vibe_projects_v1: [{id,title,lang,code,created_at}]
  
  const KEY_API = 'vibe_api_key';
  const KEY_HF_API = 'vibe_hf_api_key';
  const KEY_STORE = 'vibe_chat_store_v1';
  const KEY_MODE = 'vibe_chat_mode';
  const KEY_MODEL = 'vibe_selected_model';
  const KEY_PROJECTS = 'vibe_projects_v1';
  const KEY_CUSTOM_MODES = 'vibe_custom_modes_v1';
  const KEY_TRACE_PROMPTS = 'vibe_include_trace_prompts';
  const KEY_WEB_AUTO = 'vibe_web_auto_search';
  const KEY_LOOP_MEMORY = 'vibe_loop_memory_v1';
  const KEY_MISSION_CONTROL = 'vibe_mission_control_enabled';
  const KEY_MISSION_PROJECTS = 'vibe_mission_projects_v1';
  const KEY_MISSION_AGENTS = 'vibe_mission_agents_v1';
  const KEY_MISSION_FILES = 'vibe_mission_project_files_v1';
  const KEY_MISSION_WIDGET_ORDER = 'vibe_mission_widget_order_v1';
  const KEY_MISSION_WIDGET_SIZES = 'vibe_mission_widget_sizes_v1';
  const KEY_MISSION_WIDGET_POSITIONS = 'vibe_mission_widget_positions_v1';
  const KEY_MISSION_MISC_TILES = 'vibe_mission_misc_tiles_v1';

  const APP_BUILD_CONTEXT =
    'APP DEV CONTEXT: Build production-like apps with clear file structure, an index entry file, reusable modules/components, state handling, API layer, validation, error handling, and a run/test checklist. Prefer multi-file output with explicit file paths and complete code per file.';

  /* ── Toast Notifications ─────────────────────────────────── */
  function showToast(msg, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => {
      t.classList.add('fadeout');
      t.addEventListener('animationend', () => t.remove());
    }, duration);
  }

  const BUILTIN_MODES = [
    { id: 'reasoning', name: '🧠 Reasoning', agents: 7, builtin: true },
    { id: 'reasoning_fast', name: '⚡ Fast Reasoning', agents: 4, builtin: true },
    { id: 'reasoning_loop', name: '🔁 Looping Agent', agents: 2, builtin: true },
    { id: 'conversational', name: '🎭 Conversational', agents: 2, builtin: true },
    { id: 'direct', name: '⚡ Direct', agents: 1, builtin: true },
  ];

  function loadCustomModes() {
    try {
      const items = JSON.parse(localStorage.getItem(KEY_CUSTOM_MODES) || '[]');
      return Array.isArray(items) ? items : [];
    } catch (_) {
      return [];
    }
  }

  function saveCustomModes(items) {
    localStorage.setItem(KEY_CUSTOM_MODES, JSON.stringify(items || []));
  }

  function loadMissionProjects() {
    try {
      const items = JSON.parse(localStorage.getItem(KEY_MISSION_PROJECTS) || '[]');
      return Array.isArray(items) ? items : [];
    } catch (_) {
      return [];
    }
  }

  function saveMissionProjects(items) {
    localStorage.setItem(KEY_MISSION_PROJECTS, JSON.stringify(items || []));
  }

  function loadMissionAgents() {
    try {
      const items = JSON.parse(localStorage.getItem(KEY_MISSION_AGENTS) || '[]');
      return Array.isArray(items) ? items : [];
    } catch (_) {
      return [];
    }
  }

  function saveMissionAgents(items) {
    localStorage.setItem(KEY_MISSION_AGENTS, JSON.stringify(items || []));
  }

  function loadMissionFiles() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY_MISSION_FILES) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (_) {
      return {};
    }
  }

  function saveMissionFiles(data) {
    localStorage.setItem(KEY_MISSION_FILES, JSON.stringify(data || {}));
  }

  function loadMissionWidgetOrder() {
    try {
      const arr = JSON.parse(localStorage.getItem(KEY_MISSION_WIDGET_ORDER) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function saveMissionWidgetOrder(arr) {
    localStorage.setItem(KEY_MISSION_WIDGET_ORDER, JSON.stringify(arr || []));
  }

  function loadMissionWidgetSizes() {
    try {
      const obj = JSON.parse(localStorage.getItem(KEY_MISSION_WIDGET_SIZES) || '{}');
      if (!obj || typeof obj !== 'object') return {};
      const normalized = {};
      Object.entries(obj).forEach(([k, v]) => {
        normalized[k] = { x: Number(v?.x || 1), y: Number(v?.y || 1) };
      });
      return normalized;
    } catch (_) {
      return {};
    }
  }

  function saveMissionWidgetSizes(obj) {
    localStorage.setItem(KEY_MISSION_WIDGET_SIZES, JSON.stringify(obj || {}));
  }

  function loadMissionWidgetPositions() {
    try {
      const obj = JSON.parse(localStorage.getItem(KEY_MISSION_WIDGET_POSITIONS) || '{}');
      return obj && typeof obj === 'object' ? obj : {};
    } catch (_) {
      return {};
    }
  }

  function saveMissionWidgetPositions(obj) {
    localStorage.setItem(KEY_MISSION_WIDGET_POSITIONS, JSON.stringify(obj || {}));
  }

  function loadMissionMiscTiles() {
    try {
      const arr = JSON.parse(localStorage.getItem(KEY_MISSION_MISC_TILES) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function saveMissionMiscTiles(arr) {
    localStorage.setItem(KEY_MISSION_MISC_TILES, JSON.stringify(arr || []));
  }

  function getAllModes() {
    const custom = loadCustomModes().map(m => ({
      id: m.id,
      name: `🧪 ${m.name || 'Custom Mode'}`,
      agents: Array.isArray(m.agents) ? m.agents.length : 0,
      builtin: false,
    }));
    return [...BUILTIN_MODES, ...custom];
  }

  function getCustomModeById(modeId) {
    return loadCustomModes().find(m => m.id === modeId) || null;
  }

  function populateModeSelect() {
    if (!modeSelect) return;
    const current = localStorage.getItem(KEY_MODE) || 'reasoning';
    const modes = getAllModes();
    modeSelect.innerHTML = '';
    modes.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.agents})`;
      modeSelect.appendChild(opt);
    });
    const exists = modes.some(m => m.id === current);
    modeSelect.value = exists ? current : 'reasoning';
    setMode(modeSelect.value);
  }
  
  // API Key Manager
  const apiKeyInput = document.getElementById('api-key-input');
  const hfApiKeyInput = document.getElementById('hf-api-key-input');
  const tracePromptsToggle = document.getElementById('trace-prompts-toggle');
  const missionControlToggle = document.getElementById('mission-control-toggle');
  
  function getApiKey() { return localStorage.getItem(KEY_API) || ''; }
  function setApiKey(k) { localStorage.setItem(KEY_API, k.trim()); }
  function getHfApiKey() { return localStorage.getItem(KEY_HF_API) || ''; }
  function setHfApiKey(k) { localStorage.setItem(KEY_HF_API, k.trim()); }
  function getMode() {
    const mode = localStorage.getItem(KEY_MODE) || 'reasoning';
    const valid = getAllModes().map(m => m.id);
    return valid.includes(mode) ? mode : 'reasoning';
  }
  function setMode(m) {
    const valid = getAllModes().map(x => x.id);
    const safe = valid.includes(m) ? m : 'reasoning';
    localStorage.setItem(KEY_MODE, safe);
  }
  function getSelectedModel() { return localStorage.getItem(KEY_MODEL) || ''; }
  function setSelectedModel(m) { if (m) localStorage.setItem(KEY_MODEL, m); }
  function getIncludeTracePrompts() { return localStorage.getItem(KEY_TRACE_PROMPTS) === '1'; }
  function setIncludeTracePrompts(v) { localStorage.setItem(KEY_TRACE_PROMPTS, v ? '1' : '0'); }
  function getMissionControlEnabled() {
    return localStorage.getItem(KEY_MISSION_CONTROL) === '1';
  }
  function setMissionControlEnabled(v) {
    localStorage.setItem(KEY_MISSION_CONTROL, v ? '1' : '0');
  }
  function getWebAutoSearch() {
    const raw = localStorage.getItem(KEY_WEB_AUTO);
    return raw === null ? true : raw === '1';
  }
  function setWebAutoSearch(v) { localStorage.setItem(KEY_WEB_AUTO, v ? '1' : '0'); }

  function hasAnyApiKey() {
    return !!(getApiKey().trim() || getHfApiKey().trim());
  }

  function inferProvider(modelId = '') {
    return modelId.startsWith('gemini-') ? 'gemini' : 'huggingface';
  }

  function hasProviderKey(provider) {
    return provider === 'gemini' ? !!getApiKey().trim() : !!getHfApiKey().trim();
  }

  function refreshModelOptionMeta() {
    if (!modelSelect) return;
    for (const opt of Array.from(modelSelect.options || [])) {
      if (!opt.dataset.baseLabel) opt.dataset.baseLabel = opt.textContent.trim();

      const provider = opt.dataset.provider || inferProvider(opt.value || '');
      const hasKey = hasProviderKey(provider);
      const credit = Number(opt.dataset.credit || '1');
      const creditLabel = Number.isFinite(credit) ? credit.toFixed(2).replace(/\.00$/, '') : '1';

      opt.textContent = `${hasKey ? '✓ ' : ''}${opt.dataset.baseLabel} · x${creditLabel}`;
      opt.title = `${provider === 'gemini' ? 'Gemini' : 'Hugging Face'} · credit x${creditLabel}${hasKey ? ' · key available' : ' · key missing'}`;
    }
  }

  function loadProjects() {
    try {
      return JSON.parse(localStorage.getItem(KEY_PROJECTS) || '[]');
    } catch (_) {
      return [];
    }
  }
  function saveProjects(items) {
    localStorage.setItem(KEY_PROJECTS, JSON.stringify(items));
  }
  
  if (apiKeyInput) apiKeyInput.value = getApiKey();
  if (hfApiKeyInput) hfApiKeyInput.value = getHfApiKey();
  if (tracePromptsToggle) {
    tracePromptsToggle.checked = getIncludeTracePrompts();
    tracePromptsToggle.addEventListener('change', (e) => {
      setIncludeTracePrompts(!!e.target.checked);
    });
  }
  if (missionControlToggle) {
    missionControlToggle.checked = getMissionControlEnabled();
    missionControlToggle.addEventListener('change', (e) => {
      setMissionControlEnabled(!!e.target.checked);
      syncMissionButton();
    });
  }
  apiKeyInput?.addEventListener('input', (e) => {
    setApiKey(e.target.value);
    refreshModelOptionMeta();
  });
  hfApiKeyInput?.addEventListener('input', (e) => {
    setHfApiKey(e.target.value);
    refreshModelOptionMeta();
  });

  // Chat Store Manager
  function loadStore() {
    try {
      const raw = localStorage.getItem(KEY_STORE);
      if (!raw) return { currentId: null, sessions: {} };
      return JSON.parse(raw);
    } catch(e) { return { currentId: null, sessions: {} }; }
  }
  
  function saveStore(s) {
    try { localStorage.setItem(KEY_STORE, JSON.stringify(s)); } catch(e){ console.error(e); }
  }

  let store = loadStore();
  
  // Ensure current session exists
  if (!store.currentId || !store.sessions[store.currentId]) {
    const newId = Date.now().toString();
    store.sessions[newId] = { timestamp: Date.now(), title: 'New Chat', messages: [] };
    store.currentId = newId;
    saveStore(store);
  }

  let sessionMessages = store.sessions[store.currentId].messages;

  let missionProjects = loadMissionProjects();
  let missionAgents = loadMissionAgents();
  let missionFiles = loadMissionFiles();
  let missionWidgetOrder = loadMissionWidgetOrder();
  let missionWidgetSizes = loadMissionWidgetSizes();
  let missionWidgetPositions = loadMissionWidgetPositions();
  let missionMiscTiles = loadMissionMiscTiles();
  let missionSelectedFileId = '';
  if (!missionProjects.length) {
    missionProjects = [{ id: 'proj-default', name: 'Default Project', created_at: Date.now(), chat_ids: [store.currentId] }];
    saveMissionProjects(missionProjects);
  }

  function saveCurrentChat() {
    if (!store.currentId) return;
    store.sessions[store.currentId].messages = sessionMessages;
    // Update title based on first user message if needed
    if (store.sessions[store.currentId].title === 'New Chat' && sessionMessages.length > 0) {
      const first = sessionMessages.find(m => m.role === 'user');
      if (first) {
        store.sessions[store.currentId].title = first.content.slice(0, 30) + (first.content.length>30?'...':'');
      }
    }
    store.sessions[store.currentId].timestamp = Date.now();
    saveStore(store);
    renderHistory();
  }

  function startNewChat() {
    const newId = Date.now().toString();
    store.sessions[newId] = { timestamp: Date.now(), title: 'New Chat', messages: [] };
    store.currentId = newId;
    saveStore(store);
    window.location.reload();
  }
  
  function switchChat(id) {
    if (store.sessions[id]) {
      store.currentId = id;
      saveStore(store);
      window.location.reload();
    }
  }

  // Render Sidebar
  const historyList = document.getElementById('history-list');
  const main = document.getElementById('main');

  function deleteChat(id) {
    const sess = store.sessions[id];
    if (!sess) return;

    const title = sess.title || 'Untitled';
    if (!confirm(`Delete chat "${title}"?`)) return;

    const deletingCurrent = id === store.currentId;
    delete store.sessions[id];

    if (Object.keys(store.sessions).length === 0) {
      const newId = Date.now().toString();
      store.sessions[newId] = { timestamp: Date.now(), title: 'New Chat', messages: [] };
      store.currentId = newId;
      saveStore(store);
      window.location.reload();
      return;
    }

    if (deletingCurrent) {
      const nextId = Object.keys(store.sessions)
        .sort((a,b) => store.sessions[b].timestamp - store.sessions[a].timestamp)[0];
      store.currentId = nextId;
      saveStore(store);
      window.location.reload();
      return;
    }

    saveStore(store);
    renderHistory();
  }

  function renderHistory() {
    historyList.innerHTML = '';
    const ids = Object.keys(store.sessions).sort((a,b) => store.sessions[b].timestamp - store.sessions[a].timestamp);
    ids.forEach(id => {
      const sess = store.sessions[id];
      const div = document.createElement('div');
      div.className = 'history-item' + (id === store.currentId ? ' active' : '');

      const title = document.createElement('span');
      title.className = 'history-title';
      title.textContent = sess.title || 'Untitled';

      const del = document.createElement('button');
      del.className = 'history-delete';
      del.type = 'button';
      del.title = 'Delete chat';
      del.textContent = '✕';
      del.onclick = (e) => {
        e.stopPropagation();
        deleteChat(id);
      };

      div.appendChild(title);
      div.appendChild(del);
      div.onclick = () => { if(id !== store.currentId) switchChat(id); };
      historyList.appendChild(div);
    });
    if (missionPage?.style.display === 'block') {
      renderMissionProjects();
    }
  }

  function _missionLastAssistantTraceBundle(messages = []) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role === 'assistant' && Array.isArray(m.traces) && m.traces.length) {
        return m;
      }
    }
    return null;
  }

  function _sessionSummaryForAgent(agent) {
    const sid = String(agent?.chat_id || '').trim();
    const sess = sid ? store.sessions?.[sid] : null;
    if (!sess) return { title: '(no linked chat)', messages: [] };
    return { title: sess.title || 'Untitled', messages: sess.messages || [] };
  }

  function _agentUsage(agent) {
    const summary = _sessionSummaryForAgent(agent);
    const msgs = summary.messages || [];
    const userCount = msgs.filter(m => m?.role === 'user').length;
    const assistantCount = msgs.filter(m => m?.role === 'assistant').length;
    let apiCalls = 0;
    msgs.forEach(m => {
      apiCalls++; // The message itself
      if (Array.isArray(m.traces)) {
        apiCalls += m.traces.length; // Each reasoning step/trace is an API call
      }
    });
    return { userCount, assistantCount, total: msgs.length, apiCalls };
  }

  function _projectFiles(projectId) {
    const pid = String(projectId || '');
    if (!missionFiles[pid]) {
      missionFiles[pid] = [
        { id: 'vision', name: 'VISION.md', content: '# Vision\nDescribe what you want this project to become.' },
        { id: 'records', name: 'RECORDS.md', content: '# Records\nImportant decisions, updates, and outcomes.' },
        { id: 'shared', name: 'SHARED_CONTEXT.md', content: '# Shared Context\nAgents communicate through this file.' },
        { id: 'scope', name: 'SCOPE.md', content: '# Scope\nRequirements, constraints, and acceptance criteria.' },
      ];
      saveMissionFiles(missionFiles);
    }
    return missionFiles[pid];
  }

  function renderMissionFiles(projectId) {
    if (!missionFileList || !missionFileName || !missionFileEditor) return;
    const files = _projectFiles(projectId);
    let dragFileId = '';
    missionFileList.innerHTML = '';
    if (!files.length) {
      missionFileList.innerHTML = '<div style="opacity:.8;font-size:.72rem;">No files yet.</div>';
      missionFileName.value = '';
      missionFileEditor.value = '';
      return;
    }

    if (!missionSelectedFileId || !files.some(f => f.id === missionSelectedFileId)) {
      missionSelectedFileId = files[0].id;
    }

    files.forEach(f => {
      const b = document.createElement('button');
      b.className = 'hdr-btn';
      b.draggable = true;
      b.style.textAlign = 'left';
      b.style.borderColor = f.id === missionSelectedFileId ? 'var(--primary)' : 'var(--glass-border)';
      b.textContent = f.name || 'file.md';
      b.addEventListener('click', () => {
        missionSelectedFileId = f.id;
        renderMissionFiles(projectId);
      });
      b.addEventListener('dragstart', () => {
        dragFileId = f.id;
      });
      b.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      b.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetId = f.id;
        if (!dragFileId || dragFileId === targetId) return;
        const from = files.findIndex(x => x.id === dragFileId);
        const to = files.findIndex(x => x.id === targetId);
        if (from < 0 || to < 0) return;
        const [moved] = files.splice(from, 1);
        files.splice(to, 0, moved);
        saveMissionFiles(missionFiles);
        renderMissionFiles(projectId);
      });
      missionFileList.appendChild(b);
    });

    const selected = files.find(f => f.id === missionSelectedFileId) || files[0];
    missionFileName.value = selected.name || '';
    missionFileEditor.value = selected.content || '';
  }

  function applyMissionWidgetBoard() {
    if (!missionWidgetGrid) return;
    const widgets = Array.from(missionWidgetGrid.querySelectorAll('.mission-widget'))
      .filter(w => getComputedStyle(w).display !== 'none');
    if (!widgets.length) return;

    syncMissionGridSquares();

    const domIds = widgets.map(w => w.dataset.widgetId || '').filter(Boolean);
    missionWidgetOrder = [...missionWidgetOrder.filter(id => domIds.includes(id)), ...domIds.filter(id => !missionWidgetOrder.includes(id))];
    saveMissionWidgetOrder(missionWidgetOrder);

    // Apply order
    const order = missionWidgetOrder.filter(Boolean);
    order.forEach(id => {
      const el = missionWidgetGrid.querySelector(`.mission-widget[data-widget-id="${id}"]`);
      if (el) missionWidgetGrid.appendChild(el);
    });

    const occupied = new Set();
    const all = Array.from(missionWidgetGrid.querySelectorAll('.mission-widget'))
      .filter(w => getComputedStyle(w).display !== 'none');

    // First pass: keep saved positions stable (do not repack unrelated tiles)
    all.forEach(w => {
      const id = w.dataset.widgetId;
      const sz = _normalizeWidgetSize(missionWidgetSizes[id]);
      w.classList.remove('w-size-1x1', 'w-size-2x1', 'w-size-1x2', 'w-size-2x2');
      _setWidgetSpan(w, sz.x, sz.y);

      const hasSaved = missionWidgetPositions[id] && typeof missionWidgetPositions[id] === 'object';
      if (!hasSaved) return;

      const fixed = _normalizeWidgetPos(missionWidgetPositions[id]);
      _setWidgetPlacement(w, fixed.col, fixed.row);
      _occupyRect(occupied, Number(w.dataset.col || 1), Number(w.dataset.row || 1), sz.x, sz.y);
    });

    // Second pass: assign first open cells for tiles without saved positions
    all.forEach(w => {
      const id = w.dataset.widgetId;
      if (missionWidgetPositions[id] && typeof missionWidgetPositions[id] === 'object') return;
      const sz = _normalizeWidgetSize(missionWidgetSizes[id]);
      const next = _findNextOpenCell(occupied, sz.x, sz.y);
      missionWidgetPositions[id] = { col: next.col, row: next.row };
      _setWidgetPlacement(w, next.col, next.row);
      _occupyRect(occupied, next.col, next.row, sz.x, sz.y);
    });

    saveMissionWidgetSizes(missionWidgetSizes);
    saveMissionWidgetPositions(missionWidgetPositions);
    renderMissionGridGuide();
  }

  function syncMissionGridSquares() {
    if (!missionWidgetGrid) return;
    const styles = getComputedStyle(missionWidgetGrid);
    const colTracks = (styles.gridTemplateColumns || '').split(' ').filter(Boolean);
    const cols = colTracks.length || 1;
    const gap = parseFloat(styles.columnGap || styles.gap || '10') || 10;
    const firstPx = parseFloat(colTracks[0] || '0');
    const rawCell = Number.isFinite(firstPx) && firstPx > 0
      ? firstPx
      : ((missionWidgetGrid.clientWidth || missionWidgetGrid.getBoundingClientRect().width || 720) - gap * (cols - 1)) / cols;
    const cell = Math.max(140, Math.min(280, Math.round(rawCell || 180)));
    missionWidgetGrid.style.gridAutoRows = `${cell}px`;
    renderMissionGridGuide();
  }

  function renderMissionGridGuide() {
    if (!missionWidgetGrid || !missionGridGuide) return;
    const cols = _gridColCount();
    const maxRowFromTiles = Math.max(
      8,
      ...Array.from(missionWidgetGrid.querySelectorAll('.mission-widget'))
        .filter(w => getComputedStyle(w).display !== 'none')
        .map(w => {
        const row = Number(w.dataset.row || 1);
        const spanY = Number(w.dataset.spanY || 1);
        return row + spanY;
      })
    );
    missionGridGuide.style.gridTemplateColumns = getComputedStyle(missionWidgetGrid).gridTemplateColumns;
    missionGridGuide.style.gridAutoRows = getComputedStyle(missionWidgetGrid).gridAutoRows;
    missionGridGuide.innerHTML = '';
    const total = cols * Math.min(120, maxRowFromTiles + 8);
    for (let i = 0; i < total; i += 1) {
      const c = document.createElement('div');
      c.className = 'mission-grid-guide-cell';
      missionGridGuide.appendChild(c);
    }
  }

  function _gridColCount() {
    if (!missionWidgetGrid) return 1;
    const styles = getComputedStyle(missionWidgetGrid);
    return (styles.gridTemplateColumns || '').split(' ').filter(Boolean).length || 1;
  }

  function _normalizeWidgetSize(raw) {
    let x = 1;
    let y = 1;
    if (raw && typeof raw === 'object') {
      x = Number(raw.x || 1);
      y = Number(raw.y || 1);
    }
    x = Math.round(x);
    y = Math.round(y);
    return { x: Math.max(1, x), y: Math.max(1, y) };
  }

  function _normalizeWidgetPos(raw) {
    if (raw && typeof raw === 'object') {
      const col = Math.max(1, Number(raw.col || 1));
      const row = Math.max(1, Number(raw.row || 1));
      return { col, row };
    }
    return { col: 1, row: 1 };
  }

  function _setWidgetSpan(el, spanX, spanY) {
    if (!el) return;
    const maxCols = _gridColCount();
    const x = Math.max(1, Math.min(maxCols, Number(spanX || 1)));
    const y = Math.max(1, Math.min(12, Number(spanY || 1)));
    el.dataset.spanX = String(x);
    el.dataset.spanY = String(y);
  }

  function _setWidgetPlacement(el, col, row) {
    if (!el) return;
    const x = Number(el.dataset.spanX || 1);
    const y = Number(el.dataset.spanY || 1);
    const maxCols = _gridColCount();
    const c = Math.max(1, Math.min(Math.max(1, maxCols - x + 1), Number(col || 1)));
    const r = Math.max(1, Number(row || 1));
    el.dataset.col = String(c);
    el.dataset.row = String(r);
    el.style.gridColumn = `${c} / span ${x}`;
    el.style.gridRow = `${r} / span ${y}`;
  }

  function _canPlaceRect(occupied, col, row, spanX, spanY) {
    const maxCols = _gridColCount();
    const c = Math.max(1, Number(col || 1));
    const r = Math.max(1, Number(row || 1));
    const x = Math.max(1, Math.min(maxCols, Number(spanX || 1)));
    const y = Math.max(1, Number(spanY || 1));
    if (c + x - 1 > maxCols) return false;
    for (let rr = r; rr < r + y; rr += 1) {
      for (let cc = c; cc < c + x; cc += 1) {
        if (occupied.has(`${cc}:${rr}`)) return false;
      }
    }
    return true;
  }

  function _occupyRect(occupied, col, row, spanX, spanY) {
    const c = Math.max(1, Number(col || 1));
    const r = Math.max(1, Number(row || 1));
    const x = Math.max(1, Number(spanX || 1));
    const y = Math.max(1, Number(spanY || 1));
    for (let rr = r; rr < r + y; rr += 1) {
      for (let cc = c; cc < c + x; cc += 1) {
        occupied.add(`${cc}:${rr}`);
      }
    }
  }

  function _findNextOpenCell(occupied, spanX = 1, spanY = 1) {
    const maxCols = _gridColCount();
    const x = Math.max(1, Math.min(maxCols, Number(spanX || 1)));
    const y = Math.max(1, Number(spanY || 1));
    for (let row = 1; row <= 300; row += 1) {
      for (let col = 1; col <= Math.max(1, maxCols - x + 1); col += 1) {
        if (_canPlaceRect(occupied, col, row, x, y)) return { col, row };
      }
    }
    return { col: 1, row: 1 };
  }

  function _findOpenCellFrom(occupied, startCol, startRow, spanX = 1, spanY = 1) {
    const maxCols = _gridColCount();
    const x = Math.max(1, Math.min(maxCols, Number(spanX || 1)));
    const y = Math.max(1, Number(spanY || 1));
    const c0 = Math.max(1, Math.min(Math.max(1, maxCols - x + 1), Number(startCol || 1)));
    const r0 = Math.max(1, Number(startRow || 1));
    for (let row = r0; row <= 300; row += 1) {
      for (let col = 1; col <= Math.max(1, maxCols - x + 1); col += 1) {
        const candidate = row === r0 ? ((col + c0 - 2) % Math.max(1, maxCols - x + 1)) + 1 : col;
        if (_canPlaceRect(occupied, candidate, row, x, y)) return { col: candidate, row };
      }
    }
    return { col: c0, row: r0 };
  }

  function _occupiedByOtherTiles(excludeWidgetId = '') {
    const occupied = new Set();
    const all = Array.from(missionWidgetGrid?.querySelectorAll('.mission-widget') || []);
    all.forEach(w => {
      if (getComputedStyle(w).display === 'none') return;
      const id = w.dataset.widgetId || '';
      if (!id || id === excludeWidgetId) return;
      const sx = Number(w.dataset.spanX || 1);
      const sy = Number(w.dataset.spanY || 1);
      const col = Number(w.dataset.col || 1);
      const row = Number(w.dataset.row || 1);
      _occupyRect(occupied, col, row, sx, sy);
    });
    return occupied;
  }

  function _findTopVisibleTileAtCell(col, row, excludeWidgetId = '') {
    const all = Array.from(missionWidgetGrid?.querySelectorAll('.mission-widget') || [])
      .filter(w => getComputedStyle(w).display !== 'none');
    for (const w of all) {
      const id = w.dataset.widgetId || '';
      if (!id || id === excludeWidgetId) continue;
      const c = Number(w.dataset.col || 1);
      const r = Number(w.dataset.row || 1);
      const sx = Number(w.dataset.spanX || 1);
      const sy = Number(w.dataset.spanY || 1);
      if (col >= c && col < c + sx && row >= r && row < r + sy) {
        return w;
      }
    }
    return null;
  }

  function _tileCellFromPoint(clientX, clientY) {
    if (!missionWidgetGrid) return { col: 1, row: 1 };
    const styles = getComputedStyle(missionWidgetGrid);
    const cols = _gridColCount();
    const gap = parseFloat(styles.columnGap || styles.gap || '10') || 10;
    const cellH = parseFloat(styles.gridAutoRows || '180') || 180;
    const rect = missionWidgetGrid.getBoundingClientRect();
    const padL = parseFloat(styles.paddingLeft || '0') || 0;
    const padR = parseFloat(styles.paddingRight || '0') || 0;
    const usableW = Math.max(80, rect.width - padL - padR);
    const cellW = Math.max(40, (usableW - gap * (cols - 1)) / cols);
    const stepX = cellW + gap;
    const stepY = cellH + gap;
    const rx = Math.max(0, clientX - rect.left - padL);
    const ry = Math.max(0, clientY - rect.top);
    const col = Math.max(1, Math.min(cols, Math.floor(rx / stepX) + 1));
    const row = Math.max(1, Math.floor(ry / stepY) + 1);
    return { col, row };
  }

  function _resolveDropSpotForTile(tileEl, clientX, clientY) {
    if (!tileEl) return null;
    const sx = Number(tileEl.dataset.spanX || 1);
    const sy = Number(tileEl.dataset.spanY || 1);
    const id = tileEl.dataset.widgetId || '';
    const cell = _tileCellFromPoint(clientX, clientY);
    const occupied = _occupiedByOtherTiles(id);

    // Use cursor as center anchor for larger tiles (feels more natural than top-left anchoring)
    const prefCol = cell.col - Math.floor((sx - 1) / 2);
    const prefRow = cell.row - Math.floor((sy - 1) / 2);
    const maxCols = _gridColCount();
    const minCol = 1;
    const maxCol = Math.max(1, maxCols - sx + 1);
    const baseCol = Math.max(minCol, Math.min(maxCol, prefCol));
    const baseRow = Math.max(1, prefRow);

    if (_canPlaceRect(occupied, baseCol, baseRow, sx, sy)) {
      return { col: baseCol, row: baseRow, sx, sy, exact: true };
    }

    // Find nearest valid slot around hovered area
    let best = null;
    const maxRadius = 8;
    for (let r = 1; r <= maxRadius; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const col = Math.max(minCol, Math.min(maxCol, baseCol + dx));
          const row = Math.max(1, baseRow + dy);
          if (!_canPlaceRect(occupied, col, row, sx, sy)) continue;
          const score = Math.abs(dx) + Math.abs(dy);
          if (!best || score < best.score) {
            best = { col, row, sx, sy, exact: false, score };
          }
        }
      }
      if (best) break;
    }
    return best ? { col: best.col, row: best.row, sx, sy, exact: false } : null;
  }

  let __missionDnDState = {
    dragId: '',
    resizingWidgetId: '',
    dragHoverSpot: null,
    dragArmId: '',
    lastDragClientX: 0,
    lastDragClientY: 0
  };

  function bindMissionWidgetDnD() {
    if (!missionWidgetGrid) return;
    const widgets = Array.from(missionWidgetGrid.querySelectorAll('.mission-widget'));

    const hideDropPreview = () => {
      if (!missionDropPreview) return;
      missionDropPreview.style.display = 'none';
      missionDropPreview.style.gridColumn = '';
      missionDropPreview.style.gridRow = '';
      __missionDnDState.dragHoverSpot = null;
    };

    const showDropPreview = (col, row, sx, sy) => {
      if (!missionDropPreview) return;
      missionDropPreview.style.display = 'block';
      missionDropPreview.style.gridColumn = `${col} / span ${sx}`;
      missionDropPreview.style.gridRow = `${row} / span ${sy}`;
    };

    if (missionWidgetGrid.dataset.dndBound !== '1') {
      missionWidgetGrid.dataset.dndBound = '1';
      missionWidgetGrid.addEventListener('dragenter', (e) => {
        if (!__missionDnDState.dragId) return;
        e.preventDefault();
      });
      missionWidgetGrid.addEventListener('dragover', (e) => {
        if (!__missionDnDState.dragId) return;
        e.preventDefault();
        __missionDnDState.lastDragClientX = Number(e.clientX || 0);
        __missionDnDState.lastDragClientY = Number(e.clientY || 0);
        try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}

        const dragEl = missionWidgetGrid.querySelector(`.mission-widget[data-widget-id="${__missionDnDState.dragId}"]`);
        if (!dragEl) {
          hideDropPreview();
          return;
        }
        const spot = _resolveDropSpotForTile(dragEl, e.clientX, e.clientY);
        if (spot) {
          __missionDnDState.dragHoverSpot = spot;
          showDropPreview(spot.col, spot.row, spot.sx, spot.sy);
          if (missionDropPreview) {
            missionDropPreview.style.opacity = spot.exact ? '1' : '0.72';
          }
        } else {
          const cell = _tileCellFromPoint(e.clientX, e.clientY);
          const victim = _findTopVisibleTileAtCell(cell.col, cell.row, __missionDnDState.dragId);
          if (victim) {
            __missionDnDState.dragHoverSpot = null;
            const sx = Number(dragEl.dataset.spanX || 1);
            const sy = Number(dragEl.dataset.spanY || 1);
            showDropPreview(Number(victim.dataset.col || 1), Number(victim.dataset.row || 1), sx, sy);
            if (missionDropPreview) missionDropPreview.style.opacity = '0.55';
          } else {
            hideDropPreview();
          }
        }
      });
      missionWidgetGrid.addEventListener('drop', (e) => {
        if (!__missionDnDState.dragId) return;
        e.preventDefault();
        const dragEl = missionWidgetGrid.querySelector(`.mission-widget[data-widget-id="${__missionDnDState.dragId}"]`);
        if (!dragEl) {
          __missionDnDState.dragId = '';
          return;
        }
        const cx = Number(e.clientX || 0) || __missionDnDState.lastDragClientX;
        const cy = Number(e.clientY || 0) || __missionDnDState.lastDragClientY;
        const spot = __missionDnDState.dragHoverSpot || _resolveDropSpotForTile(dragEl, cx, cy);
        if (spot) {
          missionWidgetPositions[__missionDnDState.dragId] = { col: spot.col, row: spot.row };
          saveMissionWidgetPositions(missionWidgetPositions);
          applyMissionWidgetBoard();
        } else {
          const cell = _tileCellFromPoint(cx, cy);
          const victim = _findTopVisibleTileAtCell(cell.col, cell.row, __missionDnDState.dragId);
          if (victim) {
            const victimId = victim.dataset.widgetId || '';
            const fromCol = Number(dragEl.dataset.col || 1);
            const fromRow = Number(dragEl.dataset.row || 1);
            const toCol = Number(victim.dataset.col || 1);
            const toRow = Number(victim.dataset.row || 1);
            missionWidgetPositions[__missionDnDState.dragId] = { col: toCol, row: toRow };
            if (victimId) {
              missionWidgetPositions[victimId] = { col: fromCol, row: fromRow };
            }
            saveMissionWidgetPositions(missionWidgetPositions);
            applyMissionWidgetBoard();
          }
        }
        hideDropPreview();
      });
      missionWidgetGrid.addEventListener('dragleave', (e) => {
        if (!__missionDnDState.dragId) return;
        const r = missionWidgetGrid.getBoundingClientRect();
        const x = Number(e.clientX || 0);
        const y = Number(e.clientY || 0);
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return;
        hideDropPreview();
      });
    }

    const saveWidgetSize = (el) => {
      const id = el?.dataset?.widgetId || '';
      if (!id) return;
      missionWidgetSizes[id] = {
        x: Number(el.dataset.spanX || 1),
        y: Number(el.dataset.spanY || 1),
      };
      saveMissionWidgetSizes(missionWidgetSizes);
    };

    widgets.forEach(w => {
      if (w.dataset.dndBound === '1') return;
      w.dataset.dndBound = '1';
      w.draggable = true;

      let dragHandle = w.querySelector('.mission-widget-drag-handle');
      if (!dragHandle) {
        dragHandle = document.createElement('button');
        dragHandle.type = 'button';
        dragHandle.className = 'mission-widget-drag-handle';
        dragHandle.title = 'Drag tile';
        dragHandle.textContent = '⋯';
        w.appendChild(dragHandle);
      }
      dragHandle.draggable = false;

      dragHandle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        __missionDnDState.dragArmId = w.dataset.widgetId || '';
      });

      w.addEventListener('dragstart', (e) => {
        const wid = w.dataset.widgetId || '';
        if (!wid || __missionDnDState.resizingWidgetId || __missionDnDState.dragArmId !== wid) {
          e.preventDefault();
          return;
        }
        __missionDnDState.dragId = wid;
        __missionDnDState.dragHoverSpot = null;
        w.classList.add('dragging');
        try {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', wid);
          const ghost = w.cloneNode(true);
          ghost.style.position = 'fixed';
          ghost.style.top = '-9999px';
          ghost.style.left = '-9999px';
          ghost.style.width = `${Math.max(120, w.getBoundingClientRect().width)}px`;
          ghost.style.opacity = '0.92';
          ghost.style.transform = 'scale(0.98)';
          ghost.style.pointerEvents = 'none';
          document.body.appendChild(ghost);
          e.dataTransfer.setDragImage(ghost, ghost.getBoundingClientRect().width / 2, 20);
          requestAnimationFrame(() => ghost.remove());
        } catch (_) {}
      });

      w.addEventListener('dragend', () => {
        w.classList.remove('dragging');
        __missionDnDState.dragId = '';
        __missionDnDState.dragArmId = '';
        hideDropPreview();
      });

      const handle = w.querySelector('.mission-widget-resize-handle');
      handle?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        __missionDnDState.resizingWidgetId = w.dataset.widgetId || '';

        const styles = getComputedStyle(missionWidgetGrid);
        const cols = _gridColCount();
        const gap = parseFloat(styles.columnGap || styles.gap || '10') || 10;
        const cellH = parseFloat(styles.gridAutoRows || '180') || 180;
        const gridRect = missionWidgetGrid.getBoundingClientRect();
        const padL = parseFloat(styles.paddingLeft || '0') || 0;
        const padR = parseFloat(styles.paddingRight || '0') || 0;
        const usableW = Math.max(80, gridRect.width - padL - padR);
        const cellW = Math.max(40, (usableW - gap * (cols - 1)) / cols);
        const stepX = cellW + gap;
        const stepY = cellH + gap;

        const startX = e.clientX;
        const startY = e.clientY;
        const startSpanX = Number(w.dataset.spanX || 1);
        const startSpanY = Number(w.dataset.spanY || 1);
        const startCol = Number(w.dataset.col || 1);
        const startRow = Number(w.dataset.row || 1);
        try { handle.setPointerCapture?.(e.pointerId); } catch (_) {}

        const onMove = (ev) => {
          const nx = startSpanX + Math.round((ev.clientX - startX) / stepX);
          const ny = startSpanY + Math.round((ev.clientY - startY) / stepY);
          _setWidgetSpan(w, nx, ny);
          _setWidgetPlacement(w, startCol, startRow);
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          saveWidgetSize(w);
          missionWidgetPositions[w.dataset.widgetId || ''] = {
            col: Number(w.dataset.col || 1),
            row: Number(w.dataset.row || 1),
          };
          saveMissionWidgetPositions(missionWidgetPositions);
          applyMissionWidgetBoard();
          __missionDnDState.resizingWidgetId = '';
          try { handle.releasePointerCapture?.(e.pointerId); } catch (_) {}
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    });

    if (missionWidgetGrid.dataset.resizeBound !== '1') {
      missionWidgetGrid.dataset.resizeBound = '1';
    }
  }

  window.setMissionUsageTab = function(tab) {
    missionUsageActiveTab = tab;
    renderMissionUsageGraph(missionSelectedProjectId || '');
  };

  function renderMissionUsageGraph(projectId) {
    if (!missionUsageGraph) return;
    const agents = missionViewMode === 'project' ? missionAgents.filter(a => a.project_id === projectId) : missionAgents;
    if (!agents.length) {
      missionUsageGraph.innerHTML = '<div style="font-size:.72rem;opacity:.8;">Usage statistics appear once you add agents.</div>';
      return;
    }

    const tabsHtml = `
      <div style="display:flex;gap:4px;margin-bottom:8px;border-bottom:1px solid var(--border);padding-bottom:4px;">
        <button class="hdr-btn" style="flex:1;${missionUsageActiveTab==='agent'?'background:var(--primary-glow);border-color:var(--primary);color:var(--primary);':''}" onclick="setMissionUsageTab('agent')">By Agent</button>
        <button class="hdr-btn" style="flex:1;${missionUsageActiveTab==='daily'?'background:var(--primary-glow);border-color:var(--primary);color:var(--primary);':''}" onclick="setMissionUsageTab('daily')">Per Day</button>
      </div>
      <div id="mission-usage-tab-content" style="flex-grow:1;overflow:auto;"></div>
    `;
    
    // Only re-render full framework if not just updating tab contents or if missing tabs
    if (!missionUsageGraph.querySelector('#mission-usage-tab-content')) {
      missionUsageGraph.innerHTML = tabsHtml;
    } else {
      missionUsageGraph.innerHTML = tabsHtml; // refresh active states
    }

    const contentDiv = missionUsageGraph.querySelector('#mission-usage-tab-content');

    if (missionUsageActiveTab === 'agent') {
      const rows = agents.map(a => ({ agent: a, usage: _agentUsage(a) }));
      const max = Math.max(...rows.map(r => r.usage.apiCalls), 1);
      
      let html = '<div style="font-size:.72rem;color:var(--text-muted);margin-bottom:6px;">API calls per agent</div>';
      rows.forEach(({ agent, usage }) => {
        const width = Math.max(4, Math.round((usage.apiCalls / max) * 100));
        html += `<div style="display:flex;flex-direction:column;gap:2px;margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;font-size:.68rem;">
            <span>${esc(agent.name || 'Agent')}</span>
            <span>${usage.apiCalls} calls</span>
          </div>
          <div style="height:8px;border-radius:999px;background:var(--glass-border);overflow:hidden;">
            <div style="height:100%;width:${width}%;background:linear-gradient(90deg, var(--primary), #22d3ee);"></div>
          </div>
        </div>`;
      });
      contentDiv.innerHTML = html;
    } else {
      // Aggregate by day
      const daily = {};
      agents.forEach(a => {
        const summary = _sessionSummaryForAgent(a);
        const msgs = summary.messages || [];
        msgs.forEach(m => {
          // Approximate timestamp from msg or session. Traces don't always have stamps, just use agent created_at if no msg timestamp? fallback simple:
          // we don't store time uniformly per msg, so let's mock it via session time
          const day = new Date(summary.timestamp || Date.now()).toLocaleDateString();
          daily[day] = (daily[day] || 0) + 1 + (Array.isArray(m.traces) ? m.traces.length : 0);
        });
      });
      const days = Object.keys(daily).sort((a,b) => new Date(b) - new Date(a)).slice(0, 7); // last 7 distinct days
      const max = Math.max(...Object.values(daily), 1);
      
      let html = '<div style="font-size:.72rem;color:var(--text-muted);margin-bottom:6px;">API calls per day (Last active days)</div>';
      if (!days.length) {
        html += '<div style="font-size:.68rem;opacity:.7;">No activity yet.</div>';
      }
      days.forEach(day => {
        const count = daily[day];
        const width = Math.max(4, Math.round((count / max) * 100));
        html += `<div style="display:flex;flex-direction:column;gap:2px;margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;font-size:.68rem;">
            <span>${esc(day)}</span>
            <span>${count} calls</span>
          </div>
          <div style="height:8px;border-radius:999px;background:var(--glass-border);overflow:hidden;">
            <div style="height:100%;width:${width}%;background:linear-gradient(90deg, #10b981, var(--primary));"></div>
          </div>
        </div>`;
      });
      contentDiv.innerHTML = html;
    }
  }

  async function sendCommandToAgent(agent, rawText) {
    const text = String(rawText || '').trim();
    if (!text) return;
    const sid = String(agent?.chat_id || '').trim();
    if (!sid || !store.sessions[sid]) {
      showToast('Agent has no linked chat context.', 'error');
      return;
    }

    const sess = store.sessions[sid];
    const sources = Array.isArray(agent.sources) ? agent.sources.filter(Boolean).slice(0, 12) : [];
    const pFiles = _projectFiles(agent.project_id || missionSelectedProjectId)
      .slice(0, 10)
      .map(f => `FILE: ${f.name}\n${String(f.content || '').slice(0, 2400)}`)
      .join('\n\n');
    const profileBlock =
      `[AGENT_PROFILE]\n` +
      `name=${agent.name || 'Agent'}\n` +
      `instructions=${(agent.instructions || '').slice(0, 1200)}\n` +
      `memory_notes=${(agent.memory_notes || '').slice(0, 2400)}\n` +
      `${sources.length ? `sources=\n- ${sources.join('\n- ')}` : ''}\n` +
      `[/AGENT_PROFILE]`;

    const isManager = agent.is_project_head || agent.mode === 'project_manager';
    const subagents = (agent.project_id && missionAgents) ? missionAgents.filter(a => a.project_id === agent.project_id && a.id !== agent.id).map(a => a.name) : [];
    
    let sysRules = '';
    if (agent.project_id || missionSelectedProjectId) {
      sysRules += `\n\n[FILE SYSTEM CAPABILITY]\nYou can create and edit project files. To do so, output a markdown codeblock starting exactly with \`\`\`file:filename.ext\n[content]\n\`\`\`.\nThe system will automatically save it. Use this to update VISION.md, SHARED_CONTEXT.md, or SCOPE.md.\n`;
    }
    if (isManager && subagents.length > 0) {
      sysRules += `[TEAM MANAGER CAPABILITY]\nYou lead this project. Your available subagents are: ${subagents.join(', ')}.\nTo delegate a task, output a codeblock starting exactly with \`\`\`agent:AgentName\n[task commands]\n\`\`\`. The system will automatically forward your command to them.\n`;
    } else if (!isManager && agent.project_id) {
      sysRules += `[TEAM SYNC]\nYou are a focused subagent. Perform your assignment, update relevant logic via files, and explain changes to your manager in your reply.\n`;
    }

    const projectBlock = pFiles
      ? `\n\n[PROJECT_INFO_FILES]\n${pFiles}\n[/PROJECT_INFO_FILES]`
      : '';

    const outbound = `${text}\n\n${profileBlock}${projectBlock}${sysRules}`.trim();

    sess.messages.push({ role: 'user', content: text });
    sess.timestamp = Date.now();
    saveStore(store);
    renderHistory();

    const history = (sess.messages || []).map(m => ({ role: m.role, content: m.content }));
    const mode = (agent.mode || 'reasoning_fast');

    const { res, data } = await callChatApi({
      message: outbound,
      mode,
      history,
      customMode: null,
      sharedUrl: '',
    });

    if (res.ok && data?.reply) {
      let replyText = data.reply;
      const fileRegex = /```(?:file|write|update):\s*([^\n]+)\n([\s\S]*?)```/gi;
      let match;
      let filesEdited = 0;
      let projId = agent.project_id || missionSelectedProjectId;
      let files = projId ? _projectFiles(projId) : null;
      
      if (files) {
        while ((match = fileRegex.exec(replyText)) !== null) {
           let fName = String(match[1]).trim().replace(/['"]/g, '');
           let fContent = match[2];
           let idx = files.findIndex(f => f.name.toLowerCase() === fName.toLowerCase());
           if (idx >= 0) { files[idx].content = fContent; }
           else {
              files.push({ id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: fName, content: fContent });
           }
           filesEdited++;
        }
        if (filesEdited > 0) {
           saveMissionFiles(missionFiles);
           if (typeof renderMissionFiles === 'function') renderMissionFiles(projId);
           if (typeof renderProjectMemoryWindow === 'function') renderProjectMemoryWindow(projId);
           if (typeof renderProjectMemoryPreview === 'function') renderProjectMemoryPreview(projId);
           showToast(`Agent edited ${filesEdited} file(s).`, 'success', 2000);
        }
      }

      sess.messages.push({ role: 'assistant', content: data.reply, classification: data.classification, traces: data.traces || [] });
      sess.timestamp = Date.now();
      saveStore(store);
      renderHistory();
      updateMissionStateFromResponse(data);
      agent.last_status = 'active';
      agent.last_command_at = Date.now();
      saveMissionAgents(missionAgents);
      renderMissionProjects();
      if (missionOpenAgentId === agent.id) renderAgentChatModal(agent.id);

      const agentRegex = /```agent:\s*([^\n]+)\n([\s\S]*?)```/gi;
      let agentMatch;
      while ((agentMatch = agentRegex.exec(replyText)) !== null) {
         let subName = String(agentMatch[1]).trim().toLowerCase();
         let subTask = agentMatch[2].trim();
         let targetAgent = (missionAgents || []).find(a => (a.project_id === agent.project_id || !agent.project_id) && String(a.name || '').toLowerCase() === subName && a.id !== agent.id);
         if (targetAgent) {
            showToast(`Delegating task to ${targetAgent.name}...`, 'info');
            sendCommandToAgent(targetAgent, subTask).catch(e => console.error('Subagent failed', e));
         } else {
            showToast(`Could not find subagent: ${agentMatch[1]}`, 'error');
         }
      }
    } else {
      agent.last_status = 'error';
      saveMissionAgents(missionAgents);
      showToast(data?.error || 'Agent command failed.', 'error');
    }
  }

  function renderAgentChatModal(agentId) {
    const agent = missionAgents.find(a => a.id === agentId);
    if (!agent || !agentChatMessages) return;
    const project = missionProjects.find(p => p.id === agent.project_id) || null;
    const summary = _sessionSummaryForAgent(agent);
    const msgs = summary.messages || [];
    agentChatTitle.textContent = `${agent.name || 'Agent'} · ${summary.title}`;
    if (agentChatPath) {
      const projName = project?.name || 'Project';
      agentChatPath.textContent = `Mission Hub / ${projName} / ${agent.name || 'Agent'}`;
    }
    agentChatMessages.innerHTML = '';
    msgs.forEach(m => {
      const row = document.createElement('div');
      row.style.marginBottom = '8px';
      row.style.padding = '8px';
      row.style.borderRadius = '8px';
      row.style.border = '1px solid var(--border)';
      row.style.background = m.role === 'user' ? 'var(--msg-user)' : 'var(--msg-assistant)';
      row.innerHTML = `<div style="font-size:.66rem;opacity:.85;margin-bottom:4px;">${esc((m.role || '').toUpperCase())}</div><div style="white-space:pre-wrap;font-size:.76rem;">${esc(m.content || '')}</div>`;
      agentChatMessages.appendChild(row);
    });
    agentChatMessages.scrollTop = agentChatMessages.scrollHeight;
    renderAgentContextPanel(agent, summary);
  }

  function renderAgentContextPanel(agent, summary = null) {
    if (!agentChatContext) return;
    const project = missionProjects.find(p => p.id === agent.project_id) || null;
    const projectFiles = project ? _projectFiles(project.id) : [];
    const info = summary || _sessionSummaryForAgent(agent);
    const traces = _missionLastAssistantTraceBundle(info.messages || [])?.traces || [];
    const usage = _agentUsage(agent);
    const srcList = Array.isArray(agent.sources) ? agent.sources : [];

    const filesHtml = projectFiles.length
      ? projectFiles.slice(0, 6).map(f => {
          const preview = String(f.content || '').trim().slice(0, 180);
          return `<div style="margin-bottom:8px;padding:7px;border:1px solid var(--border);border-radius:8px;background:var(--panel-bg);">
            <div style="font-size:.68rem;font-weight:700;">${esc(f.name || 'file.md')}</div>
            <div style="font-size:.65rem;opacity:.85;white-space:pre-wrap;margin-top:4px;">${esc(preview || '(empty)')}</div>
          </div>`;
        }).join('')
      : '<div style="font-size:.68rem;opacity:.8;">No project files yet.</div>';

    const sourcesHtml = srcList.length
      ? `<ul style="margin:6px 0 0 16px;padding:0;font-size:.66rem;line-height:1.45;">${srcList.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`
      : '<div style="font-size:.68rem;opacity:.8;">No saved sources.</div>';
    const sourceText = srcList.join('\n');

    agentChatContext.innerHTML =
      `<div style="display:flex;flex-direction:column;gap:8px;min-height:0;">
        <details open>
          <summary style="cursor:pointer;font-size:.72rem;font-weight:700;">Role & Instructions (Editable)</summary>
          <textarea data-agent-edit-instructions style="margin-top:6px;width:100%;min-height:96px;padding:7px;border-radius:8px;border:1px solid var(--border);background:var(--panel-bg);color:var(--text);">${esc(agent.instructions || '')}</textarea>
        </details>
        <details open>
          <summary style="cursor:pointer;font-size:.72rem;font-weight:700;">Memory & Activity</summary>
          <div style="margin-top:6px;font-size:.67rem;line-height:1.5;">
            <div><strong>Status:</strong> ${esc(agent.last_status || 'idle')}</div>
            <div><strong>Mode:</strong> ${esc(agent.mode || 'reasoning_fast')}</div>
            <div><strong>Messages:</strong> ${usage.total} (user ${usage.userCount}, assistant ${usage.assistantCount})</div>
            <div><strong>Latest steps:</strong> ${Array.isArray(traces) ? traces.length : 0}</div>
            <div><strong>Last command:</strong> ${agent.last_command_at ? esc(new Date(agent.last_command_at).toLocaleString()) : 'n/a'}</div>
          </div>
          <textarea data-agent-edit-memory placeholder="Editable memory notes for this agent..." style="margin-top:8px;width:100%;min-height:90px;padding:7px;border-radius:8px;border:1px solid var(--border);background:var(--panel-bg);color:var(--text);">${esc(agent.memory_notes || '')}</textarea>
        </details>
        <details open>
          <summary style="cursor:pointer;font-size:.72rem;font-weight:700;">Project Context</summary>
          <div style="margin-top:6px;font-size:.67rem;opacity:.9;">Project: ${esc(project?.name || 'No project')}</div>
          <div style="margin-top:6px;max-height:240px;overflow:auto;">${filesHtml}</div>
        </details>
        <details open>
          <summary style="cursor:pointer;font-size:.72rem;font-weight:700;">Sources (Editable)</summary>
          <textarea data-agent-edit-sources placeholder="One source URL per line" style="margin-top:6px;width:100%;min-height:86px;padding:7px;border-radius:8px;border:1px solid var(--border);background:var(--panel-bg);color:var(--text);">${esc(sourceText)}</textarea>
          <div style="margin-top:6px;">${sourcesHtml}</div>
        </details>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="hdr-btn" data-agent-save-context="1">Save Context</button>
          <button class="hdr-btn" data-agent-open-config="1">Open Full Editor</button>
        </div>
      </div>`;
  }

  function _syncAgentProjectLink(agent) {
    const pid = String(agent?.project_id || '').trim();
    const sid = String(agent?.chat_id || '').trim();
    missionProjects.forEach(p => {
      p.chat_ids = Array.isArray(p.chat_ids) ? p.chat_ids.filter(id => id !== sid) : [];
    });
    if (pid) {
      const p = missionProjects.find(x => x.id === pid);
      if (p && sid) {
        if (!Array.isArray(p.chat_ids)) p.chat_ids = [];
        if (!p.chat_ids.includes(sid)) p.chat_ids.push(sid);
      }
    }
    saveMissionProjects(missionProjects);
  }

  function deleteMissionAgent(agentId) {
    const idx = missionAgents.findIndex(a => a.id === agentId);
    if (idx < 0) return;
    const agent = missionAgents[idx];
    const ok = confirm(`Delete agent "${agent.name || 'Agent'}"?`);
    if (!ok) return;
    missionAgents.splice(idx, 1);
    saveMissionAgents(missionAgents);
    delete missionWidgetPositions[`agent-${agentId}`];
    delete missionWidgetSizes[`agent-${agentId}`];
    saveMissionWidgetPositions(missionWidgetPositions);
    saveMissionWidgetSizes(missionWidgetSizes);
    _syncAgentProjectLink({ ...agent, project_id: '' });
    renderMissionProjects();
    renderHistory();
    if (missionOpenAgentId === agentId) {
      missionOpenAgentId = '';
      agentChatModal?.classList.remove('open');
    }
    showToast('Agent deleted.', 'success', 1600);
  }

  function fillAgentProjectOptions(selectedProjectId = '') {
    if (!agentConfigProject) return;
    agentConfigProject.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'No project (independent agent)';
    agentConfigProject.appendChild(none);
    missionProjects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name || 'Untitled Project';
      agentConfigProject.appendChild(opt);
    });
    agentConfigProject.value = selectedProjectId || '';
  }

  function openAgentConfigModal(agentId = '', defaultProjectId = '') {
    const editing = missionAgents.find(a => a.id === agentId) || null;
    editingAgentId = editing?.id || '';
    agentConfigTitle.textContent = editing ? 'Edit Agent' : 'Create Agent';
    fillAgentProjectOptions(editing?.project_id || defaultProjectId || '');
    agentConfigName.value = editing?.name || '';
    agentConfigMode.value = editing?.mode || 'reasoning_fast';
    agentConfigInstructions.value = editing?.instructions || 'You are a helpful specialist agent.';
    agentConfigSources.value = Array.isArray(editing?.sources) ? editing.sources.join('\n') : '';
    agentConfigMemory.value = editing?.memory_notes || '';
    agentConfigDelete.style.display = editing ? 'inline-flex' : 'none';
    agentConfigModal?.classList.add('open');
  }

  function closeAgentConfigModal() {
    agentConfigModal?.classList.remove('open');
    editingAgentId = '';
    if (missionPendingNewTileType === 'agent') {
      missionPendingNewTileCell = null;
      missionPendingNewTileType = '';
    }
  }

  function openAgentChat(agentId, returnTo = 'mission') {
    const agent = missionAgents.find(a => a.id === agentId);
    if (!agent) return;
    missionOpenAgentId = agent.id;
    agentModalReturnTo = returnTo;
    if (agent.project_id) missionSelectedProjectId = agent.project_id;
    agentChatModal?.classList.add('open');
    renderAgentChatModal(agent.id);
  }

  function createMissionProject() {
    const name = prompt('Project name:', 'New Project');
    if (!name || !name.trim()) return null;
    const p = {
      id: `proj-${Date.now()}`,
      name: name.trim().slice(0, 80),
      created_at: Date.now(),
      chat_ids: [],
    };
    missionProjects.unshift(p);
    saveMissionProjects(missionProjects);
    missionWidgetSizes[`project-${p.id}`] = { x: 1, y: 1 };
    saveMissionWidgetSizes(missionWidgetSizes);
    if (missionPendingNewTileCell && missionPendingNewTileType === 'project') {
      missionWidgetPositions[`project-${p.id}`] = {
        col: Number(missionPendingNewTileCell.col || 1),
        row: Number(missionPendingNewTileCell.row || 1),
      };
      saveMissionWidgetPositions(missionWidgetPositions);
      missionPendingNewTileCell = null;
      missionPendingNewTileType = '';
    }
    missionSelectedProjectId = p.id;
    renderMissionProjects();
    return p;
  }

  function createMissionAgent(config = {}) {
    const pid = String(config.project_id || '').trim();
    const agentName = String(config.name || '').trim();
    if (!agentName) {
      showToast('Agent name is required.', 'error');
      return null;
    }
    const instructions = String(config.instructions || 'You are a helpful specialist agent.').trim();
    const srcList = Array.isArray(config.sources)
      ? config.sources.map(x => String(x || '').trim()).filter(Boolean).slice(0, 24)
      : [];
    const mode = String(config.mode || 'direct');
    const memoryNotes = String(config.memory_notes || '').slice(0, 12000);

    const sid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    store.sessions[sid] = {
      timestamp: Date.now(),
      title: `Agent · ${agentName.trim().slice(0, 32)}`,
      messages: [
        { role: 'assistant', content: `Agent initialized.\n\nInstructions:\n${instructions}`, classification: 'AGENT_BOOT', traces: [] },
      ],
    };
    saveStore(store);

    const agent = {
      id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      project_id: pid,
      name: agentName.trim().slice(0, 60),
      instructions: instructions.slice(0, 1200),
      sources: srcList,
      memory_notes: memoryNotes,
      mode,
      model: config.model || document.getElementById('model-select')?.value || '',
      last_status: 'idle',
      chat_id: sid,
      created_at: Date.now(),
      is_project_head: !!config.is_project_head,
    };
    missionAgents.unshift(agent);
    saveMissionAgents(missionAgents);
    missionWidgetSizes[`agent-${agent.id}`] = { x: 1, y: 1 };
    saveMissionWidgetSizes(missionWidgetSizes);

    if (missionPendingNewTileCell && missionPendingNewTileType === 'agent') {
      missionWidgetPositions[`agent-${agent.id}`] = {
        col: Number(missionPendingNewTileCell.col || 1),
        row: Number(missionPendingNewTileCell.row || 1),
      };
      saveMissionWidgetPositions(missionWidgetPositions);
      missionPendingNewTileCell = null;
      missionPendingNewTileType = '';
    }

    _syncAgentProjectLink(agent);

    if (pid) missionSelectedProjectId = pid;
    renderHistory();
    renderMissionProjects();
    showToast('Agent created. It now has a dedicated chat context.', 'success');
    return agent;
  }

  function createMissionMiscTile(type = 'note', defaultTitle = 'Misc Tile', defaultContent = '') {
    const title = prompt('Tile name:', defaultTitle);
    if (!title || !title.trim()) return null;
    let content = defaultContent;
    if (type === 'note') {
      content = prompt('Initial note:', defaultContent) || '';
    }
    const tile = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: type,
      title: title.trim().slice(0, 80),
      content: String(content || '').slice(0, 4000),
      created_at: Date.now(),
    };
    missionMiscTiles.unshift(tile);
    saveMissionMiscTiles(missionMiscTiles);
    missionWidgetSizes[`misc-${tile.id}`] = { x: 1, y: 1 };
    saveMissionWidgetSizes(missionWidgetSizes);
    if (missionPendingNewTileCell && missionPendingNewTileType === 'misc') {
      missionWidgetPositions[`misc-${tile.id}`] = {
        col: Number(missionPendingNewTileCell.col || 1),
        row: Number(missionPendingNewTileCell.row || 1),
      };
      saveMissionWidgetPositions(missionWidgetPositions);
      missionPendingNewTileCell = null;
      missionPendingNewTileType = '';
    }
    renderMissionProjects();
    return tile;
  }

  function renderMissionMiscTiles() {
    if (!missionWidgetGrid) return;
    document.querySelectorAll('.misc-tile-dynamic').forEach(el => el.remove());
    if (missionViewMode !== 'hub') return;

    missionMiscTiles.forEach((item) => {
      const tile = document.createElement('section');
      tile.className = 'mission-widget w-size-1x1 misc-tile-dynamic';
      tile.draggable = true;
      tile.dataset.widgetId = `misc-${item.id}`;
      
      if (item.type === 'packager') {
        const pOpts = missionProjects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
        tile.innerHTML =
          `<div class="mission-widget-header"><span style="color:#00ffff;">⚒ ${esc(item.title || 'App Compiler')}</span><div class="spacer"></div></div>` +
          `<div class="mission-widget-body" style="display:flex;flex-direction:column;gap:8px;">` +
            `<div style="font-size:.68rem;opacity:.86;white-space:pre-wrap;">${esc(item.content || 'Select a project to bundle your files.')}</div>` +
            `<select id="compile-proj-${item.id}" class="hdr-btn" style="width:100%;margin-bottom:4px;">${pOpts}</select>` +
            `<select id="compile-fmt-${item.id}" class="hdr-btn" style="width:100%;margin-bottom:8px;">` +
               `<option value="html">Single-File HTML (.html)</option>` +
               `<option value="python">Python Script (.py)</option>` +
            `</select>` +
            `<div style="display:flex;gap:6px;flex-wrap:wrap;">` +
              `<button class="hdr-btn" data-misc-compile="${esc(item.id)}" style="background:var(--primary-glow); border-color:var(--primary); width:100%;">Compile & Download</button>` +
              `<button class="hdr-btn" data-misc-delete="${esc(item.id)}" style="width:100%;">Remove Tool</button>` +
            `</div>` +
          `</div>` +
          `<div class="mission-widget-resize-handle" data-widget-handle="misc-${esc(item.id)}" title="Resize tile"></div>`;

        tile.querySelector('[data-misc-compile]')?.addEventListener('click', () => {
           const pId = tile.querySelector(`#compile-proj-${item.id}`)?.value;
           const fmt = tile.querySelector(`#compile-fmt-${item.id}`)?.value;
           if (!pId) { showToast('No project selected', 'error'); return; }
           const files = _projectFiles(pId);
           const pName = missionProjects.find(p=>p.id===pId)?.name || 'app';
           
           if (fmt === 'html') {
              let htmlFile = files.find(f => f.name.toLowerCase().endsWith('.html'))?.content || '<html><body>No HTML found.</body></html>';
              let cssFiles = files.filter(f => f.name.toLowerCase().endsWith('.css'));
              let jsFiles = files.filter(f => f.name.toLowerCase().endsWith('.js'));
              
              let finalHtml = htmlFile;
              if (cssFiles.length) {
                 const cssAg = cssFiles.map(c => `/* ${c.name} */\n${c.content}`).join('\n\n');
                 finalHtml = finalHtml.replace('</head>', '<st' + 'yle>\n' + cssAg + '\n</st' + 'yle>\n</head>');
              }
              if (jsFiles.length) {
                 const jsAg = jsFiles.map(j => `/* ${j.name} */\n${j.content}`).join('\n\n');
                 finalHtml = finalHtml.replace('</body>', '<sc' + 'ript>\n' + jsAg + '\n</sc' + 'ript>\n</body>');
              }
              
              const blob = new Blob([finalHtml], { type: 'text/html' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `${pName.replace(/\s+/g,'_')}.html`; a.click();
              URL.revokeObjectURL(url);
           } else if (fmt === 'python') {
              let pyFiles = files.filter(f => f.name.toLowerCase().endsWith('.py'));
              let mainPy = pyFiles.find(f => f.name.toLowerCase() === 'main.py' || f.name.toLowerCase() === 'app.py') || pyFiles[0];
              if (!mainPy) { showToast('No Python files found.', 'error'); return; }
              const blob = new Blob([mainPy.content], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `${pName.replace(/\s+/g,'_')}.py`; a.click();
              URL.revokeObjectURL(url);
           }
        });

      } else {
        const snippet = String(item.content || '').trim().slice(0, 220);
        tile.innerHTML =
          `<div class="mission-widget-header"><span>${esc(item.title || 'Misc Tile')}</span><div class="spacer"></div></div>` +
          `<div class="mission-widget-body" style="display:flex;flex-direction:column;gap:8px;">` +
            `<div style="font-size:.68rem;opacity:.86;white-space:pre-wrap;">${esc(snippet || 'No note yet.')}</div>` +
            `<div style="display:flex;gap:6px;flex-wrap:wrap;">` +
              `<button class="hdr-btn" data-misc-edit="${esc(item.id)}">Edit</button>` +
              `<button class="hdr-btn" data-misc-delete="${esc(item.id)}">Delete</button>` +
            `</div>` +
          `</div>` +
          `<div class="mission-widget-resize-handle" data-widget-handle="misc-${esc(item.id)}" title="Resize tile"></div>`;

        tile.querySelector('[data-misc-edit]')?.addEventListener('click', () => {
          const nextTitle = prompt('Misc tile name:', item.title || 'Misc Tile');
          if (!nextTitle || !nextTitle.trim()) return;
          const nextContent = prompt('Note:', item.content || '') || '';
          item.title = nextTitle.trim().slice(0, 80);
          item.content = String(nextContent || '').slice(0, 4000);
          saveMissionMiscTiles(missionMiscTiles);
          renderMissionProjects();
        });
      }

      tile.querySelector('[data-misc-delete]')?.addEventListener('click', () => {
        if (!confirm('Delete this tool?')) return;
        missionMiscTiles = missionMiscTiles.filter(x => x.id !== item.id);
        delete missionWidgetPositions[`misc-${item.id}`];
        delete missionWidgetSizes[`misc-${item.id}`];
        saveMissionWidgetPositions(missionWidgetPositions);
        saveMissionWidgetSizes(missionWidgetSizes);
        saveMissionMiscTiles(missionMiscTiles);
        renderMissionProjects();
      });

      missionWidgetGrid.appendChild(tile);
    });
  }

  function renderMissionAgentGraph(traces = []) {
    if (!missionAgentGraph) return;
    if (!traces.length) {
      missionAgentGraph.innerHTML = '<div style="opacity:.8;font-size:.72rem;">No agent timing data yet.</div>';
      return;
    }
    const maxMs = Math.max(...traces.map(t => Number(t.elapsed_ms || 0)), 1);
    missionAgentGraph.innerHTML = '';
    traces.forEach(t => {
      const ms = Number(t.elapsed_ms || 0);
      const width = Math.max(4, Math.round((ms / maxMs) * 100));
      const row = document.createElement('div');
      row.innerHTML =
        `<div style="display:flex;justify-content:space-between;font-size:.7rem;margin-bottom:2px;">` +
        `<span>${esc(t.agent || 'Agent')}</span><span>${ms}ms</span></div>` +
        `<div style="height:8px;border-radius:999px;background:var(--code-bg);overflow:hidden;">` +
        `<div style="height:100%;width:${width}%;background:var(--primary);"></div></div>`;
      missionAgentGraph.appendChild(row);
    });
  }

  function setMissionView(mode = 'hub', projectId = '') {
    missionViewMode = mode === 'project' ? 'project' : 'hub';
    if (projectId) missionSelectedProjectId = projectId;

    const show = (id, visible) => {
      const el = missionWidgetGrid?.querySelector(`.mission-widget[data-widget-id="${id}"]`);
      if (el) el.style.display = visible ? 'flex' : 'none';
    };

    if (missionViewMode === 'hub') {
      show('projects', true);
      show('preview', false);
      show('agents', false);
      show('calendar', true);
      show('files', false);
      show('inspector', false);
      show('usage', true);
      show('quickadd', false);
      if (missionProjectsTitle) missionProjectsTitle.textContent = 'Projects Manager';
      if (missionAgentsTitle) missionAgentsTitle.textContent = 'Independent Agents';
      if (missionMiscTitle) missionMiscTitle.textContent = 'Calendar';
      if (missionPageMeta) missionPageMeta.textContent = 'Mission Hub · Projects, independent agents, and information/misc tools';
      if (missionPageProjectLabel) {
        missionPageProjectLabel.style.display = 'none';
        missionPageProjectLabel.textContent = '';
      }
      if (missionPageClose) missionPageClose.textContent = 'Back to Chat';
    } else {
      show('projects', false);
      show('preview', true);
      show('agents', false);
      show('files', true);
      show('inspector', true);
      show('quickadd', true);
      show('calendar', false);
      show('usage', false);
      const p = missionProjects.find(x => x.id === missionSelectedProjectId);
      if (missionProjectsTitle) missionProjectsTitle.textContent = 'Projects Manager';
      if (missionAgentsTitle) missionAgentsTitle.textContent = `Agents in ${p?.name || 'Project'}`;
      if (missionFilesTitle) missionFilesTitle.textContent = 'Project Workspace (Files/Code)';
      if (missionInspectorTitle) missionInspectorTitle.textContent = 'Project Memory (Vision / Records)';
      if (missionPageMeta) missionPageMeta.textContent = `Project Workspace · ${p?.name || 'Untitled Project'}`;
      if (missionPageProjectLabel) {
        missionPageProjectLabel.style.display = 'inline-flex';
        missionPageProjectLabel.textContent = p?.name || 'Untitled Project';
      }
      if (missionPageClose) missionPageClose.textContent = 'Back to Hub';
      
      const projectFiles = _projectFiles(missionSelectedProjectId) || [];
      const indexFile = projectFiles.find(f => f.name.toLowerCase() === 'index.html');
      const previewContainer = document.getElementById('mission-project-preview');
      if (previewContainer) {
        if (indexFile && indexFile.content) {
          const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(indexFile.content);
          previewContainer.innerHTML = `<div style="flex-grow:1;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:#fff;">
            <iframe style="width:100%;height:100%;border:none;" src="${dataUrl}"></iframe>
          </div>`;
        } else {
          previewContainer.innerHTML = `<div style="flex-grow:1;border:1px dashed var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;opacity:.5;font-size:0.7rem;">No HTML output available</div>`;
        }
      }
    }

    syncMissionGridSquares();
  }

  function renderProjectMemoryPreview(projectId) {
    if (!missionAgentInspector) return;
    const files = _projectFiles(projectId || missionSelectedProjectId || '').slice(0, 8);
    const p = missionProjects.find(x => x.id === (projectId || missionSelectedProjectId));
    const preview = {
      project: p?.name || 'Untitled Project',
      memory_files: files.map(f => ({ name: f.name, snippet: String(f.content || '').slice(0, 280) })),
      note: 'Use Open Window for full project memory editor.',
    };
    missionAgentInspector.textContent = JSON.stringify(preview, null, 2);
  }

  function renderProjectMemoryWindow(projectId) {
    const pid = String(projectId || missionSelectedProjectId || '').trim();
    if (!pid || !projectMemoryList || !projectMemoryEditor || !projectMemoryFileName) return;
    const p = missionProjects.find(x => x.id === pid);
    if (projectMemoryTitle) projectMemoryTitle.textContent = `Project Memory · ${p?.name || 'Untitled Project'}`;
    const files = _projectFiles(pid);
    let dragFileId = '';
    if (!projectMemoryFileId || !files.some(f => f.id === projectMemoryFileId)) {
      projectMemoryFileId = files[0]?.id || '';
    }
    projectMemoryList.innerHTML = '';
    files.forEach(f => {
      const b = document.createElement('button');
      b.className = 'hdr-btn';
      b.draggable = true;
      b.style.textAlign = 'left';
      b.style.borderColor = f.id === projectMemoryFileId ? 'var(--primary)' : 'var(--glass-border)';
      b.textContent = f.name || 'FILE.md';
      b.addEventListener('click', () => {
        projectMemoryFileId = f.id;
        renderProjectMemoryWindow(pid);
      });
      b.addEventListener('dragstart', () => {
        dragFileId = f.id;
      });
      b.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      b.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetId = f.id;
        if (!dragFileId || dragFileId === targetId) return;
        const from = files.findIndex(x => x.id === dragFileId);
        const to = files.findIndex(x => x.id === targetId);
        if (from < 0 || to < 0) return;
        const [moved] = files.splice(from, 1);
        files.splice(to, 0, moved);
        saveMissionFiles(missionFiles);
        renderProjectMemoryWindow(pid);
      });
      projectMemoryList.appendChild(b);
    });
    const selected = files.find(f => f.id === projectMemoryFileId) || files[0] || { name: '', content: '' };
    projectMemoryFileName.value = selected.name || '';
    projectMemoryEditor.value = selected.content || '';
  }

  function saveProjectMemoryWindow(projectId) {
    const pid = String(projectId || missionSelectedProjectId || '').trim();
    if (!pid || !projectMemoryFileId) return;
    const files = _projectFiles(pid);
    const idx = files.findIndex(f => f.id === projectMemoryFileId);
    if (idx < 0) return;
    files[idx].name = String(projectMemoryFileName?.value || files[idx].name || 'MEMORY.md').trim().slice(0, 80);
    files[idx].content = String(projectMemoryEditor?.value || '').slice(0, 40000);
    saveMissionFiles(missionFiles);
    renderProjectMemoryWindow(pid);
    renderProjectMemoryPreview(pid);
    renderMissionFiles(pid);
    showToast('Project memory saved.', 'success', 1400);
  }

  function renderMissionAgents(projectId) {
    if (!missionAgentsList || !missionAgentInspector) return;
    const pid = String(projectId || '').trim();
    const agents = missionAgents.filter(a => {
      const ap = String(a.project_id || '').trim();
      if (missionViewMode === 'hub') return !ap;
      if (!pid) return true;
      return ap === pid;
    });

    missionAgentsList.innerHTML = '';
    missionAgentsList.style.display = 'grid';
    missionAgentsList.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))';
    missionAgentsList.style.gap = '8px';
    missionSelectedTrace = null;
    if (!agents.length) {
      missionAgentsList.innerHTML = '<div style="opacity:.8;font-size:.72rem;">No agents yet. Use + Agent.</div>';
      missionAgentInspector.textContent = 'Create an agent for this project. Each agent can own a linked chat context.';
      renderMissionAgentGraph([]);
      return;
    }

    agents.forEach((agent, idx) => {
      const summary = _sessionSummaryForAgent(agent);
      const packet = _missionLastAssistantTraceBundle(summary.messages);
      const laneCount = Array.isArray(packet?.traces) ? packet.traces.length : 0;
      const usage = _agentUsage(agent);
      const card = document.createElement('div');
      card.style.border = '1px solid var(--border)';
      card.style.borderRadius = '10px';
      card.style.padding = '8px';
      card.style.background = 'var(--code-bg)';
      card.innerHTML =
        `<div style="font-size:.76rem;font-weight:700;">${idx + 1}. ${esc(agent.name || 'Agent')}</div>` +
        `<div style="font-size:.66rem;opacity:.85;margin-top:2px;">${esc(summary.title)} · ${laneCount} steps · ${usage.total} msgs</div>` +
        `<div style="font-size:.64rem;opacity:.8;margin-top:2px;">${agent.project_id ? `Project linked` : `Independent agent`}</div>` +
        `<div style="font-size:.66rem;opacity:.85;margin-top:2px;">Status: ${esc(agent.last_status || 'idle')}</div>` +
        `<select data-agent-project="${esc(agent.id)}" class="hdr-btn" style="width:100%;margin-top:6px;">
          <option value="">No project (independent)</option>
          ${missionProjects.map(p => `<option value="${esc(p.id)}" ${p.id === agent.project_id ? 'selected' : ''}>${esc(p.name || 'Untitled')}</option>`).join('')}
        </select>` +
        `<textarea data-agent-cmd="${esc(agent.id)}" placeholder="Command this agent..." style="margin-top:6px;width:100%;min-height:56px;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);"></textarea>` +
        `<div style="display:flex;gap:6px;margin-top:6px;">` +
          `<button class="hdr-btn" data-agent-move="${esc(agent.id)}">Move</button>` +
          `<button class="hdr-btn" data-agent-send="${esc(agent.id)}">Send</button>` +
          `<button class="hdr-btn" data-agent-open="${esc(agent.id)}">Open Chat</button>` +
          `<button class="hdr-btn" data-agent-edit="${esc(agent.id)}">Edit</button>` +
          `<button class="hdr-btn" data-agent-delete="${esc(agent.id)}">Delete</button>` +
        `</div>`;

      card.querySelector('[data-agent-send]')?.addEventListener('click', async () => {
        const input = card.querySelector(`[data-agent-cmd="${agent.id}"]`);
        const cmd = input?.value || '';
        if (input) input.value = '';
        await sendCommandToAgent(agent, cmd);
      });

      card.querySelector('[data-agent-open]')?.addEventListener('click', () => {
        openAgentChat(agent.id, 'project');
      });

      card.querySelector('[data-agent-move]')?.addEventListener('click', () => {
        const sel = card.querySelector(`[data-agent-project="${agent.id}"]`);
        agent.project_id = String(sel?.value || '').trim();
        saveMissionAgents(missionAgents);
        _syncAgentProjectLink(agent);
        renderMissionProjects();
        showToast('Agent moved.', 'success', 1200);
      });

      card.querySelector('[data-agent-edit]')?.addEventListener('click', () => {
        openAgentConfigModal(agent.id, missionSelectedProjectId);
      });

      card.querySelector('[data-agent-delete]')?.addEventListener('click', () => {
        deleteMissionAgent(agent.id);
      });

      card.addEventListener('click', (e) => {
        if (e.target.closest('textarea') || e.target.closest('[data-agent-send]') || e.target.closest('[data-agent-open]') || e.target.closest('[data-agent-edit]') || e.target.closest('[data-agent-delete]') || e.target.closest('[data-agent-move]') || e.target.closest('[data-agent-project]')) return;
        const p = _missionLastAssistantTraceBundle(summary.messages);
        const traces = Array.isArray(p?.traces) ? p.traces : [];
        missionSelectedTrace = traces[0] || null;
        if (missionSchedTargetAgent) missionSchedTargetAgent.value = agent.name || '';
        if (missionSchedMessage) missionSchedMessage.value = agent.instructions || '';
        if (missionEventSources) missionEventSources.value = (agent.sources || []).join('\n');
        missionAgentInspector.textContent = JSON.stringify({
          agent,
          linked_chat: summary.title,
          latest_steps: traces,
        }, null, 2);
        renderMissionAgentGraph(traces);
      });
      missionAgentsList.appendChild(card);
    });

    const first = agents[0];
    const firstSummary = _sessionSummaryForAgent(first);
    const firstPacket = _missionLastAssistantTraceBundle(firstSummary.messages);
    const firstTraces = Array.isArray(firstPacket?.traces) ? firstPacket.traces : [];
    missionAgentInspector.textContent = JSON.stringify({
      agent: first,
      linked_chat: firstSummary.title,
      latest_steps: firstTraces,
    }, null, 2);
    renderMissionAgentGraph(firstTraces);
  }

  function renderMissionAgentTiles(projectId) {
    if (!missionWidgetGrid) return;
    document.querySelectorAll('.agent-tile-dynamic').forEach(el => el.remove());

    const pid = String(projectId || '').trim();
    const agents = missionAgents.filter(a => {
      const ap = String(a.project_id || '').trim();
      if (missionViewMode === 'hub') return !ap;
      if (!pid) return true;
      return ap === pid;
    });

    agents.forEach((agent) => {
      const summary = _sessionSummaryForAgent(agent);
      const packet = _missionLastAssistantTraceBundle(summary.messages);
      const stepCount = Array.isArray(packet?.traces) ? packet.traces.length : 0;
      const usage = _agentUsage(agent);
      const lastAssistant = [...(summary.messages || [])].reverse().find(m => m?.role === 'assistant' && String(m.content || '').trim());
      const lastReply = String(lastAssistant?.content || '').trim();
      const lastReplySnippet = lastReply ? `${lastReply.slice(0, 220)}${lastReply.length > 220 ? '…' : ''}` : 'No AI reply yet.';

      const tile = document.createElement('section');
      tile.className = 'mission-widget w-size-1x1 agent-tile-dynamic';
      if (agent.is_project_head) {
        tile.style.border = '1px solid var(--primary)';
        tile.style.boxShadow = '0 0 12px var(--primary-glow), inset 0 0 10px rgba(167,139,250,0.1)';
        tile.style.background = 'linear-gradient(180deg, var(--bg-grad-1), var(--primary-glow))';
      }
      tile.draggable = true;
      tile.dataset.widgetId = `agent-${agent.id}`;
      const showMove = missionViewMode === 'project';
      const projectControls = showMove
        ? `<select data-agent-project="${esc(agent.id)}" class="hdr-btn" style="width:100%;">
            <option value="">No project (independent)</option>
            ${missionProjects.map(p => `<option value="${esc(p.id)}" ${p.id === agent.project_id ? 'selected' : ''}>${esc(p.name || 'Untitled')}</option>`).join('')}
          </select>`
        : '';
      const actionButtons = [
        showMove ? `<button class="hdr-btn" data-agent-move="${esc(agent.id)}">Move</button>` : '',
        `<button class="hdr-btn" data-agent-open="${esc(agent.id)}">Chat</button>`,
        `<button class="hdr-btn" data-agent-schedule="${esc(agent.id)}">Schedule</button>`,
        `<button class="hdr-btn" data-agent-edit="${esc(agent.id)}">Edit</button>`,
        `<button class="hdr-btn" data-agent-add-context="${esc(agent.id)}" title="Add File/URL to Context" style="font-weight:bold;">+</button>`,
        `<button class="hdr-btn" data-agent-delete="${esc(agent.id)}">Delete</button>`,
      ].filter(Boolean);

      const allModels = Array.from(document.querySelectorAll('#model-select option')).map(o => ({
        value: o.value,
        text: o.textContent.replace('✓ ', '').trim()
      })) || [{value: 'gemini-2.5-pro', text: 'gemini-2.5-pro'}];
      const defaultAgentModel = agent.model || document.getElementById('model-select')?.value || allModels[0].value || '';
      
      const modelOpts = allModels.map(m => 
        `<option value="${esc(m.value)}" ${m.value === defaultAgentModel ? 'selected' : ''}>${esc(m.text)}</option>`
      ).join('');

      const modeOpts = `
        <option value="direct" ${agent.mode === 'direct' ? 'selected' : ''}>Direct</option>
        <option value="reasoning_fast" ${agent.mode === 'reasoning_fast' ? 'selected' : ''}>Fast Reasoning</option>
        <option value="reasoning" ${agent.mode === 'reasoning' ? 'selected' : ''}>Reasoning</option>
        <option value="conversational" ${agent.mode === 'conversational' ? 'selected' : ''}>Conversational</option>
        <option value="project_manager" ${agent.mode === 'project_manager' ? 'selected' : ''}>Project Manager</option>
      `;

      tile.innerHTML =
        `<div class="mission-widget-header"><span>${esc(agent.name || 'Agent')}</span><div class="spacer"></div></div>` +
        `<div class="mission-widget-body" style="display:flex;flex-direction:column;gap:6px;flex-grow:1;height:100%;">` +
          `<div style="font-size:.66rem;opacity:.85;">${esc(summary.title)} · ${stepCount} steps · ${usage.total} msgs</div>` +
          `<div style="font-size:.64rem;opacity:.82;">${agent.project_id ? 'Project linked' : 'Independent agent'}</div>` +
          `${projectControls}` +
          `<div style="display:flex;gap:4px;width:100%;">` +
            `<select class="hdr-btn" data-agent-tile-model="${esc(agent.id)}" style="flex:1;min-width:0;text-transform:capitalize;">${modelOpts}</select>` +
            `<select class="hdr-btn" data-agent-tile-mode="${esc(agent.id)}" style="flex:1;min-width:0;">${modeOpts}</select>` +
          `</div>` +
          `<div style="font-size:.64rem;opacity:.86;">Last AI reply</div>` +
          `<div style="font-size:.66rem;white-space:pre-wrap;flex-grow:1;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:7px;background:var(--bg);">${esc(lastReplySnippet)}</div>` +
          `<div class="agent-compose">` +
            `<textarea data-agent-cmd="${esc(agent.id)}" placeholder="Command this agent..." style="width:100%;min-height:62px;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);"></textarea>` +
            `<button class="hdr-btn agent-send-inside" data-agent-send="${esc(agent.id)}">Send</button>` +
          `</div>` +
          `<div class="agent-actions-row" style="--agent-action-cols:${actionButtons.length};">${actionButtons.join('')}</div>` +
        `</div>` +
        `<div class="mission-widget-resize-handle" data-widget-handle="agent-${esc(agent.id)}" title="Resize tile"></div>`;

      tile.querySelector('[data-agent-send]')?.addEventListener('click', async () => {
        const input = tile.querySelector(`[data-agent-cmd="${agent.id}"]`);
        const cmd = input?.value || '';
        if (input) input.value = '';
        await sendCommandToAgent(agent, cmd);
      });
      tile.querySelector('[data-agent-open]')?.addEventListener('click', () => openAgentChat(agent.id, 'project'));
      tile.querySelector('[data-agent-schedule]')?.addEventListener('click', () => {
        setMissionView('hub');
        if (missionEventForm) missionEventForm.style.display = 'flex';
        if (missionSchedTargetAgent) missionSchedTargetAgent.value = agent.name || '';
        if (missionSchedMessage) missionSchedMessage.value = agent.instructions || '';
        if (missionEventSources) missionEventSources.value = (agent.sources || []).join('\n');
        renderMissionProjects();
      });
      let pendingSelection = null;
      
      tile.querySelector('[data-agent-add-context]')?.addEventListener('click', () => {
        const c = prompt("Add Context\n\nEnter a URL (starts with http), or type 'FILE' to select a local file to read into the agent's memory:");
        if (!c) return;
        const val = c.trim();
        if (val.toUpperCase() === 'FILE') {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '*/*';
          input.onchange = e => {
            const f = e.target.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = re => {
              const res = re.target.result;
              const content = res.startsWith('data:') ? `\n\n--- MULTIMODAL FILE: ${f.name} ---\n${res}\n` : `\n\n--- FILE: ${f.name} ---\n${res}\n`;
              agent.memory_notes = (agent.memory_notes || '') + content;
              saveMissionAgents(missionAgents);
              showToast(`File '${f.name}' loaded into agent context.`, 'success');
            };
            if (f.type.startsWith('image/') || f.type.startsWith('audio/') || f.type.startsWith('video/')) {
              reader.readAsDataURL(f);
            } else {
              reader.readAsText(f);
            }
          };
          input.click();
        } else if (val.startsWith('http')) {
          agent.sources = agent.sources || [];
          if (!agent.sources.includes(val)) agent.sources.push(val);
          saveMissionAgents(missionAgents);
          showToast("URL added to agent sources.", 'success');
        } else {
          showToast("Please enter a valid URL or 'FILE'.", 'error');
        }
      });
      tile.querySelector('[data-agent-edit]')?.addEventListener('click', () => openAgentConfigModal(agent.id, missionSelectedProjectId));
      tile.querySelector('[data-agent-delete]')?.addEventListener('click', () => deleteMissionAgent(agent.id));
      tile.querySelector(`[data-agent-tile-model="${agent.id}"]`)?.addEventListener('change', (e) => {
        agent.model = e.target.value;
        saveMissionAgents(missionAgents);
      });
      tile.querySelector(`[data-agent-tile-mode="${agent.id}"]`)?.addEventListener('change', (e) => {
        agent.mode = e.target.value;
        saveMissionAgents(missionAgents);
      });
      tile.querySelector('[data-agent-move]')?.addEventListener('click', () => {
        const sel = tile.querySelector(`[data-agent-project="${agent.id}"]`);
        agent.project_id = String(sel?.value || '').trim();
        saveMissionAgents(missionAgents);
        _syncAgentProjectLink(agent);
        renderMissionProjects();
        showToast('Agent moved.', 'success', 1200);
      });

      missionWidgetGrid.appendChild(tile);
    });

    missionWidgetOrder = Array.from(missionWidgetGrid.querySelectorAll('.mission-widget'))
      .map(el => el.dataset.widgetId || '')
      .filter(Boolean);
    saveMissionWidgetOrder(missionWidgetOrder);
    applyMissionWidgetBoard();
    bindMissionWidgetDnD();
  }

  function renderMissionProjectTiles() {
    if (!missionWidgetGrid) return;
    document.querySelectorAll('.project-tile-dynamic').forEach(el => el.remove());
    if (missionViewMode !== 'hub') return;

    missionProjects.forEach((p) => {
      const tile = document.createElement('section');
      tile.className = 'mission-widget w-size-1x1 project-tile-dynamic';
      tile.draggable = true;
      tile.dataset.widgetId = `project-${p.id}`;
      const agentCount = missionAgents.filter(a => String(a.project_id || '') === p.id).length;
      
      const projectFiles = _projectFiles(p.id) || [];
      const indexFile = projectFiles.find(f => f.name.toLowerCase() === 'index.html');
      let previewHtml = '';
      if (indexFile && indexFile.content) {
        const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(indexFile.content);
        previewHtml = `<div style="flex-grow:1;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:#fff;margin-top:2px;">
          <iframe style="width:100%;height:100%;border:none;pointer-events:none;" src="${dataUrl}"></iframe>
        </div>`;
      } else {
        previewHtml = `<div style="flex-grow:1;border:1px dashed var(--border);border-radius:6px;margin-top:2px;display:flex;align-items:center;justify-content:center;opacity:.5;font-size:0.7rem;">No preview output</div>`;
      }

      tile.innerHTML =
        `<div class="mission-widget-header"><span>${esc(p.name || 'Untitled Project')}</span><div class="spacer"></div></div>` +
        `<div class="mission-widget-body" style="display:flex;flex-direction:column;gap:8px;flex-grow:1;height:100%;">` +
          `<div style="font-size:.68rem;opacity:.86;">Agents: ${agentCount}</div>` +
          `<button class="hdr-btn" data-proj-open-tile="${esc(p.id)}">Open Workspace</button>` +
          previewHtml +
        `</div>` +
        `<div class="mission-widget-resize-handle" data-widget-handle="project-${esc(p.id)}" title="Resize tile"></div>`;

      tile.querySelector('[data-proj-open-tile]')?.addEventListener('click', () => {
        missionSelectedProjectId = p.id;
        setMissionView('project', p.id);
        renderMissionProjects();
      });

      missionWidgetGrid.appendChild(tile);
    });
  }

  function renderMissionProjects() {
    if (!missionProjectsList) return;
    missionProjectsList.innerHTML = '';
    missionProjectsList.style.display = 'grid';
    missionProjectsList.style.gridTemplateColumns = '1fr';
    missionProjectsList.style.gap = '6px';
    const projects = [...missionProjects].sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
    if (!projects.length) {
      missionProjectsList.innerHTML = '<div style="opacity:.8;font-size:.72rem;">No projects found.</div>';
      setMissionView('hub');
      renderMissionAgentTiles('');
      return;
    }
    if (!missionSelectedProjectId || !projects.some(p => p.id === missionSelectedProjectId)) {
      missionSelectedProjectId = projects[0].id;
    }

    projects.forEach(p => {
      const projectAgents = missionAgents.filter(a => a.project_id === p.id);
      const row = document.createElement('div');
      row.style.border = `1px solid ${(p.id === missionSelectedProjectId) ? 'var(--primary)' : 'var(--glass-border)'}`;
      row.style.background = (p.id === missionSelectedProjectId) ? 'var(--primary-glow)' : 'var(--glass-1)';
      row.style.borderRadius = '9px';
      row.style.padding = '8px';
      row.style.display = 'flex';
      row.style.flexDirection = 'column';
      row.style.gap = '6px';
      row.innerHTML =
        `<div style="font-size:.74rem;font-weight:600;">${esc(p.name || 'Untitled Project')}</div>` +
        `<div style="font-size:.66rem;opacity:.8;">${projectAgents.length} agents</div>` +
        `<div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="hdr-btn" data-proj-open="${esc(p.id)}">Open Workspace</button>
          <button class="hdr-btn" data-proj-select="${esc(p.id)}">Select</button>
        </div>`;

      row.querySelector('[data-proj-open]')?.addEventListener('click', () => {
        missionSelectedProjectId = p.id;
        setMissionView('project', p.id);
        renderMissionProjects();
      });

      row.querySelector('[data-proj-select]')?.addEventListener('click', () => {
        missionSelectedProjectId = p.id;
        if (missionViewMode === 'project') {
          setMissionView('project', p.id);
        }
        renderMissionProjects();
      });

      missionProjectsList.appendChild(row);
    });

    const selected = missionProjects.find(p => p.id === missionSelectedProjectId) || {};
    const selectedAgents = missionAgents.filter(a => a.project_id === missionSelectedProjectId);
    if (missionViewMode === 'project') {
      document.querySelectorAll('.project-tile-dynamic').forEach(el => el.remove());
      renderMissionProjectTiles(); // Clear projects
      renderMissionFiles(missionSelectedProjectId);
      renderProjectMemoryPreview(missionSelectedProjectId);
      renderMissionMiscTiles();
      renderMissionAgentTiles(missionSelectedProjectId);
      applyMissionWidgetBoard();
      bindMissionWidgetDnD();
      if (missionPageMeta) {
        missionPageMeta.textContent = `Project Workspace · ${selected.name || 'Untitled'} · Agents: ${selectedAgents.length}`;
      }
    } else {
      renderMissionUsageGraph('');
      if (missionAgentGraph && missionUsageGraph) {
        missionAgentGraph.innerHTML = `<div style="font-size:.72rem;color:var(--text-muted);margin-bottom:6px;">Usage stats</div>${missionUsageGraph.innerHTML}`;
      }
      renderMissionAgentTiles('');
      renderMissionProjectTiles();
      renderMissionMiscTiles();
      applyMissionWidgetBoard();
      bindMissionWidgetDnD();
      if (missionPageMeta) {
        missionPageMeta.textContent = `Mission Hub · Projects ${projects.length} · Independent agents ${missionAgents.filter(a => !String(a.project_id || '').trim()).length}`;
      }
    }
  }

  function openMissionPage() {
    if (!missionPage || !chatPane || !sandboxPane) return;
    missionPage.style.display = 'block';
    chatPane.style.display = 'none';
    sandboxPane.classList.remove('open');
    sandboxPane.style.display = 'none';
    if (missionSchedRunAt && !missionSchedRunAt.value) {
      const d = new Date(Date.now() + 5 * 60 * 1000);
      missionSchedRunAt.value = d.toISOString().slice(0, 16);
    }
    setMissionView('hub');
    applyMissionWidgetBoard();
    requestAnimationFrame(() => {
      syncMissionGridSquares();
      applyMissionWidgetBoard();
    });
    renderMissionProjects();
    loadScheduledActions();
  }

  function closeMissionPage() {
    if (!missionPage || !chatPane || !sandboxPane) return;
    missionPage.style.display = 'none';
    chatPane.style.display = '';
    sandboxPane.style.display = '';
  }

  // Sidebar controls
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('menu-btn');
  const newChatSidebar = document.getElementById('new-chat-sidebar');
  
  menuBtn?.addEventListener('click', () => {
    if (!sidebar) return;
    sidebar.classList.toggle('open');
    const mainEl = document.getElementById('main');
    mainEl?.classList.toggle('sidebar-open', sidebar.classList.contains('open'));
  });
  newChatSidebar?.addEventListener('click', startNewChat);

  const chatBox      = document.getElementById('chat-box');
  const chatPane     = document.getElementById('chat-pane');
  const form         = document.getElementById('chat-form');
  const input        = document.getElementById('user-input');
  
  // ── Restore Chat on Load ──────────────────────────────────────────────
  window.addEventListener('load', () => {
    // Open settings only when no provider key exists at all.
    if (!hasAnyApiKey()) {
      openSettings();
    }

    refreshModelOptionMeta();

    renderHistory();
    // Wait a tick for DOM
    setTimeout(() => {
      if (sessionMessages && sessionMessages.length > 0) {
        sessionMessages.forEach(m => {
          if (m.role === 'user') {
            addUserMsg(m.content, false); 
          } else {
            addAssistantMsg(m.content, m.classification, m.traces, false);
          }
        });
      }
    }, 50);

    openMissionPage();
  });
  const sendBtn      = document.getElementById('send-btn');
  const webUrlInput  = document.getElementById('web-url-input');
  const webAutoToggle = document.getElementById('web-auto-toggle');
  const webUrlToggle = document.getElementById('web-url-toggle');
  const webUrlWrap   = document.getElementById('web-url-wrap');
  const killSwitchBtn = document.getElementById('kill-switch-btn');
  const resetBtn     = document.getElementById('reset-btn');
  const sandboxBtn   = document.getElementById('toggle-sandbox');
  const modeSelect   = document.getElementById('chat-mode');
  const modelSelect  = document.getElementById('model-select');
  const projectsBtn  = document.getElementById('projects-btn');
  const projectsModal = document.getElementById('projects-modal');
  const projectsClose = document.getElementById('projects-close');
  const projectList = document.getElementById('project-list');
  const workshopBtn = document.getElementById('workshop-btn');
  const calendarBtn = document.getElementById('calendar-btn');
  const calendarModal = document.getElementById('calendar-modal');
  const calendarClose = document.getElementById('calendar-close');
  const schedRunAt = document.getElementById('sched-run-at');
  const schedMessage = document.getElementById('sched-message');
  const schedMode = document.getElementById('sched-mode');
  const schedTargetAgent = document.getElementById('sched-target-agent');
  const schedNote = document.getElementById('sched-note');
  const schedRepeat = document.getElementById('sched-repeat');
  const schedCreateBtn = document.getElementById('sched-create-btn');
  const schedList = document.getElementById('sched-list');
  const missionBtn = document.getElementById('mission-btn');
  const missionFab = document.getElementById('mission-fab');
  const missionPlusFab = document.getElementById('mission-plus-fab');
  const missionPlusMenu = document.getElementById('mission-plus-menu');
  const missionPlusAddProject = document.getElementById('mission-plus-add-project');
  const missionPlusAddAgent = document.getElementById('mission-plus-add-agent');
  const missionPlusOpenHub = document.getElementById('mission-plus-open-hub');
  const missionTilePlus = document.getElementById('mission-tile-plus');
  const missionTileAddProject = document.getElementById('mission-tile-add-project');
  const missionTileAddAgent = document.getElementById('mission-tile-add-agent');
  const missionGridContextMenu = document.getElementById('mission-grid-context-menu');
  const missionContextAddManager = document.getElementById('mission-context-add-manager');
  const missionContextAddProject = document.getElementById('mission-context-add-project');
  const missionContextAddAgent = document.getElementById('mission-context-add-agent');
  const missionContextAddMiscNote = document.getElementById('mission-context-add-misc-note');
  const missionContextAddMiscPackager = document.getElementById('mission-context-add-misc-packager');
  const missionPage = document.getElementById('mission-page');
  const missionWidgetGrid = document.getElementById('mission-widget-grid');
  const missionGridGuide = document.getElementById('mission-grid-guide');
  const missionDropPreview = document.getElementById('mission-drop-preview');
  const missionPageClose = document.getElementById('mission-page-close');
  const missionPageMeta = document.getElementById('mission-page-meta');
  const missionPageProjectLabel = document.getElementById('mission-page-project-label');
  const missionProjectsTitle = document.getElementById('mission-projects-title');
  const missionAgentsTitle = document.getElementById('mission-agents-title');
  const missionFilesTitle = document.getElementById('mission-files-title');
  const missionInspectorTitle = document.getElementById('mission-inspector-title');
  const missionMiscTitle = document.getElementById('mission-misc-title');
  const missionOpenProjectMemory = document.getElementById('mission-open-project-memory');
  const missionProjectsList = document.getElementById('mission-projects-list');
  const missionUsageGraph = document.getElementById('mission-usage-graph');
  const missionAddProjectBtn = document.getElementById('mission-add-project-btn');
  const missionAgentsList = document.getElementById('mission-agents-list');
  const missionAddAgentBtn = document.getElementById('mission-add-agent-btn');
  const missionAddFileBtn = document.getElementById('mission-add-file-btn');
  const missionFileList = document.getElementById('mission-file-list');
  const missionFileName = document.getElementById('mission-file-name');
  const missionFileEditor = document.getElementById('mission-file-editor');
  const missionFileSaveBtn = document.getElementById('mission-file-save-btn');
  const missionAgentInspector = document.getElementById('mission-agent-inspector');
  const missionAgentGraph = document.getElementById('mission-agent-graph');
  const missionEventToggleBtn = document.getElementById('mission-event-toggle-btn');
  const missionEventForm = document.getElementById('mission-event-form');
  const missionEventTitle = document.getElementById('mission-event-title');
  const missionEventSources = document.getElementById('mission-event-sources');
  const missionSchedRunAt = document.getElementById('mission-sched-run-at');
  const missionSchedMessage = document.getElementById('mission-sched-message');
  const missionSchedMode = document.getElementById('mission-sched-mode');
  const missionSchedTargetAgent = document.getElementById('mission-sched-target-agent');
  const missionSchedRepeat = document.getElementById('mission-sched-repeat');
  const missionSchedCreateBtn = document.getElementById('mission-sched-create-btn');
  const missionSchedList = document.getElementById('mission-sched-list');
  const missionCalendarPrev = document.getElementById('mission-calendar-prev');
  const missionCalendarNext = document.getElementById('mission-calendar-next');
  const missionCalendarMonthLabel = document.getElementById('mission-calendar-month-label');
  const missionCalendarGrid = document.getElementById('mission-calendar-grid');
  const missionCalendarDayView = document.getElementById('mission-calendar-day-view');
  const agentChatModal = document.getElementById('agent-chat-modal');
  const agentChatBack = document.getElementById('agent-chat-back');
  const agentChatTitle = document.getElementById('agent-chat-title');
  const agentChatPath = document.getElementById('agent-chat-path');
  const agentChatClose = document.getElementById('agent-chat-close');
  const agentChatMessages = document.getElementById('agent-chat-messages');
  const agentChatInput = document.getElementById('agent-chat-input');
  const agentChatSend = document.getElementById('agent-chat-send');
  const agentChatContext = document.getElementById('agent-chat-context');
  const agentConfigModal = document.getElementById('agent-config-modal');
  const agentConfigTitle = document.getElementById('agent-config-title');
  const agentConfigClose = document.getElementById('agent-config-close');
  const agentConfigName = document.getElementById('agent-config-name');
  const agentConfigProject = document.getElementById('agent-config-project');
  const agentConfigMode = document.getElementById('agent-config-mode');
  const agentConfigInstructions = document.getElementById('agent-config-instructions');
  const agentConfigSources = document.getElementById('agent-config-sources');
  const agentConfigMemory = document.getElementById('agent-config-memory');
  const agentConfigDelete = document.getElementById('agent-config-delete');
  const agentConfigSave = document.getElementById('agent-config-save');
  const projectMemoryModal = document.getElementById('project-memory-modal');
  const projectMemoryTitle = document.getElementById('project-memory-title');
  const projectMemoryClose = document.getElementById('project-memory-close');
  const projectMemoryList = document.getElementById('project-memory-list');
  const projectMemoryFileName = document.getElementById('project-memory-file-name');
  const projectMemoryEditor = document.getElementById('project-memory-editor');
  const projectMemorySave = document.getElementById('project-memory-save');
  const missionModal = document.getElementById('mission-modal');
  const missionClose = document.getElementById('mission-close');
  const mcRunId = document.getElementById('mc-run-id');
  const mcRunStatus = document.getElementById('mc-run-status');
  const mcRunGraph = document.getElementById('mc-run-graph');
  const mcInspector = document.getElementById('mc-inspector');
  const mcPauseBtn = document.getElementById('mc-pause-btn');
  const mcResumeBtn = document.getElementById('mc-resume-btn');
  const mcApproveBtn = document.getElementById('mc-approve-btn');
  const mcApproveNote = document.getElementById('mc-approve-note');
  const mcRerouteBtn = document.getElementById('mc-reroute-btn');
  const mcRerouteAgent = document.getElementById('mc-reroute-agent');
  const mcRerouteNote = document.getElementById('mc-reroute-note');
  const mcRerunAgentBtn = document.getElementById('mc-rerun-agent-btn');
  const mcCompareRunId = document.getElementById('mc-compare-run-id');
  const mcCompareBtn = document.getElementById('mc-compare-btn');
  const mcCompareOutput = document.getElementById('mc-compare-output');
  const mcBranchCheckpoint = document.getElementById('mc-branch-checkpoint');
  const mcBranchBtn = document.getElementById('mc-branch-btn');
  const workshopModal = document.getElementById('workshop-modal');
  const workshopClose = document.getElementById('workshop-close');
  const workshopModeList = document.getElementById('workshop-mode-list');
  const workshopModeName = document.getElementById('workshop-mode-name');
  const workshopAgents = document.getElementById('workshop-agents');
  const workshopNewModeBtn = document.getElementById('workshop-new-mode');
  const workshopAddAgentBtn = document.getElementById('workshop-add-agent');
  const workshopSaveModeBtn = document.getElementById('workshop-save-mode');
  const workshopCloneModeBtn = document.getElementById('workshop-clone-mode');
  const workshopExportModeBtn = document.getElementById('workshop-export-mode');
  const workshopImportModeBtn = document.getElementById('workshop-import-mode');
  const workshopDeleteModeBtn = document.getElementById('workshop-delete-mode');
  const workshopUseModeBtn = document.getElementById('workshop-use-mode');
  const workshopMeta = document.getElementById('workshop-meta');
  const memoryBtn    = document.getElementById('memory-btn');
  const memoryModal  = document.getElementById('memory-modal');
  const memoryClose  = document.getElementById('memory-close');
  const memoryContent = document.getElementById('memory-content');
  const thinkBar     = document.getElementById('thinking-bar');
  const sandboxPane  = document.getElementById('sandbox-pane');
  const sandboxFrame = document.getElementById('sandbox-frame');
  const sandboxViewToggle = document.getElementById('sb-view-toggle');
  const sandboxFilesEl = document.getElementById('sandbox-files');
  const sandboxEditor = document.getElementById('sandbox-editor');
  const welcomeSuggestions = document.getElementById('welcome-suggestions');
  let missionCurrentRunId = '';
  let missionCurrentRun = null;
  let missionSelectedProjectId = '';
  let missionSelectedTrace = null;
  let missionOpenAgentId = '';
  let agentModalReturnTo = 'mission';
  let editingAgentId = '';
  let missionViewMode = 'hub';
  let missionUsageActiveTab = 'agent';
  let projectMemoryFileId = '';
  let missionCalendarCursor = new Date();
  let missionCalendarSelectedDayKey = '';
  let missionPendingNewTileCell = null;
  let missionPendingNewTileType = '';

  // Themes & Settings
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const settingsClose = document.getElementById('settings-close');
  const themes = document.querySelectorAll('.theme-opt');

  function syncWebAutoButton() {
    if (!webAutoToggle) return;
    const on = getWebAutoSearch();
    webAutoToggle.classList.toggle('active', on);
    webAutoToggle.textContent = '🌐';
    webAutoToggle.title = on
      ? 'Auto web lookup is enabled'
      : 'Auto web lookup is disabled';
  }

  function syncMissionButton() {
    if (!missionBtn) return;
    missionBtn.style.display = 'inline-flex';
  }

  function applySavedModelSelection() {
    if (!modelSelect) return;
    const saved = getSelectedModel().trim();
    const exists = saved && Array.from(modelSelect.options || []).some(o => o.value === saved);
    if (exists) {
      modelSelect.value = saved;
      return;
    }
    setSelectedModel(modelSelect.value || '');
  }

  function openSettings() { settingsModal?.classList.add('open'); }
  function closeSettings() { settingsModal?.classList.remove('open'); }
  function setTheme(t) {
    document.body.dataset.theme = t;
    themes.forEach(opt => opt.classList.toggle('active', opt.dataset.t === t));
    localStorage.setItem('vibe_theme', t);
  }

  /* ── Custom glass dropdowns ────────────────────────────────── */
  function buildCustomSelects() {
    const ids = ['chat-mode', 'model-select'];
    ids.forEach(id => {
      const sel = document.getElementById(id);
      if (!sel || sel.dataset.customized) return;
      sel.dataset.customized = '1';

      // Wrap the native select
      const wrapper = document.createElement('div');
      wrapper.className = 'custom-select';
      wrapper.dataset.for = id;
      sel.parentNode.insertBefore(wrapper, sel);
      wrapper.appendChild(sel);
      sel.classList.add('custom-select-native');

      // Trigger button
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'custom-select-btn';

      const lbl = document.createElement('span');
      lbl.className = 'custom-select-label';

      const chev = document.createElement('span');
      chev.className = 'custom-select-chevron';
      chev.innerHTML = `<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

      const icon = document.createElement('span');
      icon.className = 'custom-select-icon';
      icon.textContent = id === 'chat-mode' ? '🧠' : '⚙️';
      wrapper.classList.add('icon-only');

      btn.appendChild(icon);
      btn.appendChild(lbl);
      btn.appendChild(chev);
      wrapper.appendChild(btn);

      // Floating panel
      const panel = document.createElement('div');
      panel.className = 'custom-select-panel';
      wrapper.appendChild(panel);

      let syncTimer = null;
      function sync() {
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
          const cur = sel.value;
          lbl.textContent = sel.options[sel.selectedIndex]?.text ?? '';
          btn.title = sel.options[sel.selectedIndex]?.text ?? '';
          btn.setAttribute('aria-label', sel.options[sel.selectedIndex]?.text ?? 'Selector');
          panel.innerHTML = '';

          // Prismatic edge pseudo (stays from CSS ::before)
          let prevGroup = null;
          Array.from(sel.options).forEach(opt => {
            // Add divider between builtin & custom modes
            const grp = opt.dataset.group || '';
            if (prevGroup !== null && grp !== prevGroup) {
              const div = document.createElement('div');
              div.className = 'custom-select-divider';
              panel.appendChild(div);
            }
            prevGroup = grp;

            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'custom-select-option' + (opt.value === cur ? ' is-selected' : '');
            item.textContent = opt.text;
            item.dataset.value = opt.value;
            item.addEventListener('click', e => {
              e.stopPropagation();
              sel.value = opt.value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              closeAll();
            });
            panel.appendChild(item);
          });

          // Right-align if panel would overflow viewport
          const rect = wrapper.getBoundingClientRect();
          panel.classList.toggle('align-right', rect.left + 300 > window.innerWidth);

          // Flip upward if the panel would go off-screen below
          const viewportH = window.innerHeight || document.documentElement.clientHeight;
          const spaceBelow = viewportH - rect.bottom;
          const spaceAbove = rect.top;
          const estimatedPanelHeight = Math.min(340, Math.max(160, (sel.options?.length || 1) * 38 + 12));
          const shouldDropUp = spaceBelow < estimatedPanelHeight && spaceAbove > spaceBelow;
          panel.classList.toggle('drop-up', shouldDropUp);
        }, 16);
      }

      sync();

      // Observe option list changes (populateModeSelect replaces innerHTML)
      new MutationObserver(sync).observe(sel, { childList: true, subtree: true });
      // Observe value changes from external code
      sel.addEventListener('change', sync);

      // Toggle open
      btn.addEventListener('click', e => {
        e.stopPropagation();
        sync();
        const wasOpen = wrapper.classList.contains('open');
        closeAll();
        if (!wasOpen) wrapper.classList.add('open');
      });

      window.addEventListener('resize', sync);
    });

    function closeAll() {
      document.querySelectorAll('.custom-select.open').forEach(w => w.classList.remove('open'));
    }
    document.addEventListener('click', closeAll);
  }

  settingsBtn?.addEventListener('click', openSettings);
  settingsClose?.addEventListener('click', closeSettings);
  settingsModal?.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });
  themes.forEach(opt => opt.addEventListener('click', () => setTheme(opt.dataset.t)));
  applySavedModelSelection();
  refreshModelOptionMeta();
  populateModeSelect();
  buildCustomSelects();
  modeSelect?.addEventListener('change', () => {
    setMode(modeSelect.value);
    populateModeSelect();
  });
  modelSelect?.addEventListener('change', () => {
    setSelectedModel(modelSelect.value || '');
    refreshModelOptionMeta();
    if (!hasAnyApiKey()) openSettings();
  });
  webAutoToggle?.addEventListener('click', () => {
    setWebAutoSearch(!getWebAutoSearch());
    syncWebAutoButton();
  });
  webUrlToggle?.addEventListener('click', () => {
    const opening = !webUrlWrap?.classList.contains('open');
    webUrlWrap?.classList.toggle('open', opening);
    if (!opening && webUrlInput) webUrlInput.value = '';
    if (opening) setTimeout(() => webUrlInput?.focus(), 40);
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-suggest]');
    if (!btn) return;
    const kind = btn.dataset.suggest;
    if (!input) return;
    if (kind === 'app') {
      input.value = 'Build me a complete app from scratch with a clean folder structure. Use multiple files and explain how to run it.';
      pendingPromptContext = APP_BUILD_CONTEXT;
      showToast('App builder context added for the next prompt.', 'info', 2200);
    } else if (kind === 'debug') {
      input.value = 'Help me debug this issue step by step. Ask for logs, isolate root cause, and propose a minimal fix first.';
      pendingPromptContext = '';
    } else if (kind === 'plan') {
      input.value = 'Create a detailed execution plan with milestones, tasks, and risks before writing code.';
      pendingPromptContext = '';
    } else if (kind === 'learn') {
      input.value = 'Explain this concept clearly with examples, then give me a practical mini-project to apply it.';
      pendingPromptContext = '';
    }
    input.focus();
  });
  syncWebAutoButton();
  syncMissionButton();

  const savedTheme = localStorage.getItem('vibe_theme') || 'default';
  setTheme(savedTheme);

  let lastHtmlCode = '';
  let pendingPromptContext = '';
  let sandboxFiles = [];
  let activeSandboxFile = '';
  let sandboxBlobUrls = [];
  let activeLoopRun = null;
  let memoryData = null;
  let stageTimer = null;
  let workshopFiles = [];
  let activeWorkshopMode = null;

  /* ── Sandbox ──────────────────────────────────────────────────── */
  function inferLangFromPath(path = '') {
    const p = path.toLowerCase();
    if (p.endsWith('.html') || p.endsWith('.htm')) return 'html';
    if (p.endsWith('.css')) return 'css';
    if (p.endsWith('.js') || p.endsWith('.mjs')) return 'javascript';
    if (p.endsWith('.ts') || p.endsWith('.tsx')) return 'typescript';
    if (p.endsWith('.json')) return 'json';
    if (p.endsWith('.md')) return 'markdown';
    return 'text';
  }

  function mimeFromPath(path = '') {
    const p = path.toLowerCase();
    if (p.endsWith('.css')) return 'text/css';
    if (p.endsWith('.js') || p.endsWith('.mjs')) return 'text/javascript';
    if (p.endsWith('.json')) return 'application/json';
    if (p.endsWith('.svg')) return 'image/svg+xml';
    if (p.endsWith('.txt') || p.endsWith('.md')) return 'text/plain';
    return 'text/plain';
  }

  function buildStarterFiles() {
    return [
      {
        path: 'index.html',
        lang: 'html',
        code:
`<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Starter App</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main id="app">
      <h1>Starter App</h1>
      <p>Edit files in the sandbox file system.</p>
      <button id="btn">Click me</button>
      <p id="out"></p>
    </main>
    <script src="app.js"><\/script>
  </body>
</html>`,
      },
      {
        path: 'styles.css',
        lang: 'css',
        code:
`body { font-family: Inter, system-ui, sans-serif; background:#0b1220; color:#e2e8f0; margin:0; padding:24px; }
#app { max-width: 720px; margin:auto; background:#111827; border:1px solid #334155; border-radius:12px; padding:20px; }
button { border:0; padding:10px 14px; border-radius:8px; background:#2563eb; color:white; cursor:pointer; }`,
      },
      {
        path: 'app.js',
        lang: 'javascript',
        code:
`const btn = document.getElementById('btn');
const out = document.getElementById('out');
let n = 0;
btn.addEventListener('click', () => {
  n += 1;
  out.textContent = 'Clicks: ' + n;
});`,
      },
    ];
  }

  function normalizeSandboxFiles(files = []) {
    if (!Array.isArray(files) || !files.length) return buildStarterFiles();
    const out = [];
    const seen = new Set();
    for (const f of files) {
      const path = String(f?.path || '').trim();
      if (!path || seen.has(path)) continue;
      seen.add(path);
      out.push({
        path,
        lang: f?.lang || inferLangFromPath(path),
        code: String(f?.code || ''),
      });
    }
    return out.length ? out : buildStarterFiles();
  }

  function clearSandboxBlobUrls() {
    sandboxBlobUrls.forEach(url => URL.revokeObjectURL(url));
    sandboxBlobUrls = [];
  }

  function setSandboxView(mode = 'project') {
    const project = mode !== 'code';
    sandboxPane.classList.toggle('project-view', project);
    sandboxPane.classList.toggle('code-view', !project);
    if (sandboxViewToggle) sandboxViewToggle.checked = !project;
  }

  function buildSandboxPreviewHtml(files) {
    const htmlFile = files.find(f => /\.html?$/i.test(f.path)) || files.find(f => f.lang === 'html');
    if (!htmlFile) {
      return `<!doctype html><html><body style="font-family:sans-serif;padding:16px;">No HTML entry file found. Add <b>index.html</b> in the file list.</body></html>`;
    }

    clearSandboxBlobUrls();
    let html = String(htmlFile.code || '');
    const map = new Map();

    for (const f of files) {
      if (f.path === htmlFile.path) continue;
      const blob = new Blob([String(f.code || '')], { type: mimeFromPath(f.path) });
      const url = URL.createObjectURL(blob);
      sandboxBlobUrls.push(url);
      map.set(f.path, url);
      const base = f.path.split('/').pop();
      if (base && !map.has(base)) map.set(base, url);
    }

    map.forEach((url, path) => {
      const safe = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp(`(["'])${safe}\\1`, 'g'), `$1${url}$1`);
      html = html.replace(new RegExp(`(["'])\\./${safe}\\1`, 'g'), `$1${url}$1`);
    });

    return html;
  }

  function renderSandboxFileList() {
    if (!sandboxFilesEl) return;
    sandboxFilesEl.innerHTML = '';
    sandboxFiles.forEach(f => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sb-file-item' + (f.path === activeSandboxFile ? ' active' : '');
      btn.textContent = f.path;
      btn.onclick = () => {
        activeSandboxFile = f.path;
        renderSandboxEditor();
        renderSandboxFileList();
      };
      sandboxFilesEl.appendChild(btn);
    });
  }

  function renderSandboxEditor() {
    const active = sandboxFiles.find(f => f.path === activeSandboxFile) || sandboxFiles[0];
    if (!active) {
      if (sandboxEditor) sandboxEditor.value = '';
      return;
    }
    activeSandboxFile = active.path;
    if (sandboxEditor && sandboxEditor.value !== active.code) {
      sandboxEditor.value = active.code;
    }
  }

  function refreshSandboxPreview() {
    if (!sandboxFrame) return;
    const html = buildSandboxPreviewHtml(sandboxFiles);
    lastHtmlCode = html;
    sandboxFrame.srcdoc = html;
  }

  function openSandbox(htmlCode, files = null) {
    const normalized = files ? normalizeSandboxFiles(files) : normalizeSandboxFiles([
      { path: 'index.html', lang: 'html', code: htmlCode || '' },
    ]);
    sandboxFiles = normalized;
    activeSandboxFile = normalized[0]?.path || 'index.html';
    sandboxPane.classList.add('open');
    sandboxBtn.classList.add('active');
    renderSandboxFileList();
    renderSandboxEditor();
    refreshSandboxPreview();
    setSandboxView(sandboxViewToggle?.checked ? 'code' : 'project');
  }
  function closeSandbox() {
    sandboxPane.classList.remove('open');
    sandboxBtn.classList.remove('active');
    sandboxFrame.srcdoc = '';
    clearSandboxBlobUrls();
  }
  sandboxBtn?.addEventListener('click', () => {
    sandboxPane.classList.contains('open') ? closeSandbox()
      : (sandboxFiles.length ? openSandbox('', sandboxFiles) : (lastHtmlCode ? openSandbox(lastHtmlCode) : null));
  });
  sandboxViewToggle?.addEventListener('change', () => {
    setSandboxView(sandboxViewToggle.checked ? 'code' : 'project');
  });
  sandboxEditor?.addEventListener('input', () => {
    const file = sandboxFiles.find(f => f.path === activeSandboxFile);
    if (!file) return;
    file.code = sandboxEditor.value;
  });
  document.getElementById('sb-close')?.addEventListener('click', closeSandbox);
  document.getElementById('sb-new-app')?.addEventListener('click', () => {
    openSandbox('', buildStarterFiles());
  });
  document.getElementById('sb-add-file')?.addEventListener('click', () => {
    const path = (prompt('File path (e.g. src/app.js or styles.css):', 'new-file.js') || '').trim();
    if (!path) return;
    if (sandboxFiles.some(f => f.path === path)) {
      showToast('File already exists in sandbox.', 'error');
      return;
    }
    sandboxFiles.push({ path, lang: inferLangFromPath(path), code: '' });
    activeSandboxFile = path;
    renderSandboxFileList();
    renderSandboxEditor();
  });
  document.getElementById('sb-reload')?.addEventListener('click', () => {
    refreshSandboxPreview();
  });
  document.getElementById('sb-fullscreen')?.addEventListener('click', () => {
    sandboxFrame.requestFullscreen?.() || sandboxFrame.webkitRequestFullscreen?.();
  });
  document.getElementById('sb-save')?.addEventListener('click', () => {
    if (!sandboxFiles.length) return;
    saveProjectFromFiles(sandboxFiles);
  });

  function extractFileSystemFromText(text) {
    if (!text) return [];
    const out = [];
    const re = /(^|\n)(`{3,}|~{3,})\s*([^\n]*)\n([\s\S]*?)\n\2(?=\n|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const header = (m[3] || '').trim();
      const code = m[4] || '';
      if (!code.trim()) continue;

      let path = '';
      const fname = header.match(/(?:file(?:name)?|path)\s*[:=]\s*([^\s,]+)/i);
      if (fname) path = fname[1].trim();

      if (!path) {
        const tokenPath = header.split(/\s+/).find(tok => /[./\\]/.test(tok) && /\.[a-z0-9]{1,8}$/i.test(tok));
        if (tokenPath) path = tokenPath.trim();
      }

      if (!path) {
        const lang = (header.split(/\s+/)[0] || '').toLowerCase();
        const extMap = { html: 'index.html', htm: 'index.html', css: 'styles.css', javascript: 'app.js', js: 'app.js', typescript: 'app.ts', ts: 'app.ts', json: 'data.json', md: 'README.md', markdown: 'README.md', python: 'app.py', py: 'app.py' };
        if (extMap[lang]) path = extMap[lang];
      }

      if (!path) continue;
      if (out.some(f => f.path === path)) continue;
      out.push({ path, lang: inferLangFromPath(path), code });
      if (out.length >= 24) break;
    }
    return out;
  }

  function saveProjectFromCode(code, lang = 'text') {
    const defaultTitle = `Project ${new Date().toLocaleString()}`;
    const title = prompt('Project name:', defaultTitle);
    if (!title) return;

    const projects = loadProjects();
    projects.unshift({
      id: Date.now().toString(),
      title: title.trim(),
      lang,
      code,
      created_at: Date.now(),
    });
    saveProjects(projects.slice(0, 200));
    renderProjects();
    projectsModal.classList.add('open');
  }

  function saveProjectFromFiles(files) {
    const defaultTitle = `App ${new Date().toLocaleString()}`;
    const title = prompt('Project name:', defaultTitle);
    if (!title) return;
    const projects = loadProjects();
    projects.unshift({
      id: Date.now().toString(),
      title: title.trim(),
      lang: 'filesystem',
      files: (files || []).map(f => ({ path: f.path, lang: f.lang, code: f.code })),
      created_at: Date.now(),
    });
    saveProjects(projects.slice(0, 200));
    renderProjects();
    projectsModal.classList.add('open');
  }

  function renderProjects() {
    const projects = loadProjects();
    projectList.innerHTML = '';

    if (!projects.length) {
      projectList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">No saved projects yet.</div>';
      return;
    }

    projects.forEach(p => {
      const row = document.createElement('div');
      row.className = 'project-item';

      const t = document.createElement('div');
      t.className = 'project-title';
      const fileCount = Array.isArray(p.files) ? p.files.length : 0;
      t.textContent = `${p.title} • ${p.lang || 'text'}${fileCount ? ` • ${fileCount} files` : ''}`;

      const openBtn = document.createElement('button');
      openBtn.className = 'hdr-btn';
      openBtn.textContent = 'Open';
      openBtn.onclick = () => {
        if (Array.isArray(p.files) && p.files.length) {
          openSandbox('', p.files);
        } else {
          openSandbox(p.code || '');
        }
      };

      const delBtn = document.createElement('button');
      delBtn.className = 'hdr-btn';
      delBtn.textContent = 'Delete';
      delBtn.onclick = () => {
        const filtered = loadProjects().filter(x => x.id !== p.id);
        saveProjects(filtered);
        renderProjects();
      };

      row.appendChild(t);
      row.appendChild(openBtn);
      row.appendChild(delBtn);
      projectList.appendChild(row);
    });
  }

  function openProjects() {
    renderProjects();
    projectsModal.classList.add('open');
  }
  function closeProjects() { projectsModal.classList.remove('open'); }

  projectsBtn?.addEventListener('click', openProjects);
  projectsClose?.addEventListener('click', closeProjects);
  projectsModal?.addEventListener('click', (e) => { if (e.target === projectsModal) closeProjects(); });

  /* ── Agent Workshop ─────────────────────────────────────────── */
  function slugify(s) {
    return (s || 'custom-mode')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'custom-mode';
  }

  function makeAgent(name = 'Agent') {
    return {
      name,
      persona: 'You are a helpful assistant with a distinct, friendly personality.',
      files: [],
      temperature: 0.7,
    };
  }

  function makeMode(name = 'New Custom Mode') {
    const id = `custom:${slugify(name)}-${Date.now().toString().slice(-5)}`;
    return { id, name, agents: [makeAgent('Planner'), makeAgent('Writer')] };
  }

  function cloneMode(mode) {
    const baseName = `${mode?.name || 'Custom Mode'} Copy`;
    const cloned = JSON.parse(JSON.stringify(mode || makeMode()));
    cloned.id = `custom:${slugify(baseName)}-${Date.now().toString().slice(-5)}`;
    cloned.name = baseName;
    return cloned;
  }

  function renderWorkshopModeList() {
    const modes = loadCustomModes();
    workshopModeList.innerHTML = '';
    if (!modes.length) {
      workshopModeList.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);">No custom modes yet.</div>';
      return;
    }
    modes.forEach(m => {
      const row = document.createElement('button');
      row.className = 'hdr-btn';
      row.style.textAlign = 'left';
      row.style.width = '100%';
      row.textContent = `${m.name || 'Custom Mode'} (${(m.agents || []).length})`;
      if (activeWorkshopMode && activeWorkshopMode.id === m.id) row.classList.add('active');
      row.onclick = () => {
        activeWorkshopMode = JSON.parse(JSON.stringify(m));
        renderWorkshopEditor();
      };
      workshopModeList.appendChild(row);
    });
  }

  function fileOptionsHtml(selected = []) {
    return workshopFiles.map(f => {
      const sel = selected.includes(f) ? 'selected' : '';
      return `<option value="${esc(f)}" ${sel}>${esc(f)}</option>`;
    }).join('');
  }

  function renderWorkshopEditor() {
    if (!activeWorkshopMode) return;
    workshopModeName.value = activeWorkshopMode.name || '';
    workshopAgents.innerHTML = '';
    const agentCount = (activeWorkshopMode.agents || []).length;
    const fileCount = (activeWorkshopMode.agents || []).reduce((sum, a) => sum + (Array.isArray(a.files) ? a.files.length : 0), 0);
    workshopMeta.textContent = `Agents: ${agentCount} • Attached files: ${fileCount}`;

    (activeWorkshopMode.agents || []).forEach((a, idx) => {
      const card = document.createElement('div');
      card.style.border = '1px solid var(--border)';
      card.style.borderRadius = '8px';
      card.style.padding = '10px';
      card.style.background = 'var(--header-bg)';
      card.innerHTML =
        `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">` +
          `<strong style="font-size:0.78rem;">Agent ${idx + 1}</strong>` +
          `<button class="hdr-btn" data-up="${idx}">↑</button>` +
          `<button class="hdr-btn" data-down="${idx}">↓</button>` +
          `<button class="hdr-btn" data-del="${idx}">Remove</button>` +
        `</div>` +
        `<label style="display:block;font-size:0.7rem;color:var(--text-muted);margin-top:8px;">NAME</label>` +
        `<input data-name="${idx}" value="${esc(a.name || '')}" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);" />` +
        `<label style="display:block;font-size:0.7rem;color:var(--text-muted);margin-top:8px;">PERSONALITY / SYSTEM TEXT</label>` +
        `<textarea data-persona="${idx}" rows="4" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);">${esc(a.persona || '')}</textarea>` +
        `<label style="display:block;font-size:0.7rem;color:var(--text-muted);margin-top:8px;">ATTACHED FILES (multi-select)</label>` +
        `<select data-files="${idx}" multiple size="6" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);">${fileOptionsHtml(a.files || [])}</select>` +
        `<label style="display:block;font-size:0.7rem;color:var(--text-muted);margin-top:8px;">TEMPERATURE (0.0 - 1.5)</label>` +
        `<input data-temp="${idx}" type="number" min="0" max="1.5" step="0.1" value="${Number(a.temperature ?? 0.7)}" style="width:150px;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);" />`;
      workshopAgents.appendChild(card);
    });

    workshopAgents.querySelectorAll('[data-name]').forEach(el => {
      el.addEventListener('input', (e) => {
        const i = Number(e.target.dataset.name);
        activeWorkshopMode.agents[i].name = e.target.value;
      });
    });
    workshopAgents.querySelectorAll('[data-persona]').forEach(el => {
      el.addEventListener('input', (e) => {
        const i = Number(e.target.dataset.persona);
        activeWorkshopMode.agents[i].persona = e.target.value;
      });
    });
    workshopAgents.querySelectorAll('[data-files]').forEach(el => {
      el.addEventListener('change', (e) => {
        const i = Number(e.target.dataset.files);
        activeWorkshopMode.agents[i].files = Array.from(e.target.selectedOptions).map(o => o.value);
      });
    });
    workshopAgents.querySelectorAll('[data-temp]').forEach(el => {
      el.addEventListener('input', (e) => {
        const i = Number(e.target.dataset.temp);
        const v = Number(e.target.value || 0.7);
        activeWorkshopMode.agents[i].temperature = Math.max(0, Math.min(1.5, v));
      });
    });

    workshopAgents.querySelectorAll('[data-up]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.up);
        if (i <= 0) return;
        const a = activeWorkshopMode.agents;
        [a[i - 1], a[i]] = [a[i], a[i - 1]];
        renderWorkshopEditor();
      });
    });
    workshopAgents.querySelectorAll('[data-down]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.down);
        const a = activeWorkshopMode.agents;
        if (i >= a.length - 1) return;
        [a[i + 1], a[i]] = [a[i], a[i + 1]];
        renderWorkshopEditor();
      });
    });
    workshopAgents.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.del);
        activeWorkshopMode.agents.splice(i, 1);
        if (!activeWorkshopMode.agents.length) activeWorkshopMode.agents.push(makeAgent('Agent 1'));
        renderWorkshopEditor();
      });
    });
  }

  async function openWorkshop() {
    workshopModal.classList.add('open');
    try {
      const res = await fetch('/api/workshop/files');
      const data = await res.json();
      workshopFiles = Array.isArray(data.files) ? data.files : [];
    } catch (_) {
      workshopFiles = [];
    }

    const modes = loadCustomModes();
    activeWorkshopMode = modes[0] ? JSON.parse(JSON.stringify(modes[0])) : makeMode();
    renderWorkshopModeList();
    renderWorkshopEditor();
  }

  function closeWorkshop() { workshopModal.classList.remove('open'); }

  function saveActiveWorkshopMode() {
    if (!activeWorkshopMode) return;
    activeWorkshopMode.name = (workshopModeName.value || activeWorkshopMode.name || 'Custom Mode').trim();
    if (!activeWorkshopMode.name) activeWorkshopMode.name = 'Custom Mode';

    const modes = loadCustomModes();
    const idx = modes.findIndex(m => m.id === activeWorkshopMode.id);
    if (idx >= 0) modes[idx] = activeWorkshopMode;
    else modes.push(activeWorkshopMode);
    saveCustomModes(modes);
    renderWorkshopModeList();
    populateModeSelect();
  }

  function exportActiveWorkshopMode() {
    if (!activeWorkshopMode) return;
    const payload = JSON.stringify(activeWorkshopMode, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(activeWorkshopMode.name || 'custom-mode')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importWorkshopMode() {
    const raw = prompt('Paste exported mode JSON:');
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid object');
      if (!Array.isArray(parsed.agents) || !parsed.agents.length) throw new Error('Mode requires at least one agent');

      const sanitized = {
        id: `custom:${slugify(parsed.name || 'imported-mode')}-${Date.now().toString().slice(-5)}`,
        name: String(parsed.name || 'Imported Mode').slice(0, 64),
        agents: parsed.agents.slice(0, 16).map((a, i) => ({
          name: String(a?.name || `Agent ${i + 1}`).slice(0, 40),
          persona: String(a?.persona || 'You are a helpful assistant.'),
          files: Array.isArray(a?.files) ? a.files.filter(f => typeof f === 'string').slice(0, 8) : [],
          temperature: Math.max(0, Math.min(1.5, Number(a?.temperature ?? 0.7))),
        })),
      };

      const modes = loadCustomModes();
      modes.push(sanitized);
      saveCustomModes(modes);
      activeWorkshopMode = sanitized;
      renderWorkshopModeList();
      renderWorkshopEditor();
      populateModeSelect();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  }

  function deleteActiveWorkshopMode() {
    if (!activeWorkshopMode) return;
    const filtered = loadCustomModes().filter(m => m.id !== activeWorkshopMode.id);
    saveCustomModes(filtered);
    activeWorkshopMode = filtered[0] ? JSON.parse(JSON.stringify(filtered[0])) : makeMode();
    renderWorkshopModeList();
    renderWorkshopEditor();
    populateModeSelect();
  }

  workshopBtn?.addEventListener('click', openWorkshop);
  workshopClose?.addEventListener('click', closeWorkshop);
  workshopModal?.addEventListener('click', (e) => { if (e.target === workshopModal) closeWorkshop(); });
  workshopNewModeBtn?.addEventListener('click', () => {
    activeWorkshopMode = makeMode();
    renderWorkshopModeList();
    renderWorkshopEditor();
  });
  workshopAddAgentBtn?.addEventListener('click', () => {
    if (!activeWorkshopMode) return;
    activeWorkshopMode.agents.push(makeAgent(`Agent ${activeWorkshopMode.agents.length + 1}`));
    renderWorkshopEditor();
  });
  workshopSaveModeBtn?.addEventListener('click', saveActiveWorkshopMode);
  workshopCloneModeBtn?.addEventListener('click', () => {
    if (!activeWorkshopMode) return;
    const cloned = cloneMode(activeWorkshopMode);
    const modes = loadCustomModes();
    modes.push(cloned);
    saveCustomModes(modes);
    activeWorkshopMode = cloned;
    renderWorkshopModeList();
    renderWorkshopEditor();
    populateModeSelect();
  });
  workshopExportModeBtn?.addEventListener('click', exportActiveWorkshopMode);
  workshopImportModeBtn?.addEventListener('click', importWorkshopMode);
  workshopDeleteModeBtn?.addEventListener('click', deleteActiveWorkshopMode);
  workshopUseModeBtn?.addEventListener('click', () => {
    saveActiveWorkshopMode();
    if (!activeWorkshopMode) return;
    setMode(activeWorkshopMode.id);
    populateModeSelect();
    closeWorkshop();
  });

  /* ── Helpers ──────────────────────────────────────────────────── */
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function setDisabled(s) { sendBtn.disabled = s; input.disabled = s; }

  function setThinking(html) {
    thinkBar.classList.remove('fade');
    thinkBar.innerHTML = html;
  }
  function clearThinking() {
    thinkBar.classList.add('fade');
    setTimeout(() => { thinkBar.innerHTML = ''; thinkBar.classList.remove('fade'); }, 600);
  }

  function renderWelcomeState() {
    const existing = document.getElementById('welcome-screen');
    const hasMessages = !!chatBox.querySelector('.msg');
    chatPane?.classList.toggle('chat-start', !hasMessages);
    if (hasMessages && existing) {
      existing.remove();
      return;
    }
    if (!hasMessages && !existing) {
      chatBox.innerHTML =
        `<section id="welcome-screen" aria-label="Welcome to Vibe Engine">` +
          `<div class="welcome-head">` +
            `<div class="welcome-logo" aria-label="Vibe Engine logo">` +
              `<span class="logo-mark">⬡</span>` +
              `<span class="logo-text">Vibe Engine</span>` +
            `</div>` +
            `<div>` +
              `<div class="welcome-title">Welcome to Vibe Engine</div>` +
              `<div class="welcome-subtitle">Your professional AI agent workspace. Choose the model and reasoning mode below, then send your first message to start a focused, multi-agent conversation.</div>` +
              `<div class="welcome-suggestions" id="welcome-suggestions">` +
                `<button type="button" class="suggest-chip" data-suggest="app">🚀 Make an app</button>` +
                `<button type="button" class="suggest-chip" data-suggest="debug">🛠️ Debug my code</button>` +
                `<button type="button" class="suggest-chip" data-suggest="plan">🧭 Create a project plan</button>` +
                `<button type="button" class="suggest-chip" data-suggest="learn">📚 Explain a concept</button>` +
              `</div>` +
            `</div>` +
          `</div>` +
        `</section>`;
    }
  }

  /* Parse fenced code blocks robustly (``` or ~~~, varied language labels) */
  function parseCodeBlocks(text) {
    const segs = [];
    const re = /(^|\n)(`{3,}|~{3,})\s*([^\n]*)\n([\s\S]*?)\n\2(?=\n|$)/g;
    let last = 0;
    let m;

    while ((m = re.exec(text)) !== null) {
      const blockStart = m.index + m[1].length;
      if (blockStart > last) {
        segs.push({ type: 'text', content: text.slice(last, blockStart) });
      }

      const rawLang = (m[3] || '').trim().toLowerCase();
      const lang = rawLang.split(/[\s,{]/)[0] || 'text';
      segs.push({ type: 'code', lang, content: m[4] });

      last = blockStart + m[2].length + m[3].length + 1 + m[4].length + 1 + m[2].length;
    }

    if (last < text.length) segs.push({ type: 'text', content: text.slice(last) });

    /* Fallback 1: full HTML document in plain text */
    if (!segs.some(s => s.type === 'code')) {
      const fullHtml = text.match(/((?:<!doctype html[^>]*>|<html[^>]*>)[\s\S]*?<\/html>)/i);
      if (fullHtml) {
        const idx = text.indexOf(fullHtml[1]);
        const before = text.slice(0, idx).trim();
        const after = text.slice(idx + fullHtml[1].length).trim();
        const result = [];
        if (before) result.push({ type: 'text', content: before });
        result.push({ type: 'code', lang: 'html', content: fullHtml[1] });
        if (after) result.push({ type: 'text', content: after });
        return result;
      }
    }

    /* Fallback 2: HTML fragment without <html> wrapper */
    if (!segs.some(s => s.type === 'code')) {
      const fragmentLike = /<(?:canvas|script|style|div|section|main|button|input|svg)\b/i.test(text)
        && /<\/?[a-z][\s\S]*?>/i.test(text);
      if (fragmentLike) {
        return [{ type: 'code', lang: 'html', content: text.trim() }];
      }
    }

    return segs;
  }

  function isRunnableHtml(lang, code) {
    const lc = (lang || '').toLowerCase();
    // Trust explicit HTML tags
    if (lc === 'html' || lc === 'htm') return true;
    if (lc === 'xml' || lc === 'xhtml') return true;
    
    // Fallback: look for document or fragment indicators
    const snippet = code.slice(0, 500).toLowerCase();
    return (
      snippet.includes('<!doctype html') ||
      snippet.includes('<html') ||
      snippet.includes('<body') ||
      snippet.includes('<canvas') ||
      (snippet.includes('<script') && snippet.includes('<\/script>'))
    );
  }

  function extractChecklistItems(traces) {
    if (!Array.isArray(traces) || !traces.length) return [];

    const preferredAgents = ['Architect (V2)', 'PlannerCritic', 'Architect'];
    let sourceText = '';

    for (const name of preferredAgents) {
      const hit = traces.find(t => (t?.agent || '') === name && (t?.content || '').trim());
      if (hit) {
        sourceText = String(hit.content || '');
        break;
      }
    }
    if (!sourceText) return [];

    const lines = sourceText
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, 80);

    // If we have PLAN: section, focus on it.
    let planLines = lines;
    const planStart = lines.findIndex(l => /^plan\s*:/i.test(l));
    if (planStart >= 0) {
      const endMarkers = [/^risks\s*:/i, /^fixes\s*:/i, /^critic/i, /^notes\s*:/i];
      let end = lines.length;
      for (let i = planStart + 1; i < lines.length; i++) {
        if (endMarkers.some(rx => rx.test(lines[i]))) { end = i; break; }
      }
      planLines = lines.slice(planStart + 1, end);
    }

    const items = [];
    for (const ln of planLines) {
      const cleaned = ln
        .replace(/^\d+\s*[\)\.:\-]\s*/, '')
        .replace(/^[-*•]\s*/, '')
        .replace(/^\[\s?[xX ]\s?\]\s*/, '')
        .trim();
      if (!cleaned) continue;
      if (/^(plan|risks|fixes|context|user request)\s*:/i.test(cleaned)) continue;
      items.push(cleaned);
      if (items.length >= 6) break;
    }

    return items;
  }

  /* ── Message rendering ────────────────────────────────────────── */
  function addUserMsg(text, save = true) {
    if (save) {
      sessionMessages.push({ role: 'user', content: text });
      saveCurrentChat();
    }
    const div = document.createElement('div');
    div.className = 'msg user';
    div.innerHTML = `<div class="role">You</div><div class="msg-text">${esc(text)}</div>`;
    chatBox.appendChild(div);
    renderWelcomeState();
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function addAssistantMsg(text, classification, traces, save = true) {
    if (save) {
      sessionMessages.push({ role: 'assistant', content: text, classification, traces });
      saveCurrentChat();
    }
    const div = document.createElement('div');
    div.className = 'msg assistant';

    /* ── Render the clean reply (text + code blocks) ── */
    const segments = parseCodeBlocks(text);
    const extractedFiles = extractFileSystemFromText(text);
    let bodyHtml = '';
    let foundRunnable = null;

    for (const seg of segments) {
      if (seg.type === 'text') {
        const trimmed = seg.content.trim();
        if (trimmed) bodyHtml += `<div class="msg-text">${esc(trimmed)}</div>`;
      } else {
        const runnable = isRunnableHtml(seg.lang, seg.content);
        if (runnable && !foundRunnable) foundRunnable = seg.content;
        bodyHtml +=
          `<div class="code-block">` +
            `<div class="code-block-header">` +
              `<span class="lang">${esc(seg.lang)}</span><div class="spacer"></div>` +
              `<button class="save-btn" data-save data-lang="${esc(seg.lang)}">Save</button>` +
              (runnable ? `<button class="run-btn" data-run>Run</button>` : '') +
            `</div>` +
            `<pre>${esc(seg.content)}</pre>` +
          `</div>`;
      }
    }

    const checklistItems = extractChecklistItems(traces);
    const checklistHtml = checklistItems.length
      ? (
          `<div class="plan-checklist">` +
            `<div class="pc-title">Execution Checklist</div>` +
            `<div class="pc-list">` +
              checklistItems.map((item, idx) =>
                `<label class="pc-item">` +
                  `<input type="checkbox" data-plan-check="${idx}" />` +
                  `<span>${esc(item)}</span>` +
                `</label>`
              ).join('') +
            `</div>` +
          `</div>`
        )
      : '';

    const fsActionHtml = (extractedFiles.length >= 2)
      ? `<div style="margin:0 0 10px;"><button class="hdr-btn" data-open-filesystem>Open as App Files (${extractedFiles.length})</button></div>`
      : '';

    div.innerHTML = `<div class="role">AI</div>${fsActionHtml}${checklistHtml}${bodyHtml}`;

    /* ── Attach run-button handlers ── */
    div.querySelectorAll('[data-run]').forEach(btn => {
      const code = btn.closest('.code-block').querySelector('pre').textContent;
      btn.addEventListener('click', () => openSandbox(code));
    });
    div.querySelectorAll('[data-save]').forEach(btn => {
      const code = btn.closest('.code-block').querySelector('pre').textContent;
      const lang = btn.dataset.lang || 'text';
      btn.addEventListener('click', () => saveProjectFromCode(code, lang));
    });
    div.querySelectorAll('[data-plan-check]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const row = e.target.closest('.pc-item');
        row?.classList.toggle('done', !!e.target.checked);
      });
    });
    div.querySelector('[data-open-filesystem]')?.addEventListener('click', () => {
      openSandbox('', extractedFiles);
    });

    /* ── Auto-open sandbox for HTML games ── */
    if (foundRunnable) setTimeout(() => openSandbox(foundRunnable), 300);

    /* ── Reasoning dropdown (collapsed by default) ── */
    if (traces && traces.length) {
      const totalMs = traces.reduce((s, t) => s + t.elapsed_ms, 0);
      const details = document.createElement('details');
      details.className = 'reasoning-dropdown';

      details.innerHTML =
        `<summary>` +
          `<span class="r-icon">🧠</span> ` +
          `${traces.length} steps · ` +
          `<span class="r-time">${(totalMs / 1000).toFixed(1)}s</span>` +
        `</summary>`;

      const inner = document.createElement('div');
      inner.className = 'reasoning-inner';

      for (const t of traces) {
        const agent = document.createElement('details');
        agent.className = `agent-dropdown agent-${t.agent}`;
        const prompt = (t.input_messages || [])
          .map(m => `${(m.role || '').toUpperCase()}: ${m.content}`)
          .join('\n\n');
        agent.innerHTML =
          `<summary>${esc(t.agent)} <span class="a-ms">${t.elapsed_ms}ms</span></summary>` +
          `<pre><b>Step input:</b>\n${esc(prompt || '(none)')}\n\n<b>Step output:</b>\n${esc(t.content)}</pre>`;
        inner.appendChild(agent);
      }

      details.appendChild(inner);
      div.appendChild(details);
    }

    chatBox.appendChild(div);
    renderWelcomeState();
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'msg assistant typing-indicator'; div.id = 'typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
  }
  function removeTyping() { document.getElementById('typing')?.remove(); }

  function startStageTicker() {
    const mode = modeSelect?.value || getMode();
    const customMode = getCustomModeById(mode);
    const customStages = customMode
      ? ((customMode.agents || []).map(a => `${a.name || 'Agent'} is working…`))
      : null;
    const stages = mode === 'direct'
      ? ['Direct mode…', 'Generating response…']
      : mode === 'reasoning_fast'
        ? ['Classifying intent…', 'Fast planning + critique…', 'Synthesizing response…', 'Quick bug check…']
      : mode === 'reasoning_loop'
        ? ['Designing checklist…', 'Waiting for your approvals…', 'Executing approved steps one-by-one…', 'Writing final wrap-up…']
      : mode === 'conversational'
        ? ['Muse is shaping the vibe…', 'Guide is writing your reply…']
        : customMode
          ? (customStages && customStages.length ? customStages : ['Custom agent chain…'])
        : [
            'Classifying intent…',
            'Introspecting (generating self-questions)…',
            'Planning (Architect)…',
            'Critiquing (Skeptic)…',
            'Synthesizing answer…',
            'Bug checking…',
            'Fixing issues…',
            'Checking history (Historian)…'
          ];
    if (!stages.length) {
      setThinking('🧠 Thinking…');
      stageTimer = null;
      return;
    }
    let idx = 0;
    const renderStage = () => {
      setThinking('🧠 Thinking… <span class="step">' + stages[idx] + '</span>');
    };
    renderStage();
    if (stages.length > 1) {
      stageTimer = setInterval(() => {
        if (idx < stages.length - 1) {
          idx += 1;
          renderStage();
          if (idx === stages.length - 1) {
            clearInterval(stageTimer);
            stageTimer = null;
          }
        }
      }, 2500);
    } else {
      stageTimer = null;
    }
  }

  function stopStageTicker() {
    if (stageTimer) clearInterval(stageTimer);
    stageTimer = null;
    clearThinking();
  }

  /* ── Memory viewer ───────────────────────────────────────────── */
  async function openMemory(tab = 'manifesto') {
    memoryModal.classList.add('open');
    if (!memoryData) {
      const res = await fetch('/api/memory');
      memoryData = await res.json();
    }
    setMemoryTab(tab);
  }

  function setMemoryTab(tab) {
    document.querySelectorAll('.memory-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    if (!memoryData) {
      memoryContent.textContent = 'Loading…';
      return;
    }
    if (tab === 'manifesto') {
      memoryContent.textContent = memoryData.manifesto || '(empty)';
    } else if (tab === 'heuristics') {
      memoryContent.textContent = JSON.stringify(memoryData.heuristics || {}, null, 2);
    } else if (tab === 'failures') {
      memoryContent.textContent = JSON.stringify(memoryData.failures || {}, null, 2);
    } else if (tab === 'typed_memory') {
      memoryContent.textContent = JSON.stringify(memoryData.typed_memory || {}, null, 2);
    } else if (tab === 'historian_notes') {
      memoryContent.textContent = JSON.stringify(memoryData.historian_notes || {}, null, 2);
    } else if (tab === 'thought_journal') {
      memoryContent.textContent = JSON.stringify(memoryData.thought_journal || {}, null, 2);
    }
  }

  function updateMissionStateFromResponse(data) {
    if (!data) return;
    if (data.run_state) {
      missionCurrentRun = data.run_state;
      missionCurrentRunId = data.run_state.run_id || data.run_id || missionCurrentRunId;
    } else if (data.run && data.run.run_id) {
      missionCurrentRun = data.run;
      missionCurrentRunId = data.run.run_id;
    } else if (data.run_id) {
      missionCurrentRunId = data.run_id;
    }
    renderMissionControl();
  }

  function renderMissionControl() {
    if (!mcRunId || !mcRunStatus || !mcRunGraph || !mcInspector) return;
    mcRunId.textContent = `Run: ${missionCurrentRunId || 'none'}`;
    const status = missionCurrentRun?.status || 'idle';
    const branch = missionCurrentRun?.branch_id || 'main';
    mcRunStatus.textContent = `Status: ${status} · Branch: ${branch}`;

    const traces = missionCurrentRun?.result?.traces || [];
    if (!traces.length) {
      mcRunGraph.innerHTML = '<div style="opacity:.8;">No traces yet.</div>';
      mcInspector.textContent = 'Select a node in the run graph.';
      return;
    }

    mcRunGraph.innerHTML = '';
    traces.forEach((t, idx) => {
      const row = document.createElement('button');
      row.className = 'hdr-btn';
      row.style.textAlign = 'left';
      row.style.justifyContent = 'space-between';
      row.style.display = 'flex';
      row.style.width = '100%';
      row.style.gap = '8px';
      row.innerHTML = `<span>${idx + 1}. ${esc(t.agent || 'Agent')}</span><span style="opacity:.8;">${Number(t.elapsed_ms || 0)}ms</span>`;
      row.addEventListener('click', () => {
        mcInspector.textContent = JSON.stringify(t, null, 2);
      });
      mcRunGraph.appendChild(row);
    });
  }

  async function missionAction(path, method = 'POST', payload = null) {
    const rid = missionCurrentRunId;
    if (!rid) {
      showToast('No run selected.', 'error');
      return null;
    }
    const res = await fetch(`/api/runs/${encodeURIComponent(rid)}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : null,
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data?.error || 'Mission action failed', 'error');
      return null;
    }
    updateMissionStateFromResponse(data);
    return data;
  }

  memoryBtn?.addEventListener('click', () => openMemory('manifesto'));
  memoryClose?.addEventListener('click', () => memoryModal?.classList.remove('open'));
  memoryModal?.addEventListener('click', (e) => {
    if (e.target === memoryModal) memoryModal.classList.remove('open');
  });
  document.querySelectorAll('.memory-tab').forEach(btn => {
    btn.addEventListener('click', () => setMemoryTab(btn.dataset.tab));
  });

  missionBtn?.addEventListener('click', openMissionPage);
  missionFab?.addEventListener('click', openMissionPage);
  missionPageClose?.addEventListener('click', () => {
    if (missionViewMode === 'project') {
      setMissionView('hub');
      renderMissionProjects();
      return;
    }
    closeMissionPage();
  });

  missionOpenProjectMemory?.addEventListener('click', () => {
    if (!missionSelectedProjectId) {
      showToast('Select a project first.', 'error');
      return;
    }
    renderProjectMemoryWindow(missionSelectedProjectId);
    projectMemoryModal?.classList.add('open');
  });
  projectMemoryClose?.addEventListener('click', () => projectMemoryModal?.classList.remove('open'));
  projectMemoryModal?.addEventListener('click', (e) => {
    if (e.target === projectMemoryModal) projectMemoryModal.classList.remove('open');
  });
  projectMemorySave?.addEventListener('click', () => saveProjectMemoryWindow(missionSelectedProjectId));
  const closeAgentChatModal = () => {
    agentChatModal?.classList.remove('open');
    missionOpenAgentId = '';
  };

  agentChatBack?.addEventListener('click', () => {
    const aid = missionOpenAgentId;
    const agent = missionAgents.find(a => a.id === aid);
    closeAgentChatModal();
    if (agentModalReturnTo === 'chat') {
      closeMissionPage();
      return;
    }
    if (agent?.project_id) missionSelectedProjectId = agent.project_id;
    openMissionPage();
    renderMissionProjects();
  });

  agentChatClose?.addEventListener('click', closeAgentChatModal);
  agentChatModal?.addEventListener('click', (e) => {
    if (e.target === agentChatModal) closeAgentChatModal();
  });
  agentChatSend?.addEventListener('click', async () => {
    const aid = missionOpenAgentId;
    const agent = missionAgents.find(a => a.id === aid);
    if (!agent) return;
    const text = (agentChatInput?.value || '').trim();
    if (!text) return;
    agentChatInput.value = '';
    await sendCommandToAgent(agent, text);
  });
  agentChatInput?.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    agentChatSend?.click();
  });
  agentChatContext?.addEventListener('click', (e) => {
    const aid = missionOpenAgentId;
    const agent = missionAgents.find(a => a.id === aid);
    if (!agent) return;

    if (e.target?.closest?.('[data-agent-save-context]')) {
      const ins = agentChatContext.querySelector('[data-agent-edit-instructions]');
      const src = agentChatContext.querySelector('[data-agent-edit-sources]');
      const mem = agentChatContext.querySelector('[data-agent-edit-memory]');
      agent.instructions = String(ins?.value || '').slice(0, 1200);
      agent.sources = String(src?.value || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 24);
      agent.memory_notes = String(mem?.value || '').slice(0, 12000);
      saveMissionAgents(missionAgents);
      renderAgentChatModal(agent.id);
      renderMissionProjects();
      showToast('Agent context saved.', 'success', 1600);
      return;
    }

    if (e.target?.closest?.('[data-agent-open-config]')) {
      openAgentConfigModal(agent.id, missionSelectedProjectId || '');
    }
  });

  agentConfigClose?.addEventListener('click', closeAgentConfigModal);
  agentConfigModal?.addEventListener('click', (e) => {
    if (e.target === agentConfigModal) closeAgentConfigModal();
  });
  agentConfigSave?.addEventListener('click', () => {
    const name = String(agentConfigName?.value || '').trim();
    if (!name) {
      showToast('Agent name is required.', 'error');
      return;
    }
    const payload = {
      name,
      project_id: String(agentConfigProject?.value || '').trim(),
      mode: String(agentConfigMode?.value || 'reasoning_fast'),
      instructions: String(agentConfigInstructions?.value || ''),
      sources: String(agentConfigSources?.value || '').split('\n').map(x => x.trim()).filter(Boolean),
      memory_notes: String(agentConfigMemory?.value || ''),
    };

    if (editingAgentId) {
      const agent = missionAgents.find(a => a.id === editingAgentId);
      if (!agent) return;
      agent.name = payload.name.slice(0, 60);
      agent.project_id = payload.project_id;
      agent.mode = payload.mode;
      agent.instructions = payload.instructions.slice(0, 1200);
      agent.sources = payload.sources.slice(0, 24);
      agent.memory_notes = payload.memory_notes.slice(0, 12000);
      saveMissionAgents(missionAgents);
      _syncAgentProjectLink(agent);
      if (agent.project_id) missionSelectedProjectId = agent.project_id;
      renderMissionProjects();
      if (missionOpenAgentId === agent.id) renderAgentChatModal(agent.id);
      closeAgentConfigModal();
      showToast('Agent updated.', 'success', 1600);
      return;
    }

    const created = createMissionAgent(payload);
    if (created) {
      closeAgentConfigModal();
      openAgentChat(created.id, 'mission');
    }
  });
  agentConfigDelete?.addEventListener('click', () => {
    if (!editingAgentId) return;
    const toDelete = editingAgentId;
    closeAgentConfigModal();
    deleteMissionAgent(toDelete);
  });
  missionClose?.addEventListener('click', () => missionModal?.classList.remove('open'));
  missionModal?.addEventListener('click', (e) => {
    if (e.target === missionModal) missionModal.classList.remove('open');
  });

  const closeMissionPlusMenu = () => missionPlusMenu?.classList.remove('open');
  const closeMissionGridContextMenu = () => {
    missionGridContextMenu?.classList.remove('open');
    missionPendingNewTileCell = null;
    missionPendingNewTileType = '';
  };

  missionWidgetGrid?.addEventListener('contextmenu', (e) => {
    if (!missionGridContextMenu || missionPage?.style.display === 'none') return;
    if (e.target?.closest?.('.mission-widget')) return;
    e.preventDefault();
    
    if (missionViewMode === 'project') {
      if (missionContextAddProject) missionContextAddProject.style.display = 'none';
      const pid = missionSelectedProjectId;
      const existingHead = missionAgents.find(a => a.project_id === pid && a.is_project_head);
      if (missionContextAddManager) {
        missionContextAddManager.style.display = existingHead ? 'none' : 'block';
      }
    } else {
      if (missionContextAddProject) missionContextAddProject.style.display = 'block';
      if (missionContextAddManager) missionContextAddManager.style.display = 'none';
    }

    const cell = _tileCellFromPoint(e.clientX, e.clientY);
    missionPendingNewTileCell = { col: cell.col, row: cell.row };
    missionPendingNewTileType = '';
    missionGridContextMenu.style.left = `${Math.max(8, e.clientX)}px`;
    missionGridContextMenu.style.top = `${Math.max(8, e.clientY)}px`;
    missionGridContextMenu.classList.add('open');
  });

  missionContextAddProject?.addEventListener('click', () => {
    missionPendingNewTileType = 'project';
    missionGridContextMenu?.classList.remove('open');
    createMissionProject();
  });

  missionContextAddAgent?.addEventListener('click', () => {
    missionPendingNewTileType = 'agent';
    missionGridContextMenu?.classList.remove('open');
    openAgentConfigModal('', missionViewMode === 'project' ? missionSelectedProjectId : '');
  });

  missionContextAddManager?.addEventListener('click', () => {
    missionGridContextMenu?.classList.remove('open');
    if (!missionSelectedProjectId && missionViewMode !== 'project') {
      showToast('You must be inside a project to add a Project Manager.', 'error');
      return;
    }
    const pid = missionSelectedProjectId;
    const existingHead = missionAgents.find(a => a.project_id === pid && a.is_project_head);
    if (existingHead) {
      showToast('This project already has a manager.', 'error');
      return;
    }
    
    missionPendingNewTileType = 'agent';
    
    // Quick agent creation via modal or direct?
    // Let's open config modal with some preset fields, or we can just instantly create it.
    // Making it instantly might be rough if they want custom name. I will open modal and flag it.
    // To do this simply, we will directly call createMissionAgent with manager credentials.
    const manager = createMissionAgent({
      name: 'Project Manager',
      project_id: pid,
      instructions: 'You are the Project Manager. Coordinate other agents, monitor progress, and break down tasks.',
      mode: 'project_manager',
      is_project_head: true
    });
    if (manager) {
      missionAgents.push(manager);
      saveMissionAgents(missionAgents);
      renderMissionAgentTiles(pid);
      if (missionPendingNewTileCell) {
        missionWidgetPositions[`agent-${manager.id}`] = missionPendingNewTileCell;
        saveMissionWidgetPositions(missionWidgetPositions);
      }
      applyMissionWidgetBoard();
      bindMissionWidgetDnD();
      missionPendingNewTileCell = null;
      missionPendingNewTileType = '';
    }
  });

  missionContextAddMiscNote?.addEventListener('click', () => {
    missionPendingNewTileType = 'misc';
    missionGridContextMenu?.classList.remove('open');
    createMissionMiscTile('note', 'Sticky Note', '');
  });

  missionContextAddMiscPackager?.addEventListener('click', () => {
    missionPendingNewTileType = 'misc';
    missionGridContextMenu?.classList.remove('open');
    createMissionMiscTile('packager', 'App Compiler', 'Select a project to bundle your files into a runnable format.');
  });

  missionPlusFab?.addEventListener('click', (e) => {
    e.stopPropagation();
    missionPlusMenu?.classList.toggle('open');
  });

  missionPlusOpenHub?.addEventListener('click', () => {
    closeMissionPlusMenu();
    openMissionPage();
  });

  missionPlusAddProject?.addEventListener('click', () => {
    missionPendingNewTileCell = null;
    missionPendingNewTileType = '';
    closeMissionPlusMenu();
    openMissionPage();
    createMissionProject();
  });

  missionPlusAddAgent?.addEventListener('click', () => {
    missionPendingNewTileCell = null;
    missionPendingNewTileType = '';
    closeMissionPlusMenu();
    openMissionPage();
    openAgentConfigModal('', missionViewMode === 'project' ? missionSelectedProjectId : '');
  });

  document.addEventListener('click', (e) => {
    if (!missionPlusMenu || !missionPlusFab) return;
    if (!(e.target?.closest?.('#mission-plus-fab') || e.target?.closest?.('#mission-plus-menu'))) {
      closeMissionPlusMenu();
    }
    if (!(e.target?.closest?.('#mission-grid-context-menu'))) {
      closeMissionGridContextMenu();
    }
  });

  missionAddProjectBtn?.addEventListener('click', () => {
    missionPendingNewTileCell = null;
    missionPendingNewTileType = '';
    createMissionProject();
  });

  missionAddAgentBtn?.addEventListener('click', () => {
    missionPendingNewTileCell = null;
    missionPendingNewTileType = '';
    openAgentConfigModal('', missionViewMode === 'project' ? missionSelectedProjectId : '');
  });

  missionTileAddProject?.addEventListener('click', () => {
    missionPendingNewTileCell = null;
    missionPendingNewTileType = '';
    openMissionPage();
    createMissionProject();
  });

  missionTileAddAgent?.addEventListener('click', () => {
    missionPendingNewTileCell = null;
    missionPendingNewTileType = '';
    openMissionPage();
    openAgentConfigModal('', missionViewMode === 'project' ? missionSelectedProjectId : '');
  });

  missionTilePlus?.addEventListener('click', () => {
    missionPendingNewTileCell = null;
    missionPendingNewTileType = '';
    openMissionPage();
    openAgentConfigModal('', missionViewMode === 'project' ? missionSelectedProjectId : '');
  });

  missionAddFileBtn?.addEventListener('click', () => {
    if (!missionSelectedProjectId) return;
    const name = prompt('File name:', 'NOTES.md');
    if (!name || !name.trim()) return;
    const files = _projectFiles(missionSelectedProjectId);
    const id = `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    files.push({ id, name: name.trim().slice(0, 80), content: '' });
    saveMissionFiles(missionFiles);
    missionSelectedFileId = id;
    renderMissionFiles(missionSelectedProjectId);
  });

  missionFileSaveBtn?.addEventListener('click', () => {
    if (!missionSelectedProjectId || !missionSelectedFileId) return;
    const files = _projectFiles(missionSelectedProjectId);
    const idx = files.findIndex(f => f.id === missionSelectedFileId);
    if (idx < 0) return;
    files[idx].name = (missionFileName?.value || files[idx].name || 'FILE.md').trim().slice(0, 80);
    files[idx].content = (missionFileEditor?.value || '').slice(0, 20000);
    saveMissionFiles(missionFiles);
    renderMissionFiles(missionSelectedProjectId);
    showToast('Project file saved.', 'success', 1800);
  });

  missionEventToggleBtn?.addEventListener('click', () => {
    if (!missionEventForm) return;
    const open = missionEventForm.style.display === 'flex';
    missionEventForm.style.display = open ? 'none' : 'flex';
  });

  missionCalendarPrev?.addEventListener('click', () => {
    missionCalendarCursor = new Date(missionCalendarCursor.getFullYear(), missionCalendarCursor.getMonth() - 1, 1);
    loadScheduledActions();
  });
  missionCalendarNext?.addEventListener('click', () => {
    missionCalendarCursor = new Date(missionCalendarCursor.getFullYear(), missionCalendarCursor.getMonth() + 1, 1);
    loadScheduledActions();
  });

  applyMissionWidgetBoard();
  bindMissionWidgetDnD();

  mcPauseBtn?.addEventListener('click', () => missionAction('/pause', 'POST', { paused: true }));
  mcResumeBtn?.addEventListener('click', () => missionAction('/pause', 'POST', { paused: false }));
  mcApproveBtn?.addEventListener('click', () => missionAction('/approve', 'POST', {
    note: (mcApproveNote?.value || '').trim() || 'approved',
    agent: 'operator',
  }));
  mcRerouteBtn?.addEventListener('click', () => missionAction('/reroute', 'POST', {
    target_agent: (mcRerouteAgent?.value || '').trim(),
    instruction: (mcRerouteNote?.value || '').trim(),
  }));
  mcRerunAgentBtn?.addEventListener('click', async () => {
    const data = await missionAction('/rerun-agent', 'POST', {
      target_agent: (mcRerouteAgent?.value || '').trim() || 'Synthesizer',
      note: (mcRerouteNote?.value || '').trim(),
      api_key: getApiKey(),
      hf_api_key: getHfApiKey(),
    });
    if (data?.reply) {
      addAssistantMsg(data.reply, data.classification, data.traces || []);
      showToast('Single-agent rerun completed.', 'success');
    }
  });
  mcCompareBtn?.addEventListener('click', async () => {
    const other = (mcCompareRunId?.value || '').trim();
    if (!other || !missionCurrentRunId) {
      showToast('Provide a comparison run id first.', 'error');
      return;
    }
    const res = await fetch(`/api/runs/${encodeURIComponent(missionCurrentRunId)}/compare?other_run_id=${encodeURIComponent(other)}`);
    const data = await res.json();
    if (!res.ok) {
      showToast(data?.error || 'Compare failed', 'error');
      return;
    }
    mcCompareOutput.textContent = JSON.stringify(data.comparison || {}, null, 2);
  });
  mcBranchBtn?.addEventListener('click', async () => {
    const data = await missionAction('/branch', 'POST', {
      resume_from_checkpoint: (mcBranchCheckpoint?.value || '').trim(),
    });
    if (data?.run?.run_id) {
      mcCompareOutput.textContent = `Branch created: ${data.run.run_id}\nBranch id: ${data.run.branch_id}`;
      showToast('Branch created. Use rerun-agent or send a new message to continue.', 'success');
    }
  });

  function _fmtWhen(iso) {
    try {
      const d = new Date(String(iso || ''));
      if (Number.isNaN(d.getTime())) return String(iso || '');
      return d.toLocaleString();
    } catch (_) {
      return String(iso || '');
    }
  }

  function _dayKeyFromDate(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function renderMissionDailyCalendarView(items = []) {
    if (!missionCalendarDayView) return;
    if (!missionCalendarSelectedDayKey) {
      missionCalendarDayView.style.display = 'none';
      missionCalendarDayView.innerHTML = '';
      return;
    }

    const selected = items.filter(a => {
      const d = new Date(a.run_at || '');
      if (Number.isNaN(d.getTime())) return false;
      return _dayKeyFromDate(d) === missionCalendarSelectedDayKey;
    });

    const dateLabel = new Date(`${missionCalendarSelectedDayKey}T12:00:00`).toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    missionCalendarDayView.style.display = 'flex';
    missionCalendarDayView.innerHTML =
      `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;">` +
        `<div style="font-size:.72rem;font-weight:700;">Daily View · ${esc(dateLabel)}</div>` +
        `<button class="hdr-btn" data-dayview-close="1">Close</button>` +
      `</div>` +
      `<div style="font-size:.68rem;opacity:.85;">${selected.length ? `${selected.length} scheduled event${selected.length === 1 ? '' : 's'}` : 'No events yet for this day.'}</div>` +
      `<div id="mission-calendar-day-list" style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow:auto;"></div>`;

    missionCalendarDayView.querySelector('[data-dayview-close]')?.addEventListener('click', () => {
      missionCalendarSelectedDayKey = '';
      renderMissionDailyCalendarView(items);
      renderMonthlyCalendar(items);
    });

    const list = missionCalendarDayView.querySelector('#mission-calendar-day-list');
    if (!list) return;
    if (!selected.length) {
      list.innerHTML = '<div style="font-size:.68rem;opacity:.78;">Use Add Event to schedule for this date.</div>';
      return;
    }

    selected
      .sort((a, b) => new Date(a.run_at || 0).getTime() - new Date(b.run_at || 0).getTime())
      .forEach(ev => {
        const row = document.createElement('div');
        row.style.border = '1px solid var(--border)';
        row.style.borderRadius = '8px';
        row.style.padding = '6px';
        row.style.background = 'var(--panel-bg)';
        row.innerHTML =
          `<div style="font-size:.69rem;font-weight:600;">${esc(ev.event_title || 'Scheduled Event')}</div>` +
          `<div style="font-size:.66rem;opacity:.85;">${esc(_fmtWhen(ev.run_at))}</div>` +
          `<div style="font-size:.64rem;opacity:.8;">Agent: ${esc(ev.agent_name || ev.target_agent || 'unassigned')}</div>`;
        list.appendChild(row);
      });
  }

  function renderMonthlyCalendar(items = []) {
    if (!missionCalendarGrid || !missionCalendarMonthLabel) return;
    const base = new Date(missionCalendarCursor.getFullYear(), missionCalendarCursor.getMonth(), 1);
    const y = base.getFullYear();
    const m = base.getMonth();
    missionCalendarMonthLabel.textContent = base.toLocaleDateString([], { month: 'long', year: 'numeric' });

    const firstWeekday = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const byDay = new Map();
    items.forEach(a => {
      const d = new Date(a.run_at || '');
      if (Number.isNaN(d.getTime())) return;
      if (d.getFullYear() !== y || d.getMonth() !== m) return;
      const day = d.getDate();
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(a);
    });

    missionCalendarGrid.innerHTML = '';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(w => {
      const h = document.createElement('div');
      h.textContent = w;
      h.style.fontSize = '.62rem';
      h.style.opacity = '.75';
      h.style.textAlign = 'center';
      missionCalendarGrid.appendChild(h);
    });

    for (let i = 0; i < firstWeekday; i++) {
      const e = document.createElement('div');
      missionCalendarGrid.appendChild(e);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement('button');
      cell.className = 'hdr-btn';
      cell.style.minHeight = '52px';
      cell.style.padding = '4px';
      cell.style.display = 'flex';
      cell.style.flexDirection = 'column';
      cell.style.alignItems = 'flex-start';
      cell.style.justifyContent = 'space-between';
      cell.style.background = 'var(--bg)';
      const count = (byDay.get(day) || []).length;
      const dayKey = _dayKeyFromDate(new Date(y, m, day));
      if (missionCalendarSelectedDayKey === dayKey) {
        cell.style.borderColor = 'var(--primary)';
        cell.style.background = 'var(--primary-glow)';
      }
      cell.innerHTML = `<span style="font-size:.68rem;">${day}</span><span style="font-size:.6rem;opacity:.8;">${count ? `${count} events` : ''}</span>`;
      cell.addEventListener('click', () => {
        const picked = new Date(y, m, day);
        missionCalendarSelectedDayKey = _dayKeyFromDate(picked);
        if (missionEventForm) missionEventForm.style.display = 'flex';
        if (missionSchedRunAt) {
          const now = new Date();
          const defaultHour = (picked.toDateString() === now.toDateString()) ? now.getHours() : 9;
          const at = new Date(y, m, day, defaultHour, 0, 0, 0);
          missionSchedRunAt.value = at.toISOString().slice(0, 16);
        }
        renderMonthlyCalendar(items);
        renderMissionDailyCalendarView(items);
      });
      missionCalendarGrid.appendChild(cell);
    }
  }

  function renderScheduledList(container, items) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = '<div style="opacity:.8;font-size:.75rem;">No scheduled actions yet.</div>';
      return;
    }
    container.innerHTML = '';
    items.forEach((a) => {
      const card = document.createElement('div');
      card.style.border = '1px solid var(--border)';
      card.style.borderRadius = '8px';
      card.style.padding = '8px';
      card.style.background = 'var(--bg)';
      const srcCount = Array.isArray(a.sources) ? a.sources.length : 0;
      card.innerHTML =
        `<div style="font-size:.76rem;font-weight:600;">${esc(a.event_title || 'Scheduled Event')} · ${esc(a.status || 'scheduled')}</div>` +
        `<div style="font-size:.72rem;opacity:.85;margin-top:4px;">${esc(_fmtWhen(a.run_at))} ${a.repeat && a.repeat !== 'none' ? `· repeats ${esc(a.repeat)}` : ''}</div>` +
        `<div style="font-size:.7rem;opacity:.85;margin-top:4px;">Agent: ${esc(a.agent_name || a.target_agent || 'unassigned')} · Mode: ${esc(a.mode || 'reasoning')} · Sources: ${srcCount}</div>` +
        `<div style="font-size:.74rem;margin-top:6px;white-space:pre-wrap;">${esc(String(a.message || a.instructions || '').slice(0, 220))}</div>` +
        `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">` +
          `<button class="hdr-btn" data-sched-run="${esc(a.id)}">Run now</button>` +
          `<button class="hdr-btn" data-sched-toggle="${esc(a.id)}" data-enabled="${a.enabled ? '1' : '0'}">${a.enabled ? 'Disable' : 'Enable'}</button>` +
          `<button class="hdr-btn" data-sched-del="${esc(a.id)}">Delete</button>` +
        `</div>` +
        `${a.last_error ? `<div style="font-size:.7rem;color:#fca5a5;margin-top:6px;">Last error: ${esc(a.last_error)}</div>` : ''}` +
        `${a.last_run_id ? `<div style="font-size:.7rem;opacity:.8;margin-top:2px;">Last run: ${esc(a.last_run_id)}</div>` : ''}`;
      container.appendChild(card);
    });

    container.querySelectorAll('[data-sched-run]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-sched-run');
        const res = await fetch(`/api/scheduled-actions/${encodeURIComponent(id)}/run-now`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          showToast(data?.error || 'Run now failed', 'error');
          return;
        }
        showToast('Scheduled action started.', 'success');
        setTimeout(loadScheduledActions, 500);
      });
    });

    container.querySelectorAll('[data-sched-toggle]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-sched-toggle');
        const enabled = btn.getAttribute('data-enabled') !== '1';
        const res = await fetch(`/api/scheduled-actions/${encodeURIComponent(id)}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data?.error || 'Toggle failed', 'error');
          return;
        }
        loadScheduledActions();
      });
    });

    container.querySelectorAll('[data-sched-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-sched-del');
        const res = await fetch(`/api/scheduled-actions/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) {
          showToast(data?.error || 'Delete failed', 'error');
          return;
        }
        loadScheduledActions();
      });
    });
  }

  async function loadScheduledActions() {
    const res = await fetch('/api/scheduled-actions');
    const data = await res.json();
    if (!res.ok) {
      showToast(data?.error || 'Failed to load schedules', 'error');
      return;
    }
    const items = Array.isArray(data.actions) ? data.actions : [];
    renderScheduledList(schedList, items);
    renderScheduledList(missionSchedList, items);
    renderMonthlyCalendar(items);
    renderMissionDailyCalendarView(items);
  }

  async function createScheduledActionFrom(opts) {
    const whenLocal = (opts?.runAt?.value || '').trim();
    const message = (opts?.message?.value || '').trim();
    if (!whenLocal || !message) {
      showToast('Pick date/time and message first.', 'error');
      return;
    }
    const runAtIso = new Date(whenLocal).toISOString();
    const payload = {
      run_at: runAtIso,
      message,
      instructions: message,
      event_title: (opts?.title?.value || '').trim() || 'Scheduled Event',
      agent_name: (opts?.targetAgent?.value || '').trim() || 'Agent',
      mode: opts?.mode?.value || 'reasoning',
      model: modelSelect?.value,
      target_agent: (opts?.targetAgent?.value || '').trim(),
      note: (opts?.note?.value || '').trim(),
      sources: String(opts?.sources?.value || '')
        .split(/\n|,/)
        .map(x => x.trim())
        .filter(Boolean)
        .slice(0, 12),
      repeat: opts?.repeat?.value || 'none',
      enabled: true,
    };
    const res = await fetch('/api/scheduled-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data?.error || 'Create failed', 'error');
      return;
    }
    showToast('Scheduled action created.', 'success');
    if (opts?.message) opts.message.value = '';
    if (opts?.targetAgent) opts.targetAgent.value = '';
    if (opts?.note) opts.note.value = '';
    if (opts?.sources) opts.sources.value = '';
    if (opts?.title) opts.title.value = '';
    loadScheduledActions();
  }

  async function createScheduledAction() {
    return createScheduledActionFrom({
      runAt: schedRunAt,
      message: schedMessage,
      title: { value: 'Scheduled Event' },
      mode: schedMode,
      targetAgent: schedTargetAgent,
      note: schedNote,
      sources: { value: '' },
      repeat: schedRepeat,
    });
  }

  calendarBtn?.addEventListener('click', async () => {
    calendarModal?.classList.add('open');
    if (schedRunAt && !schedRunAt.value) {
      const d = new Date(Date.now() + 5 * 60 * 1000);
      schedRunAt.value = d.toISOString().slice(0, 16);
    }
    await loadScheduledActions();
  });
  calendarClose?.addEventListener('click', () => calendarModal?.classList.remove('open'));
  calendarModal?.addEventListener('click', (e) => {
    if (e.target === calendarModal) calendarModal.classList.remove('open');
  });
  schedCreateBtn?.addEventListener('click', createScheduledAction);
  missionSchedCreateBtn?.addEventListener('click', () => createScheduledActionFrom({
    runAt: missionSchedRunAt,
    message: missionSchedMessage,
    title: missionEventTitle,
    mode: missionSchedMode,
    targetAgent: missionSchedTargetAgent,
    note: { value: '' },
    sources: missionEventSources,
    repeat: missionSchedRepeat,
  }));

  let isKillSwitchEngaged = false;

  async function callChatApi({ message, mode, history, customMode, sharedUrl }) {
    if (isKillSwitchEngaged) {
      showToast('API Blocked: Kill Switch Engaged', 'error');
      return { res: { ok: false }, data: { error: 'Kill switch active.' } };
    }
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history,
        model: modelSelect?.value,
        mode: customMode ? 'custom' : mode,
        mode_config: customMode || null,
        include_trace_prompts: getIncludeTracePrompts(),
        api_key: getApiKey(),
        hf_api_key: getHfApiKey(),
        web_urls: sharedUrl ? [sharedUrl] : [],
        web_auto_search: getWebAutoSearch(),
      }),
    });
    const data = await res.json();
    return { res, data };
  }

  function parseLoopPlan(rawText) {
    const text = String(rawText || '').trim();
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    try {
      const j = JSON.parse(cleaned);
      const overview = String(j.overview || j.description || '').trim() || 'Execution plan generated.';
      const checklist = Array.isArray(j.checklist)
        ? j.checklist.map(x => String(x).trim()).filter(Boolean).slice(0, 8)
        : [];
      if (checklist.length) return { overview, checklist };
    } catch (_) {}

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const checklist = lines
      .map(l => l.replace(/^\d+\s*[\).:-]\s*/, '').replace(/^[-*•]\s*/, '').trim())
      .filter(l => l && l.length > 4)
      .slice(0, 6);
    return {
      overview: 'Loop plan generated from strategy output.',
      checklist: checklist.length ? checklist : ['Analyze requirements', 'Implement core solution', 'Validate output'],
    };
  }

  function addLoopChecklistCard(plan) {
    const div = document.createElement('div');
    div.className = 'msg assistant';
    div.innerHTML = `<div class="role">AI</div>` +
      `<div class="loop-card">` +
        `<div class="loop-title">Looping Agent Plan</div>` +
        `<div class="loop-overview">${esc(plan.overview || '')}</div>` +
        `<div class="loop-items"></div>` +
        `<div class="loop-actions">` +
          `<button class="hdr-btn" data-loop-start>Start Approved Steps</button>` +
          `<span class="kbd" data-loop-countdown>Auto-start in 8s</span>` +
        `</div>` +
      `</div>`;

    const itemsWrap = div.querySelector('.loop-items');
    const itemRefs = [];
    plan.checklist.forEach((item, idx) => {
      const row = document.createElement('label');
      row.className = 'loop-item';
      row.innerHTML =
        `<span class="li-text">${esc(item)}</span>` +
        `<input type="checkbox" checked data-loop-approve="${idx}" />` +
        `<span class="li-status">pending</span>`;
      itemsWrap.appendChild(row);
      itemRefs.push({
        row,
        checkbox: row.querySelector('input'),
        statusEl: row.querySelector('.li-status'),
      });
    });

    chatBox.appendChild(div);
    renderWelcomeState();
    chatBox.scrollTop = chatBox.scrollHeight;

    let started = false;
    let resolveStart;
    const startedPromise = new Promise(r => { resolveStart = r; });

    const startBtn = div.querySelector('[data-loop-start]');
    const countdownEl = div.querySelector('[data-loop-countdown]');
    startBtn.addEventListener('click', () => {
      if (started) return;
      started = true;
      countdownEl.textContent = 'Starting…';
      resolveStart();
    });

    let sec = 8;
    const timer = setInterval(() => {
      if (started) { clearInterval(timer); return; }
      sec -= 1;
      if (sec <= 0) {
        clearInterval(timer);
        started = true;
        countdownEl.textContent = 'Auto-starting…';
        resolveStart();
      } else {
        countdownEl.textContent = `Auto-start in ${sec}s`;
      }
    }, 1000);

    return {
      waitForStart: () => startedPromise,
      getApprovedItems: () => plan.checklist
        .map((text, i) => ({ text, approved: !!itemRefs[i]?.checkbox?.checked, idx: i }))
        .filter(x => x.approved),
      markDenied: () => {
        plan.checklist.forEach((_, i) => {
          const ref = itemRefs[i];
          if (!ref?.checkbox?.checked) {
            ref.row.classList.add('denied');
            ref.statusEl.textContent = 'denied';
          }
        });
      },
      markRunning: (i) => {
        const ref = itemRefs[i];
        if (!ref) return;
        ref.row.classList.add('running');
        ref.statusEl.textContent = 'running';
      },
      markDone: (i) => {
        const ref = itemRefs[i];
        if (!ref) return;
        ref.row.classList.remove('running');
        ref.row.classList.add('done');
        ref.statusEl.textContent = 'done';
      },
      markFailed: (i) => {
        const ref = itemRefs[i];
        if (!ref) return;
        ref.row.classList.remove('running');
        ref.statusEl.textContent = 'failed';
      },
    };
  }

  async function runLoopingAgentMode(goalMsg, sharedUrl = '') {
    const baseHistory = (sessionMessages || []).map(m => ({ role: m.role, content: m.content }));

    const planningPrompt =
      `You are LoopPlanner. Build an execution checklist for this goal:\n${goalMsg}\n\n` +
      `Return strict JSON with shape: {"overview":"...","checklist":["step 1", "step 2", ...]}. ` +
      `Checklist must have 3-7 concrete implementation steps.`;

    const planResp = await callChatApi({
      message: planningPrompt,
      mode: 'reasoning_fast',
      history: baseHistory,
      customMode: null,
      sharedUrl,
    });
    if (planResp.res.status === 401) {
      openSettings();
      addAssistantMsg(`⚠️ **Auth Error:** ${planResp.data.error}`, null, []);
      return;
    }
    updateMissionStateFromResponse(planResp.data);

    const plan = parseLoopPlan(planResp.data.reply || planResp.data.error || '');
    const loopUi = addLoopChecklistCard(plan);
    await loopUi.waitForStart();
    loopUi.markDenied();

    const approved = loopUi.getApprovedItems();
    const completed = [];
    for (const item of approved) {
      loopUi.markRunning(item.idx);
      const stepPrompt =
        `Goal:\n${goalMsg}\n\n` +
        `Checklist Step (${item.idx + 1}/${plan.checklist.length}): ${item.text}\n\n` +
        `Execute ONLY this step now. Provide concrete output/code needed for this step.`;

      const stepHistory = (sessionMessages || []).map(m => ({ role: m.role, content: m.content }));
      const stepResp = await callChatApi({
        message: stepPrompt,
        mode: 'reasoning_fast',
        history: stepHistory,
        customMode: null,
        sharedUrl,
      });

      if (stepResp.data?.reply) {
        updateMissionStateFromResponse(stepResp.data);
        addAssistantMsg(stepResp.data.reply, stepResp.data.classification, stepResp.data.traces);
        loopUi.markDone(item.idx);
        completed.push(item.text);
      } else {
        updateMissionStateFromResponse(stepResp.data);
        addAssistantMsg(`⚠️ Step failed: ${stepResp.data?.error || 'Unknown error'}`, null, stepResp.data?.traces || []);
        loopUi.markFailed(item.idx);
      }
    }

    const wrapPrompt =
      `Goal:\n${goalMsg}\n\n` +
      `Completed checklist items:\n- ${completed.join('\n- ') || '(none)'}\n\n` +
      `Write a final wrap-up with:\n1) concise summary\n2) what was completed\n3) memory catalog notes (lessons + reusable heuristics).`;

    const wrapHistory = (sessionMessages || []).map(m => ({ role: m.role, content: m.content }));
    const wrapResp = await callChatApi({
      message: wrapPrompt,
      mode: 'reasoning_fast',
      history: wrapHistory,
      customMode: null,
      sharedUrl,
    });
    if (wrapResp.data?.reply) {
      updateMissionStateFromResponse(wrapResp.data);
      addAssistantMsg(wrapResp.data.reply, wrapResp.data.classification, wrapResp.data.traces);
      try {
        const notes = JSON.parse(localStorage.getItem(KEY_LOOP_MEMORY) || '[]');
        notes.unshift({
          ts: Date.now(),
          goal: goalMsg.slice(0, 240),
          completed,
          summary: String(wrapResp.data.reply || '').slice(0, 2000),
        });
        localStorage.setItem(KEY_LOOP_MEMORY, JSON.stringify(notes.slice(0, 40)));
      } catch (_) {}
    } else {
      updateMissionStateFromResponse(wrapResp.data);
      addAssistantMsg(`⚠️ Wrap-up failed: ${wrapResp.data?.error || 'Unknown error'}`, null, wrapResp.data?.traces || []);
    }
  }

  /* ── Send ──────────────────────────────────────────────────────── */
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = input.value.trim();
    if (!msg) return;
    const outboundMsg = pendingPromptContext ? `${msg}\n\n${pendingPromptContext}` : msg;
    pendingPromptContext = '';

    const sharedUrl = (webUrlInput?.value || '').trim();
    if (sharedUrl) {
      try {
        const u = new URL(sharedUrl);
        if (!/^https?:$/.test(u.protocol)) {
          showToast('Please use an http(s) webpage URL.', 'error');
          return;
        }
      } catch (_) {
        showToast('That webpage URL looks invalid.', 'error');
        return;
      }
    }

    addUserMsg(msg);
    input.value = '';
    setDisabled(true);
    showTyping();
    startStageTicker();

    try {
      const activeMode = modeSelect?.value || getMode();
      setMode(activeMode);

      if (activeMode === 'reasoning_loop') {
        removeTyping();
        await runLoopingAgentMode(outboundMsg, sharedUrl);
        stopStageTicker();
      } else {
      const customMode = getCustomModeById(activeMode);
      const history = (sessionMessages || []).map(m => ({
        role: m.role,
        content: m.content,
      }));
      const { res, data } = await callChatApi({
        message: outboundMsg,
        mode: activeMode,
        history,
        customMode,
        sharedUrl,
      });
      removeTyping();
      updateMissionStateFromResponse(data);

      if (res.status === 401) {
        // API Key missing or invalid
        openSettings();
        addAssistantMsg(`⚠️ **Auth Error:** ${data.error}`, null, []);
      } else if (data.error && !data.reply) {
        addAssistantMsg(`⚠️ Error: ${data.error}`, null, data.traces);
      } else {
        addAssistantMsg(data.reply, data.classification, data.traces);
      }
      stopStageTicker();
      }
    } catch (err) {
      removeTyping();
      addAssistantMsg(`⚠️ Network error: ${err.message}`, null, []);
      stopStageTicker();
    }
    if (webUrlInput) webUrlInput.value = '';
    webUrlWrap?.classList.remove('open');
    setDisabled(false);
    renderWelcomeState();
    input.focus();
  });

  killSwitchBtn?.addEventListener('click', (e) => {
    isKillSwitchEngaged = !isKillSwitchEngaged;
    if (isKillSwitchEngaged) {
      e.target.style.background = 'var(--danger)';
      e.target.style.color = '#fff';
      e.target.textContent = 'API STOPPED';
      showToast('Global kill switch engaged. All API calls halted.', 'error', 3000);
    } else {
      e.target.style.background = 'transparent';
      e.target.style.color = 'var(--msg-user)';
      e.target.textContent = 'Kill Switch';
      showToast('Kill switch disengaged. API restored.', 'success');
    }
  });

  /* ── Reset ─────────────────────────────────────────────────────── */
  resetBtn?.addEventListener('click', async () => {
    // Start a fresh chat instead of just clearing
    startNewChat();
    
    await fetch('/api/reset', { method: 'POST' });
    chatBox.innerHTML = '';
    renderWelcomeState();
    stopStageTicker();
    closeSandbox();
    lastHtmlCode = '';
    input.focus();
  });

  renderWelcomeState();
