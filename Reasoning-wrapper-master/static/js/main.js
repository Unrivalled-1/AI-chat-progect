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
const KEY_OPENAI_API = 'vibe_openai_api_key';
const KEY_ANTHROPIC_API = 'vibe_anthropic_api_key';
const KEY_STORE = 'vibe_chat_store_v1';
const KEY_MODE = 'vibe_chat_mode';

const globalThinkingAgents = new Set();
const activeFetchControllers = new Set();

function setAgentThinkingState(agentId, isThinking) {
  if (!agentId) return;
  if (isThinking) {
    globalThinkingAgents.add(agentId);
  } else {
    globalThinkingAgents.delete(agentId);
  }
  
  const activeCountEl = document.getElementById('active-agents-count');
  if (activeCountEl) {
    activeCountEl.textContent = globalThinkingAgents.size;
  }

  const tile = document.querySelector(`[data-widget-id="agent-${agentId}"]`);
  if (tile) {
    const sendBtn = tile.querySelector('[data-agent-send]');
    const sendingEl = tile.querySelector(`[data-agent-sending="${agentId}"]`);
    if (sendBtn) {
      sendBtn.disabled = isThinking;
      sendBtn.textContent = isThinking ? 'Sending...' : 'Send';
      sendBtn.style.display = isThinking ? 'none' : '';
    }
    if (sendingEl) {
      sendingEl.style.display = isThinking ? 'flex' : 'none';
    }
  }
}

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
const KEY_VIEWPORT_MODE = 'vibe_viewport_mode';

const APP_BUILD_CONTEXT =
  'APP DEV CONTEXT: Build production-like apps with clear file structure, an index entry file, reusable modules/components, state handling, API layer, validation, error handling, and a run/test checklist. Prefer multi-file output with explicit file paths and complete code per file.';

// ── Custom Prompt ───────────────────────────────────────────
function showCustomPrompt(title, defaultVal = '') {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-prompt-modal');
    const titleEl = document.getElementById('custom-prompt-title');
    const inputEl = document.getElementById('custom-prompt-input');
    const cancelBtn = document.getElementById('custom-prompt-cancel');
    const okBtn = document.getElementById('custom-prompt-ok');

    titleEl.textContent = title;
    inputEl.value = defaultVal;
    modal.classList.add('open');
    setTimeout(() => inputEl.focus(), 50);

    function close(val) {
      modal.classList.remove('open');
      cancelBtn.onclick = null;
      okBtn.onclick = null;
      inputEl.onkeydown = null;
      resolve(val);
    }

    cancelBtn.onclick = () => close(null);
    okBtn.onclick = () => close(inputEl.value);
    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter') close(inputEl.value);
      if (e.key === 'Escape') close(null);
    };
  });
}

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
  { id: 'conversational', name: '⭐ Conversational (Default)', agents: 2, builtin: true },
  { id: 'direct', name: '⚡ Direct', agents: 1, builtin: true },
  { id: 'reasoning_fast', name: '⚡ Fast Reasoning', agents: 4, builtin: true },
  { id: 'reasoning', name: '🧠 Reasoning', agents: 7, builtin: true },
  { id: 'reasoning_loop', name: '🔁 Looping Agent', agents: 2, builtin: true },
  { id: 'reasoning_historian', name: '📖 Historian Reasoning', agents: 1, builtin: true },
];

function loadCustomModes() {
  try {
    const items = JSON.parse(localStorage.getItem(KEY_CUSTOM_MODES) || '[]');
    let arr = Array.isArray(items) ? items : [];

    if (!arr.some(m => m.id === 'reasoning_fast')) {
      arr.unshift({
        id: 'reasoning_fast',
        name: '⚡ Fast Reasoning (Editable)',
        agents: [
          { name: "Classifier", persona: "You are the Classifier. Analyze the user's request and determine the domain, intent, and necessary steps.", inputs: [], search: false },
          { name: "Classifier (Search)", persona: "You are the Search Classifier. If the request requires factual knowledge, search the web. Include your reasoning in your output.", inputs: [0], search: true },
          { name: "Introspector", persona: "You are the Introspector. Review the classification and search results. Ask critical questions and plan the final synthesis.", inputs: [1], search: false },
          { name: "Synthesizer", persona: "You are the Synthesizer. Combine all previous insights into a cohesive, high-quality answer for the user.", inputs: [2], search: false },
          { name: "Historian", persona: "You are the Historian. Record the final answer and provide any relevant closing remarks or context.", inputs: [3], search: false }
        ]
      });
      saveCustomModes(arr);
    }

    return arr;
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

function _createAgentChatSession(agent, reason = 'repair') {
  const agentName = String(agent?.name || 'Agent').trim() || 'Agent';
  const sid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  store.sessions[sid] = {
    timestamp: Date.now(),
    title: `Agent · ${agentName.slice(0, 32)}`,
    messages: [
      {
        role: 'assistant',
        content: `Agent context ${reason}.\n\nInstructions:\n${String(agent?.instructions || 'You are a helpful specialist agent.')}`,
        classification: 'AGENT_BOOT',
        traces: [],
      },
    ],
  };
  return sid;
}

function _ensureAgentChatSession(agent, opts = {}) {
  if (!agent || !agent.id) return '';
  const silent = !!opts.silent;
  const reason = String(opts.reason || 'repaired').trim();
  const currentSid = String(agent.chat_id || '').trim();
  if (currentSid && store.sessions[currentSid]) return currentSid;

  const sid = _createAgentChatSession(agent, reason);
  agent.chat_id = sid;
  saveStore(store);
  saveMissionAgents(missionAgents);
  if (!silent) {
    showToast(`Re-linked chat context for ${agent.name || 'agent'}.`, 'info', 1600);
  }
  return sid;
}

function _healAllAgentChatLinks(opts = {}) {
  let repaired = 0;
  for (const agent of (missionAgents || [])) {
    const sid = String(agent?.chat_id || '').trim();
    if (!sid || !store.sessions[sid]) {
      _ensureAgentChatSession(agent, { silent: true, reason: 'recovered' });
      repaired += 1;
    }
  }
  if (repaired > 0 && !opts.silent) {
    showToast(`Recovered ${repaired} broken agent chat link(s).`, 'info', 1800);
  }
  return repaired;
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

function getViewportModeSetting() {
  const raw = String(localStorage.getItem(KEY_VIEWPORT_MODE) || 'auto').toLowerCase();
  return ['auto', 'mobile', 'desktop'].includes(raw) ? raw : 'auto';
}

function setViewportModeSetting(mode) {
  const safe = ['auto', 'mobile', 'desktop'].includes(mode) ? mode : 'auto';
  localStorage.setItem(KEY_VIEWPORT_MODE, safe);
}

function applyViewportModeSetting() {
  const mode = getViewportModeSetting();
  const autoMobile = window.matchMedia ? window.matchMedia('(max-width: 720px)').matches : (window.innerWidth <= 720);
  const isMobile = mode === 'mobile' || (mode === 'auto' && autoMobile);
  document.body.classList.toggle('mobile-ui', isMobile);
  document.body.classList.toggle('desktop-ui', !isMobile);
  document.body.dataset.viewportMode = mode;
  if (missionWidgetGrid) {
    syncMissionGridSquares();
    applyMissionWidgetBoard();
  }
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
  const current = localStorage.getItem(KEY_MODE) || 'conversational';
  const modes = getAllModes();
  modeSelect.innerHTML = '';
  modes.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.name} (${m.agents})`;
    modeSelect.appendChild(opt);
  });
  const exists = modes.some(m => m.id === current);
  modeSelect.value = exists ? current : 'conversational';
  setMode(modeSelect.value);
}

// API Key Manager
const apiKeyInput = document.getElementById('api-key-input');
const hfApiKeyInput = document.getElementById('hf-api-key-input');
const hfRouterInput = document.getElementById('hf-router-input');
const openaiApiKeyInput = document.getElementById('openai-api-key-input');
const anthropicApiKeyInput = document.getElementById('anthropic-api-key-input');
const tracePromptsToggle = document.getElementById('trace-prompts-toggle');
const missionControlToggle = document.getElementById('mission-control-toggle');

function getApiKey() { return localStorage.getItem(KEY_API) || ''; }
function setApiKey(k) { localStorage.setItem(KEY_API, k.trim()); }
function getHfApiKey() { return localStorage.getItem(KEY_HF_API) || ''; }
function setHfApiKey(k) { localStorage.setItem(KEY_HF_API, k.trim()); }
function getHfRouter() { return localStorage.getItem('vibe_hf_router') || ''; }
function setHfRouter(k) { localStorage.setItem('vibe_hf_router', k); }
function getOpenAIApiKey() { return localStorage.getItem(KEY_OPENAI_API) || ''; }
function setOpenAIApiKey(k) { localStorage.setItem(KEY_OPENAI_API, k.trim()); }
function getAnthropicApiKey() { return localStorage.getItem(KEY_ANTHROPIC_API) || ''; }
function setAnthropicApiKey(k) { localStorage.setItem(KEY_ANTHROPIC_API, k.trim()); }
function getMode() {
  const mode = localStorage.getItem(KEY_MODE) || 'conversational';
  const valid = getAllModes().map(m => m.id);
  return valid.includes(mode) ? mode : 'conversational';
}
function setMode(m) {
  const valid = getAllModes().map(x => x.id);
  const safe = valid.includes(m) ? m : 'conversational';
  localStorage.setItem(KEY_MODE, safe);
}
function getSelectedModel() { return localStorage.getItem(KEY_MODEL) || 'deepseek-ai/DeepSeek-V4-Pro:cheapest'; }
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
const KEY_AUTO_SKIP = 'vibe_auto_skip';
function getAutoSkip() { return localStorage.getItem(KEY_AUTO_SKIP) === '1'; }
function setAutoSkip(v) { localStorage.setItem(KEY_AUTO_SKIP, v ? '1' : '0'); }

// ── Agent Extreme Mode ───────────────────────────────────────────────────────
const KEY_AGENT_EXTREME = 'vibe_agent_extreme';

function isAgentExtremeMode() {
  return localStorage.getItem(KEY_AGENT_EXTREME) === '1';
}

const KEY_PULSE_LOOP = 'vibe_pulse_loop';
function isPulseLoopMode() {
  return localStorage.getItem(KEY_PULSE_LOOP) === '1';
}

function setPulseLoopMode(val) {
  localStorage.setItem(KEY_PULSE_LOOP, val ? '1' : '0');
  
  if (val) {
    syncPulseLoopConfigFromMode();
  }
  
  if (typeof renderHistory === 'function') {
    renderHistory();
  }
}

function syncPulseLoopConfigFromMode() {
  const activeModeId = localStorage.getItem('vibe_extreme_last_mode') || 'conversational';
  const modes = typeof loadCustomModes === 'function' ? loadCustomModes() : [];
  const customMode = modes.find(m => m.id === activeModeId);
  
  if (customMode) {
    window.__pulseInterval = customMode.pulseInterval || 30;
    window.__pulseUnit = customMode.pulseUnit || 'seconds';
    window.__pulsePrompt = customMode.pulsePrompt || 'Continue iteration based on the synthesis.';
  }
}

function setAgentExtremeMode(val) {
  localStorage.setItem(KEY_AGENT_EXTREME, val ? '1' : '0');
  document.body.classList.toggle('agent-extreme', !!val);
  const bar = document.getElementById('extreme-mode-bar');
  if (bar) bar.classList.toggle('visible', !!val);
  const toggle = document.getElementById('agent-extreme-toggle');
  if (toggle) toggle.checked = !!val;
  
  // Disable pulse loop if extreme mode is disabled
  if (!val && isPulseLoopMode()) {
    setPulseLoopMode(false);
  }

  const legacySelect = document.getElementById('chat-mode');
  if (val) {
    populateExtremeModeSelect();
    const extSel = document.getElementById('extreme-mode-select');
    if (extSel && legacySelect) {
      legacySelect.value = extSel.value;
      legacySelect.dispatchEvent(new Event('change'));
    }
  } else {
    if (legacySelect) {
      legacySelect.value = 'conversational';
      legacySelect.dispatchEvent(new Event('change'));
    }
  }

  const input = document.getElementById('user-input');
  if (input) {
    input.placeholder = val ? 'Ask the Agent Network (Extreme Mode)...' : 'Message Vibe Engine...';
  }

  // Instantly re-render the history to switch between text bubbles and extreme canvas
  if (typeof chatBox !== 'undefined' && typeof store !== 'undefined' && store.sessions && store.currentId) {
    chatBox.innerHTML = '';
    const msgs = store.sessions[store.currentId]?.messages || [];
    msgs.forEach(m => {
      if (m.role === 'user') addUserMsg(m.content, false);
      else addAssistantMsg(m.content || '', m.classification, m.traces || [], false, m.web_sources || [], m.model || m.resolved_model);
    });
    
    // If a request is currently in flight, restore the typing indicator
    if (typeof sendBtn !== 'undefined' && sendBtn.disabled && typeof showTyping === 'function') {
      showTyping();
    }
    
    if (typeof renderWelcomeState === 'function') {
      renderWelcomeState();
    }
  }
}

// Modes available in Agent Extreme (excludes conversational/direct/historian)
const EXTREME_BUILTIN_MODES = [
  { id: 'conversational', name: '💬 Conversational' },
  { id: 'direct', name: '⚡ Direct (1-agent)' },
  { id: 'reasoning_fast', name: '🏎️ Fast Reasoning' },
  { id: 'reasoning', name: '🧠 Deep Reasoning (7-agent)' },
  { id: 'reasoning_loop', name: '🔁 Looping Agent' },
  { id: 'project_manager', name: '👔 Project Manager' },
];

function populateExtremeModeSelect() {
  const sel = document.getElementById('extreme-mode-select');
  if (!sel) return;
  sel.innerHTML = '';
  // Built-in multi-agent modes first
  EXTREME_BUILTIN_MODES.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    sel.appendChild(opt);
  });
  // Custom Workshop modes
  const custom = loadCustomModes();
  if (custom.length > 0) {
    const divider = document.createElement('option');
    divider.disabled = true;
    divider.textContent = '── Custom Workflows ──';
    sel.appendChild(divider);
    custom.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      const agentCount = Array.isArray(m.agents) ? m.agents.length : 0;
      const lockIcon = m.usePerStepModels ? ' 🔒' : '';
      opt.textContent = `${m.name} (${agentCount} node${agentCount !== 1 ? 's' : ''})${lockIcon}`;
      sel.appendChild(opt);
    });
  }
  // Restore last selected extreme mode
  const last = localStorage.getItem('vibe_extreme_last_mode');
  if (last && [...sel.options].some(o => o.value === last)) {
    sel.value = last;
  }
}

// Get the active mode to send to the API (respects which UI is active)
function getActiveMode() {
  if (isAgentExtremeMode()) {
    const sel = document.getElementById('extreme-mode-select');
    return sel?.value || 'reasoning';
  }
  // In conversational mode: always use conversational
  return 'conversational';
}


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
if (hfRouterInput) hfRouterInput.value = getHfRouter();
if (openaiApiKeyInput) openaiApiKeyInput.value = getOpenAIApiKey();
if (anthropicApiKeyInput) anthropicApiKeyInput.value = getAnthropicApiKey();

if (tracePromptsToggle) {
  tracePromptsToggle.checked = getIncludeTracePrompts();
  tracePromptsToggle.addEventListener('change', (e) => {
    setIncludeTracePrompts(!!e.target.checked);
  });
}
const autoSkipToggle = document.getElementById('auto-skip-toggle');
if (autoSkipToggle) {
  autoSkipToggle.checked = getAutoSkip();
  autoSkipToggle.addEventListener('change', (e) => {
    setAutoSkip(!!e.target.checked);
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
hfRouterInput?.addEventListener('change', (e) => {
  setHfRouter(e.target.value);
});
openaiApiKeyInput?.addEventListener('input', (e) => {
  setOpenAIApiKey(e.target.value);
  refreshModelOptionMeta();
});
anthropicApiKeyInput?.addEventListener('input', (e) => {
  setAnthropicApiKey(e.target.value);
  refreshModelOptionMeta();
});

const mainHfRoutingSlider = document.getElementById('main-hf-routing-slider');
if (mainHfRoutingSlider) {
  const savedRoutingVal = localStorage.getItem('vibe_hf_routing_val') || '1';
  mainHfRoutingSlider.value = savedRoutingVal;
  mainHfRoutingSlider.addEventListener('input', (e) => {
    localStorage.setItem('vibe_hf_routing_val', e.target.value);
  });
}

// Chat Store Manager
function loadStore() {
  try {
    const raw = localStorage.getItem(KEY_STORE);
    if (!raw) return { currentId: null, sessions: {} };
    return JSON.parse(raw);
  } catch (e) { return { currentId: null, sessions: {} }; }
}

function saveStore(s) {
  try { localStorage.setItem(KEY_STORE, JSON.stringify(s)); } catch (e) { console.error(e); }
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
// One-time migration: reset oversized groupchat/calendar tiles from a prior version
if (!localStorage.getItem('gc_cal_size_migrated_v2')) {
  if (missionWidgetSizes['groupchat']) missionWidgetSizes['groupchat'] = { x: 1, y: 1 };
  if (missionWidgetSizes['calendar']) missionWidgetSizes['calendar'] = { x: 1, y: 1 };
  saveMissionWidgetSizes(missionWidgetSizes);
  localStorage.setItem('gc_cal_size_migrated_v2', '1');
}
let missionWidgetPositions = loadMissionWidgetPositions();
let missionMiscTiles = loadMissionMiscTiles();
let missionSelectedFileId = '';
if (!localStorage.getItem('agent_chat_link_migration_v1')) {
  _healAllAgentChatLinks({ silent: true });
  localStorage.setItem('agent_chat_link_migration_v1', '1');
}
if (!missionProjects.length) {
  missionProjects = [{ id: 'proj-default', name: 'Default Project', created_at: Date.now(), chat_ids: [store.currentId] }];
  saveMissionProjects(missionProjects);
}
// Seed index.html into any existing project that has no files yet
if (!localStorage.getItem('proj_index_seed_v1')) {
  missionProjects.forEach(p => _seedProjectIndexHtml(p.id, p.name));
  localStorage.setItem('proj_index_seed_v1', '1');
}

function saveCurrentChat() {
  if (!store.currentId) return;
  store.sessions[store.currentId].messages = sessionMessages;
  // Update title based on first user message if needed
  if (store.sessions[store.currentId].title === 'New Chat' && sessionMessages.length > 0) {
    const first = sessionMessages.find(m => m.role === 'user');
    if (first) {
      store.sessions[store.currentId].title = first.content.slice(0, 30) + (first.content.length > 30 ? '...' : '');
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
  sessionMessages = store.sessions[newId].messages;
  saveStore(store);
  localStorage.setItem('vibe_current_view', 'chat');

  if (chatBox) chatBox.innerHTML = '';
  renderHistory();
  renderWelcomeState();
  if (window.input) { window.input.value = ''; window.input.focus(); }

  const chatPane = document.getElementById('chat-pane');
  const sandboxPane = document.getElementById('sandbox-pane');
  const agentChatPreviewModal = document.getElementById('agent-chat-preview-modal');
  if (chatPane) chatPane.style.display = '';
  if (sandboxPane) sandboxPane.style.display = '';
  if (agentChatPreviewModal) agentChatPreviewModal.classList.remove('open');

  window.__activeRunId = null;
  removeTyping();
}

function switchChat(id) {
  if (store.sessions[id] && store.currentId !== id) {
    store.currentId = id;
    sessionMessages = store.sessions[id].messages;
    saveStore(store);
    localStorage.setItem('vibe_current_view', 'chat');

    if (chatBox) {
      chatBox.innerHTML = '';
      const msgs = sessionMessages || [];
      msgs.forEach(m => {
        if (m.role === 'user') addUserMsg(m.content, false);
        else addAssistantMsg(m.content || '', m.classification, m.traces || [], false, m.web_sources || [], m.model || m.resolved_model);
      });
    }
    renderHistory();
    renderWelcomeState();
    if (window.input) { window.input.value = ''; window.input.focus(); }

    window.__activeRunId = null;
    removeTyping();
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
    for (const agent of (missionAgents || [])) {
      if (String(agent?.chat_id || '').trim() === id) {
        _ensureAgentChatSession(agent, { silent: true, reason: 'relinked after chat deletion' });
      }
    }
    saveStore(store);
    window.location.reload();
    return;
  }

  for (const agent of (missionAgents || [])) {
    if (String(agent?.chat_id || '').trim() === id) {
      _ensureAgentChatSession(agent, { silent: true, reason: 'relinked after chat deletion' });
    }
  }

  if (deletingCurrent) {
    const nextId = Object.keys(store.sessions)
      .sort((a, b) => store.sessions[b].timestamp - store.sessions[a].timestamp)[0];
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
  const missionOpen = document.body.classList.contains('mission-open');
  const ids = Object.keys(store.sessions).sort((a, b) => store.sessions[b].timestamp - store.sessions[a].timestamp);
  ids.forEach(id => {
    const sess = store.sessions[id];
    const div = document.createElement('div');
    div.className = 'history-item' + (!missionOpen && id === store.currentId ? ' active' : '');

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
    div.onclick = () => {
      const wasMission = document.body.classList.contains('mission-open');
      if (wasMission) {
        closeMissionPage();
      }
      if (id !== store.currentId) {
        switchChat(id);
      } else if (wasMission) {
        renderHistory();
      }
    };
    historyList.appendChild(div);
  });
  if (missionOpen) {
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
  if (!sess) return { title: '(no linked chat)', messages: [], timestamp: 0 };
  return {
    title: sess.title || 'Untitled',
    messages: sess.messages || [],
    timestamp: Number(sess.timestamp || 0),
  };
}

function _agentForSession(sessionId = store.currentId) {
  const sid = String(sessionId || '').trim();
  return sid ? missionAgents.find(a => String(a.chat_id || '').trim() === sid) || null : null;
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

function _isHtmlProjectFile(file) {
  const name = String(file?.name || '').trim();
  return /\.html?$/i.test(name);
}

function _getProjectPreviewEntry(projectId) {
  const pid = String(projectId || '').trim();
  const files = _projectFiles(pid);
  const project = missionProjects.find(p => p.id === pid) || null;
  const wanted = String(project?.preview_file || '').trim();

  let selected = null;
  if (wanted) {
    selected = files.find(f => String(f.name || '').toLowerCase() === wanted.toLowerCase()) || null;
    if (selected && !_isHtmlProjectFile(selected)) selected = null;
  }
  if (!selected) {
    selected = files.find(f => String(f.name || '').toLowerCase() === 'index.html') || files.find(_isHtmlProjectFile) || null;
  }

  return {
    project,
    files,
    htmlFiles: files.filter(_isHtmlProjectFile),
    selected,
  };
}

function _setProjectPreviewEntry(projectId, fileName) {
  const pid = String(projectId || '').trim();
  const target = String(fileName || '').trim().replace(/^['"`]|['"`]$/g, '');
  const project = missionProjects.find(p => p.id === pid);
  if (!project) return false;
  project.preview_file = target;
  saveMissionProjects(missionProjects);
  return true;
}

function _sandboxHasHtmlFiles() {
  return Array.isArray(sandboxFiles) && sandboxFiles.some(f => /\.html?$/i.test(String(f?.path || '')));
}

function _syncSandboxToProjectFiles(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid || !Array.isArray(sandboxFiles) || !sandboxFiles.length) return false;
  const files = _projectFiles(pid);
  let changed = false;
  const usedIds = new Set(files.map(f => String(f.id || '')));
  const makeId = () => {
    let id = `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    while (usedIds.has(id)) id = `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    usedIds.add(id);
    return id;
  };
  sandboxFiles.forEach(sf => {
    const path = String(sf?.path || '').trim();
    if (!path) return;
    const content = String(sf?.code || '');
    const existing = files.find(f => String(f.name || '').toLowerCase() === path.toLowerCase());
    if (existing) {
      if (String(existing.content || '') !== content) {
        existing.content = content.slice(0, 20000);
        changed = true;
      }
    } else {
      files.push({
        id: makeId(),
        name: path.slice(0, 80),
        content: content.slice(0, 20000),
      });
      changed = true;
    }
  });
  if (changed) saveMissionFiles(missionFiles);
  return changed;
}

function _extractPreviewFileDirective(rawText) {
  const text = String(rawText || '');
  if (!text.trim()) return '';

  let m = text.match(/\[\s*PREVIEW_FILE\s*:\s*([^\]\n]+)\]/i);
  if (m) return String(m[1] || '').trim();

  m = text.match(/(?:^|\n)\s*(?:PREVIEW_FILE|DISPLAY_FILE)\s*[:=]\s*([^\n]+)/i);
  if (m) return String(m[1] || '').trim();

  m = text.match(/```(?:preview_file|preview|display_file)\s*\n([\s\S]*?)```/i);
  if (m) {
    const line = String(m[1] || '').split('\n').map(x => x.trim()).find(Boolean) || '';
    return line;
  }

  return '';
}

function _swarmSmallModelDefault() {
  const preferred = [
    'meta-llama/Llama-3.1-8B-Instruct:cheapest',
    'Qwen/Qwen2.5-Coder-7B-Instruct:cheapest',
    'Qwen/Qwen2.5-1.5B-Instruct',
  ];
  const opts = Array.from(modelSelect?.options || []);
  for (const pid of preferred) {
    const hit = opts.find(o => String(o.value || '').trim() === pid);
    if (hit) return pid;
  }
  const light = opts.find(o => /8b|7b|light|small|1\.5b/i.test(String(o.textContent || '')));
  return String(light?.value || modelSelect?.value || '').trim();
}

function _clampSwarmSize(n) {
  const raw = Number(n);
  if (!Number.isFinite(raw)) return 8;
  return Math.max(1, Math.min(100, Math.round(raw)));
}

async function _runSwarmPipeline(agent, userText, history, modelOverride) {
  const swarmSize = _clampSwarmSize(agent?.swarm_size || 8);
  const workerModel = String(modelOverride || agent?.model || _swarmSmallModelDefault() || '').trim();
  const plannerPrompt =
    `[SWARM MODE: STAGE 1 / 3]\n` +
    `You are the swarm planner. Create exactly ${swarmSize} focused research tasks for this user goal.\n` +
    `Return STRICT JSON only with shape:\n` +
    `{"tasks":[{"title":"...","focus":"...","query":"..."}]}\n` +
    `No markdown.\n\n` +
    `User goal:\n${userText}`;

  const p = await callChatApi({
    message: plannerPrompt,
    mode: 'reasoning_fast',
    history,
    customMode: null,
    modelOverride: workerModel,
    sharedUrl: '',
  });
  if (!p?.res?.ok || !p?.data?.reply) {
    return { ok: false, error: p?.data?.error || 'Swarm planner failed.' };
  }

  let tasks = [];
  try {
    const raw = String(p.data.reply || '').trim();
    const m = raw.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(m ? m[0] : raw);
    tasks = Array.isArray(obj?.tasks) ? obj.tasks : [];
  } catch (_) { }
  if (!tasks.length) {
    tasks = Array.from({ length: swarmSize }).map((_, i) => ({
      title: `Worker ${i + 1}`,
      focus: `Subproblem ${i + 1} for: ${userText}`,
      query: userText,
    }));
  }
  if (tasks.length > 100) tasks = tasks.slice(0, 100);
  if (tasks.length < swarmSize) {
    const missing = swarmSize - tasks.length;
    for (let i = 0; i < missing; i += 1) {
      tasks.push({
        title: `Worker ${tasks.length + 1}`,
        focus: `Additional angle for: ${userText}`,
        query: userText,
      });
    }
  }

  const findings = [];
  for (let i = 0; i < tasks.length; i += 1) {
    const t = tasks[i] || {};
    const wPrompt =
      `[SWARM MODE: STAGE 2 / 3]\n` +
      `You are worker ${i + 1}/${tasks.length}. Keep output concise and factual.\n` +
      `Return 4-8 bullet points plus one short verdict.\n\n` +
      `Task title: ${String(t.title || `Worker ${i + 1}`)}\n` +
      `Focus: ${String(t.focus || '')}\n` +
      `Query: ${String(t.query || userText)}\n`;
    const wr = await callChatApi({
      message: wPrompt,
      mode: 'reasoning_fast',
      history: [],
      customMode: null,
      modelOverride: workerModel,
      sharedUrl: '',
    });
    findings.push({
      idx: i + 1,
      title: String(t.title || `Worker ${i + 1}`),
      focus: String(t.focus || ''),
      reply: String(wr?.data?.reply || wr?.data?.error || 'No result'),
    });
  }

  const compactFindings = findings.map(f =>
    `Worker ${f.idx} - ${f.title}\nFocus: ${f.focus}\n${String(f.reply || '').slice(0, 1200)}`
  ).join('\n\n---\n\n');
  const synthPrompt =
    `[SWARM MODE: STAGE 3 / 3]\n` +
    `You are the synthesizer. Combine worker findings, rank best options, and produce a digestible recommendation.\n` +
    `Output format:\n` +
    `1) Executive summary (short)\n` +
    `2) Ranked choices (#1, #2, #3...) with reasons\n` +
    `3) Trade-offs / caveats\n` +
    `4) Final recommendation\n\n` +
    `User goal: ${userText}\n\n` +
    `[WORKER_FINDINGS]\n${compactFindings}\n[/WORKER_FINDINGS]`;
  const sr = await callChatApi({
    message: synthPrompt,
    mode: 'reasoning_fast',
    history: [],
    customMode: null,
    modelOverride: workerModel,
    sharedUrl: '',
  });
  if (!sr?.res?.ok || !sr?.data?.reply) {
    return { ok: false, error: sr?.data?.error || 'Swarm synthesizer failed.' };
  }

  const planPreview = tasks.slice(0, 12).map((t, i) =>
    `${i + 1}. ${String(t.title || `Worker ${i + 1}`)} - ${String(t.focus || '').slice(0, 120)}`
  ).join('\n');
  const reply =
    `Swarm completed with ${tasks.length} workers using ${workerModel || 'default small model'}.\n\n` +
    `Stage 1 (planner) created ${tasks.length} assignments.\n` +
    (planPreview ? `Top assignments:\n${planPreview}${tasks.length > 12 ? '\n...and more.' : ''}\n\n` : '\n') +
    `Stage 3 final synthesis:\n\n${String(sr.data.reply || '').trim()}`;

  const traces = [
    { agent: 'Swarm Planner', content: `Planned ${tasks.length} tasks.` },
    { agent: 'Swarm Workers', content: `Executed ${tasks.length} worker calls.` },
    { agent: 'Swarm Synthesizer', content: 'Combined and ranked results into final recommendation.' },
  ];
  return { ok: true, reply, traces };
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

  // First pass: keep saved positions stable (only if they do not overlap)
  all.forEach(w => {
    const id = w.dataset.widgetId;
    const sz = _normalizeWidgetSize(missionWidgetSizes[id]);
    _setWidgetSpan(w, sz.x, sz.y);

    const hasSaved = missionWidgetPositions[id] && typeof missionWidgetPositions[id] === 'object';
    if (!hasSaved) return;

    const fixed = _normalizeWidgetPos(missionWidgetPositions[id]);
    if (_canPlaceRect(occupied, fixed.col, fixed.row, sz.x, sz.y)) {
      _setWidgetPlacement(w, fixed.col, fixed.row);
      _occupyRect(occupied, fixed.col, fixed.row, sz.x, sz.y);
    } else {
      delete missionWidgetPositions[id];
    }
  });

  // Second pass: assign first open cells for tiles without saved positions (or those that overlapped)
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
  const cell = Math.max(380, Math.min(480, Math.round(rawCell || 380)));
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
  if (!missionWidgetGrid) return 8;
  const styles = getComputedStyle(missionWidgetGrid);
  const raw = String(styles.gridTemplateColumns || missionWidgetGrid.style.gridTemplateColumns || '').trim();
  if (!raw) return 8;
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) return tokens.length;
  const m = raw.match(/repeat\s*\(\s*(\d+)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return Math.max(1, tokens.length || 8);
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
  el.classList.remove('w-size-1x1', 'w-size-2x1', 'w-size-1x2', 'w-size-2x2');
  if (x === 2 && y === 2) el.classList.add('w-size-2x2');
  else if (x === 2 && y === 1) el.classList.add('w-size-2x1');
  else if (x === 1 && y === 2) el.classList.add('w-size-1x2');
  else if (x === 1 && y === 1) el.classList.add('w-size-1x1');
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
  const y = Math.max(1, Math.min(spanY || 1));
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
  const y = Math.max(1, Math.min(spanY || 1));
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
  const y = Math.max(1, Math.min(spanY || 1));
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
      try { e.dataTransfer.dropEffect = 'move'; } catch (_) { }

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
    dragHandle.draggable = true;

    dragHandle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      __missionDnDState.dragArmId = w.dataset.widgetId || '';
    });

    const header = w.querySelector('.mission-widget-header');
    header?.addEventListener('pointerdown', (e) => {
      if (e.target && e.target.closest && e.target.closest('button,input,textarea,select,a,.mission-widget-resize-handle')) return;
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
      } catch (_) { }
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
      __missionDnDState.dragArmId = '';
      __missionDnDState.resizingWidgetId = w.dataset.widgetId || '';
      const wasDraggable = w.draggable;
      w.draggable = false;
      const dh = w.querySelector('.mission-widget-drag-handle');
      const wasDhDrag = dh ? !!dh.draggable : false;
      if (dh) dh.draggable = false;
      handle.classList.add('active');

      const styles = getComputedStyle(missionWidgetGrid);
      const cols = _gridColCount();
      const gap = parseFloat(styles.columnGap || styles.gap || '10') || 10;
      const rowTrack = String(styles.gridAutoRows || missionWidgetGrid.style.gridAutoRows || '180');
      const cellH = Math.max(40, parseFloat(rowTrack) || 180);
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
      try { handle.setPointerCapture?.(e.pointerId); } catch (_) { }

      const wid = w.dataset.widgetId || '';
      const onMove = (ev) => {
        ev.preventDefault();
        const nx = startSpanX + Math.round((ev.clientX - startX) / stepX);
        const ny = startSpanY + Math.round((ev.clientY - startY) / stepY);
        _setWidgetSpan(w, nx, ny);
        _setWidgetPlacement(w, startCol, startRow);
        if (wid) {
          missionWidgetSizes[wid] = {
            x: Number(w.dataset.spanX || 1),
            y: Number(w.dataset.spanY || 1),
          };
        }
      };

      const onUp = () => {
        document.removeEventListener('pointermove', onMove, true);
        document.removeEventListener('pointerup', onUp, true);
        document.removeEventListener('pointercancel', onUp, true);
        saveWidgetSize(w);
        missionWidgetPositions[w.dataset.widgetId || ''] = {
          col: Number(w.dataset.col || 1),
          row: Number(w.dataset.row || 1),
        };
        saveMissionWidgetPositions(missionWidgetPositions);
        applyMissionWidgetBoard();
        __missionDnDState.resizingWidgetId = '';
        w.draggable = wasDraggable;
        if (dh) dh.draggable = wasDhDrag;
        handle.classList.remove('active');
        try { handle.releasePointerCapture?.(e.pointerId); } catch (_) { }
      };

      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', onUp, true);
      document.addEventListener('pointercancel', onUp, true);
    });
  });

  if (missionWidgetGrid.dataset.resizeBound !== '1') {
    missionWidgetGrid.dataset.resizeBound = '1';
  }
}

window.setMissionUsageTab = function (tab) {
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
        <button class="hdr-btn" style="flex:1;${missionUsageActiveTab === 'agent' ? 'background:var(--primary-glow);border-color:var(--primary);color:var(--primary);' : ''}" onclick="setMissionUsageTab('agent')">By Agent</button>
        <button class="hdr-btn" style="flex:1;${missionUsageActiveTab === 'daily' ? 'background:var(--primary-glow);border-color:var(--primary);color:var(--primary);' : ''}" onclick="setMissionUsageTab('daily')">Per Day</button>
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
    // Aggregate by day (prefer message timestamp, fallback to session timestamp)
    const daily = {};
    agents.forEach(a => {
      const summary = _sessionSummaryForAgent(a);
      const msgs = summary.messages || [];
      msgs.forEach(m => {
        const ts = Number(m?.timestamp || m?.created_at || summary.timestamp || Date.now());
        const d = new Date(ts);
        const day = Number.isNaN(d.getTime())
          ? new Date().toISOString().slice(0, 10)
          : d.toISOString().slice(0, 10);
        daily[day] = (daily[day] || 0) + 1 + (Array.isArray(m?.traces) ? m.traces.length : 0);
      });
    });
    const days = Object.keys(daily).sort((a, b) => new Date(a) - new Date(b)).slice(-7);
    const max = Math.max(...Object.values(daily), 1);

    let html = '<div style="font-size:.72rem;color:var(--text-muted);margin-bottom:8px;">API calls per day (last 7 active days)</div>';
    if (!days.length) {
      html += '<div style="font-size:.68rem;opacity:.7;">No activity yet.</div>';
    }
    if (days.length) {
      const bars = days.map(day => {
        const count = Number(daily[day] || 0);
        const height = Math.max(8, Math.round((count / max) * 100));
        const label = new Date(`${day}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
        return `
            <div style="display:flex;flex-direction:column;align-items:center;gap:6px;min-width:42px;flex:1;">
              <div style="font-size:.62rem;opacity:.88;">${count}</div>
              <div style="width:100%;height:110px;display:flex;align-items:flex-end;justify-content:center;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:4px;">
                <div title="${esc(day)}: ${count} calls" style="width:78%;height:${height}%;min-height:6px;border-radius:6px 6px 3px 3px;background:linear-gradient(180deg, #10b981, var(--primary));"></div>
              </div>
              <div style="font-size:.6rem;opacity:.8;text-align:center;line-height:1.1;">${esc(label)}</div>
            </div>`;
      }).join('');
      html += `<div style="display:flex;align-items:flex-end;gap:8px;overflow-x:auto;padding-bottom:4px;">${bars}</div>`;
    }
    contentDiv.innerHTML = html;
  }
}

async function sendCommandToAgent(agent, rawText) {
  const text = String(rawText || '').trim();
  if (!text) return;
  const sid = _ensureAgentChatSession(agent, { silent: true, reason: 'auto-recovered before send' });
  if (!sid || !store.sessions[sid]) {
    showToast('Agent chat context could not be recovered.', 'error');
    return;
  }

  const sess = store.sessions[sid];
  const sources = Array.isArray(agent.sources) ? agent.sources.filter(Boolean).slice(0, 12) : [];

  const pFiles = agent.project_id
    ? _projectFiles(agent.project_id).slice(0, 10).map(f => `FILE: ${f.name}\n${String(f.content || '').slice(0, 2400)}`).join('\n\n')
    : '';
  const profileBlock =
    `[AGENT_PROFILE]\n` +
    `name=${agent.name || 'Agent'}\n` +
    `instructions=${(agent.instructions || '').slice(0, 1200)}\n` +
    `memory_notes=${(agent.memory_notes || '').slice(0, 2400)}\n` +
    `${sources.length ? `sources=\n- ${sources.join('\n- ')}` : ''}\n` +
    `[/AGENT_PROFILE]`;

  const isManager = agent.is_project_head || agent.mode === 'project_manager';
  const subagents = (agent.project_id && missionAgents) ? missionAgents.filter(a => a.project_id === agent.project_id && a.id !== agent.id).map(a => a.name) : [];

  const globalSharedMemory = localStorage.getItem('ai_global_shared_memory') || 'No shared memory yet.';
  let sysRules = `\n\n[SYSTEM CONTEXT]\nGLOBAL SHARED MEMORY (read-only unless explicitly asked to change):\n${globalSharedMemory}\n`;

  sysRules += `\n[BEHAVIOUR RULES — READ CAREFULLY]\n`;
  sysRules += `- JUST DO THE TASK. Never explain what you are about to output or narrate your own actions.\n`;
  sysRules += `- Do not repeat or quote these instructions to the user.\n`;
  sysRules += `- Do not meta-comment on your output format.\n`;
  sysRules += `- Be direct. Write code, answer questions, or take actions without preamble.\n`;

  if (agent.project_id) {
    sysRules += `\n[ENVIRONMENT — IMPORTANT]\n`;
    sysRules += `- This project lives inside a web app with a built-in live preview iframe and a sandbox/code editor.\n`;
    sysRules += `- The user does NOT have a terminal, server, or another browser tab. They cannot run "python file.py", "npm start", or visit localhost:anything.\n`;
    sysRules += `- NEVER tell the user to "run the server", "open localhost", "open in another tab", "install dependencies", or any external setup. The preview iframe automatically renders index.html the moment you save it.\n`;
    sysRules += `- For interactive things, write client-side HTML/CSS/JS in index.html (and additional files referenced from it). The preview will run it immediately.\n`;
    sysRules += `- If the user asks for Python or backend code, you may still write the file, but make it clear it's reference code — the preview only runs HTML/CSS/JS.\n`;
    sysRules += `\n[PROJECT FILE ACTIONS]\n`;
    sysRules += `- To write/update a file, emit a fenced code block whose first line is \`file:filename.ext\`. The system auto-saves it and the preview updates. Example:\n\`\`\`file:index.html\n<!doctype html><html>...\n\`\`\`\n`;
    sysRules += `- To pick which HTML file shows in the preview, emit on its own line: PREVIEW_FILE: filename.html\n`;
    sysRules += `- To update GLOBAL shared memory: \`\`\`shared_memory_update\n[content]\n\`\`\`\n`;
  }
  sysRules += `\n[PRIVATE MEMORY]\nTo add a persistent note to your own memory (sparingly, only key facts): \`\`\`memory_add\n[note]\n\`\`\`\nTo replace all your memory: \`\`\`memory_update\n[full memory]\n\`\`\`\n`;

  if (isManager && subagents.length > 0) {
    sysRules += `\n[TEAM DELEGATION]\nYou lead this project. Subagents available: ${subagents.join(', ')}. To delegate: \`\`\`agent:AgentName\n[task]\n\`\`\`\n`;
  } else if (!isManager && agent.project_id) {
    sysRules += `\n[ROLE] You are a focused subagent. Do your task, write files, explain changes concisely.\n`;
  }

  const projectBlock = pFiles
    ? `\n\n[PROJECT_INFO_FILES]\n${pFiles}\n[/PROJECT_INFO_FILES]`
    : '';

  const outbound = `${text}\n\n${profileBlock}${projectBlock}${sysRules}`.trim();
  const isCurrentMainAgentChat = sid === store.currentId
    && !agentChatModal?.classList.contains('open')
    && !agentChatPreviewModal?.classList.contains('open');
  const acb = (agentChatPreviewModal?.classList.contains('open') && agentChatPreviewMessages)
    ? agentChatPreviewMessages
    : (agentChatModal?.classList.contains('open') ? agentChatMessages : null);

  if (isCurrentMainAgentChat) {
    addUserMsg(text);
    showTyping();
    startStageTicker();
  } else {
    sess.messages.push({ role: 'user', content: text });
    sess.timestamp = Date.now();
    saveStore(store);
    renderHistory();
  }

  // Immediate UX feedback: show the user's message + typing indicator in the agent chat modal
  let _agentTypingRow = null;
  if (acb && missionOpenAgentId === agent.id) {
    const row = document.createElement('div');
    row.className = 'msg user';
    row.style.marginBottom = '8px';
    row.innerHTML =
      `<div style="font-size:.66rem;opacity:.85;margin-bottom:4px;">USER</div>` +
      `<div style="white-space:pre-wrap;font-size:.76rem;">${esc(text)}</div>`;
    acb.appendChild(row);
    // Typing indicator
    _agentTypingRow = document.createElement('div');
    _agentTypingRow.className = 'msg assistant';
    _agentTypingRow.style.marginBottom = '8px';
    _agentTypingRow.innerHTML =
      `<div style="font-size:.66rem;opacity:.85;margin-bottom:4px;">AI</div>` +
      `<div class="agent-typing-dots" style="display:flex;gap:5px;align-items:center;padding:4px 0;">` +
      `<span style="width:7px;height:7px;border-radius:50%;background:var(--primary);opacity:.9;animation:agentDotBounce .9s infinite ease-in-out;animation-delay:0s;"></span>` +
      `<span style="width:7px;height:7px;border-radius:50%;background:var(--primary);opacity:.9;animation:agentDotBounce .9s infinite ease-in-out;animation-delay:.18s;"></span>` +
      `<span style="width:7px;height:7px;border-radius:50%;background:var(--primary);opacity:.9;animation:agentDotBounce .9s infinite ease-in-out;animation-delay:.36s;"></span>` +
      `</div>`;
    acb.appendChild(_agentTypingRow);
    acb.scrollTop = acb.scrollHeight;
  }

  const history = (sess.messages || []).map(m => ({ role: m.role, content: m.content }));
  // Only use full-chat controls as authoritative UI mode/model.
  // Preview modal has no mode/model controls and should never override agent settings.
  const controlsForThisAgentOpen = missionOpenAgentId === agent.id
    && agentChatModal?.classList.contains('open');
  if (controlsForThisAgentOpen) {
    const uiMode = String(document.getElementById('agent-chat-mode')?.value || '').trim();
    const uiModel = String(document.getElementById('agent-chat-model')?.value || '').trim();
    let changed = false;
    if (uiMode && uiMode !== String(agent.mode || '')) {
      agent.mode = uiMode;
      changed = true;
    }
    if (uiModel && uiModel !== String(agent.model || '')) {
      agent.model = uiModel;
      changed = true;
    }
    if (changed) saveMissionAgents(missionAgents);
  }
  const mode = String(agent.mode || 'conversational').trim();
  const modelOverride = String(agent.model || '').trim() || null;

  let typId = 'typ-' + Date.now();
  if (acb) {
    const div = document.createElement('div');
    div.className = 'msg assistant typing-indicator';
    div.id = typId;
    div.style.alignSelf = 'flex-start';
    div.style.marginBottom = '10px';
    div.innerHTML = '<span></span><span></span><span></span>';
    acb.appendChild(div);
    acb.scrollTop = acb.scrollHeight;
  }

  let res;
  let data;
  try {
    if (mode === 'swarm') {
      const swarm = await _runSwarmPipeline(agent, text, history, modelOverride);
      if (!swarm.ok) {
        res = { ok: false };
        data = { error: swarm.error || 'Swarm mode failed.' };
      } else {
        res = { ok: true };
        data = { reply: swarm.reply, traces: swarm.traces || [], classification: 'SWARM' };
      }
    } else {
      ({ res, data } = await callChatApi({
        message: outbound,
        mode,
        history,
        customMode: null,
        modelOverride,
        sharedUrl: '',
      }));
    }
    notifyFinish('Agent Finished', `${agent.name || 'Agent'} completed the task.`);
  } catch (err) {
    agent.last_status = 'error';
    saveMissionAgents(missionAgents);
    if (isCurrentMainAgentChat) {
      removeTyping();
      stopStageTicker();
      if (err.name === 'AbortError') {
        addAssistantMsg(`⚠️ Agent canceled by kill switch.`, null, []);
      } else {
        addAssistantMsg(`⚠️ Agent request failed: ${err?.message || err}`, null, []);
      }
    }
    if (err.name === 'AbortError') {
      showToast(`Agent canceled by kill switch.`, 'info');
    } else {
      showToast(`Agent request failed: ${err?.message || err}`, 'error');
    }
    return;
  } finally {
    if (acb) {
      const tEl = document.getElementById(typId);
      if (tEl) tEl.remove();
    }
    if (isCurrentMainAgentChat) {
      removeTyping();
      stopStageTicker();
    }
  }

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
        if (typeof renderMissionProjects === 'function') renderMissionProjects();

        // Auto-sync this project's files into the sandbox if the sandbox is open
        // OR this is the currently selected project — so the preview lights up immediately.
        const isActiveProject = projId === missionSelectedProjectId;
        const sandboxOpen = sandboxPane?.classList.contains('open');
        if (isActiveProject || sandboxOpen) {
          const sbFiles = files.map(f => ({
            path: String(f.name || ''),
            lang: inferLangFromPath(String(f.name || '')),
            code: String(f.content || ''),
          })).filter(f => f.path);
          sandboxFiles = normalizeSandboxFiles(sbFiles);
          if (!sandboxFiles.find(f => f.path === activeSandboxFile)) {
            activeSandboxFile = sandboxFiles[0]?.path || 'index.html';
          }
          if (sandboxOpen) {
            renderSandboxFileList();
            renderSandboxEditor();
            refreshSandboxPreview();
          } else {
            const edgeBtn = document.getElementById('sandbox-edge-btn');
            if (edgeBtn) edgeBtn.classList.add('attention');
          }
        }

        showToast(`Agent updated ${filesEdited} file(s) — preview refreshed.`, 'success', 2200);
      }
    }

    const memAddRegex = /```memory_add\n([\s\S]*?)```/gi;
    let memAddMatch;
    let addedMemoryNotes = [];
    while ((memAddMatch = memAddRegex.exec(replyText)) !== null) {
      const note = String(memAddMatch[1] || '').trim();
      if (note) addedMemoryNotes.push(note);
    }
    if (addedMemoryNotes.length && agent.id) {
      const existing = String(agent.memory_notes || '').trim();
      const stamp = new Date().toLocaleDateString();
      const additions = addedMemoryNotes.map(note => `- ${stamp}: ${note}`).join('\n');
      agent.memory_notes = [existing, additions].filter(Boolean).join('\n').slice(0, 12000);
      saveMissionAgents(missionAgents);
      showToast(`Agent added ${addedMemoryNotes.length} memory note(s).`, 'success', 2200);
    }

    const memRegex = /```memory_update\n([\s\S]*?)```/i;
    let memMatch = replyText.match(memRegex);
    if (memMatch && agent.id) {
      agent.memory_notes = memMatch[1].trim();
      saveMissionAgents(missionAgents);
      showToast(`Agent replaced its private memory.`, 'success', 2000);
    }

    const sharedMemRegex = /```shared_memory_update\n([\s\S]*?)```/i;
    let sharedMemMatch = replyText.match(sharedMemRegex);
    if (sharedMemMatch) {
      localStorage.setItem('ai_global_shared_memory', sharedMemMatch[1].trim());
      showToast(`Agent updated the GLOBAL shared memory.`, 'success', 2500);
    }

    const previewTarget = _extractPreviewFileDirective(replyText);
    if (projId && previewTarget) {
      if (_setProjectPreviewEntry(projId, previewTarget)) {
        showToast(`Preview file set to ${previewTarget}`, 'success', 2200);
      }
    }

    // Strip invisible system directive lines from the displayed reply so users never see them.
    // Keep file: code blocks visible (the code is useful to see), but strip memory/shared_memory/agent blocks
    // and any "open localhost / run the server" lines (the embedded preview handles execution).
    const cleanReply = (data.reply || '')
      .replace(/(?:^|\n)[^\S\n]*(?:PREVIEW_FILE|DISPLAY_FILE)\s*[:=]\s*[^\n]*/gi, '')
      .replace(/\[\s*PREVIEW_FILE\s*:[^\]]*\]/gi, '')
      .replace(/```(?:memory_add|memory_update|shared_memory_update|agent:[^\n]*)\n[\s\S]*?```/gi, '')
      .replace(/(?:^|\n)[^\n]*(?:open\s+(?:up\s+)?(?:your\s+)?(?:browser|terminal)[^\n]*localhost[^\n]*|visit\s+(?:http:\/\/)?localhost[^\n]*|run\s+(?:the\s+)?server[^\n]*localhost[^\n]*|http:\/\/localhost[^\n]*)/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Remove typing indicator before appending reply
    if (_agentTypingRow) { _agentTypingRow.remove(); _agentTypingRow = null; }

    if (isCurrentMainAgentChat) {
      addAssistantMsg(cleanReply, data.classification, data.traces || [], true, data.web_sources || []);
    } else {
      sess.messages.push({ role: 'assistant', content: cleanReply, classification: data.classification, traces: data.traces || [], web_sources: data.web_sources || [] });
      sess.timestamp = Date.now();
      saveStore(store);
      renderHistory();
    }
    updateMissionStateFromResponse(data);
    agent.last_status = 'active';
    agent.last_command_at = Date.now();
    saveMissionAgents(missionAgents);
    renderMissionProjects();
    if (missionOpenAgentId === agent.id) {
      if (agentChatModal?.classList.contains('open')) renderAgentChatModal(agent.id);
      if (agentChatPreviewModal?.classList.contains('open')) renderAgentChatPreview(agent.id);
    }

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
    return cleanReply;
  } else {
    if (_agentTypingRow) { _agentTypingRow.remove(); _agentTypingRow = null; }
    agent.last_status = 'error';
    saveMissionAgents(missionAgents);
    if (isCurrentMainAgentChat) {
      addAssistantMsg(`⚠️ ${data?.error || 'Agent command failed.'}`, null, data?.traces || []);
    } else if (acb) {
      const errRow = document.createElement('div');
      errRow.className = 'msg assistant';
      errRow.style.marginBottom = '8px';
      errRow.innerHTML = `<div style="font-size:.66rem;opacity:.85;margin-bottom:4px;">AI</div><div style="color:#f87171;font-size:.76rem;">⚠️ ${esc(data?.error || 'Agent command failed.')}</div>`;
      acb.appendChild(errRow);
      acb.scrollTop = acb.scrollHeight;
    }
    showToast(data?.error || 'Agent command failed.', 'error');
    return null;
  }
}

function renderAgentChatThread(targetEl, messages, showTraces = true) {
  if (!targetEl) return;
  targetEl.innerHTML = '';
  (messages || []).forEach(m => {
    const row = document.createElement('div');
    row.className = m.role === 'user' ? 'msg user' : 'msg assistant';
    row.style.marginBottom = '8px';

    let tracesHtml = '';
    if (showTraces && m.role === 'assistant' && Array.isArray(m.traces) && m.traces.length > 0) {
      const trs = m.traces.map(t => `<div style="margin-bottom:6px; padding-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.05);"><strong style="color:var(--primary); font-size:0.65rem;">${esc(t.agent)}</strong><div style="font-size:0.65rem; opacity:0.8; white-space:pre-wrap;">${esc(t.content)}</div></div>`).join('');
      tracesHtml = `<details style="margin-bottom:8px; background:rgba(0,0,0,0.15); padding:6px; border-radius:6px; border:1px solid rgba(255,255,255,0.05);">
          <summary style="font-size:0.65rem; opacity:0.8; cursor:pointer;">Show Reasoning Traces (${m.traces.length} steps)</summary>
          <div style="margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05); max-height:200px; overflow:auto;">${trs}</div>
        </details>`;
    }

    if (Array.isArray(m.web_sources) && m.web_sources.length > 0) {
      const urls = m.web_sources.map(w => `<a href="${esc(w.url)}" target="_blank" style="color:var(--primary);text-decoration:underline;">${esc(w.title || w.url)}</a>`).join(', ');
      tracesHtml += `<div style="margin-bottom:8px;padding:6px;border-radius:6px;background:var(--code-bg);border:1px solid var(--primary);font-size:0.7rem;opacity:0.9;">🌐 <strong>Searched Web:</strong> ${urls}</div>`;
    }

    row.innerHTML = `<div style="font-size:.66rem;opacity:.85;margin-bottom:4px;">${esc((m.role || '').toUpperCase())}</div>` +
      tracesHtml +
      `<div style="white-space:pre-wrap;font-size:.76rem;">${formatChatText(m.content || '')}</div>`;
    targetEl.appendChild(row);
  });
  targetEl.scrollTop = targetEl.scrollHeight;
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
  renderAgentChatThread(agentChatMessages, msgs);
  renderAgentContextPanel(agent, summary);
}

function renderAgentChatPreview(agentId) {
  const agent = missionAgents.find(a => a.id === agentId);
  if (!agent || !agentChatPreviewMessages) return;
  const project = missionProjects.find(p => p.id === agent.project_id) || null;
  const summary = _sessionSummaryForAgent(agent);
  if (agentChatPreviewTitle) {
    agentChatPreviewTitle.textContent = `${agent.name || 'Agent'} · ${summary.title}`;
  }
  if (agentChatPreviewPath) {
    const projName = project?.name || 'Project';
    agentChatPreviewPath.textContent = `Mission Hub / ${projName} / ${agent.name || 'Agent'} (Quick View)`;
  }
  renderAgentChatThread(agentChatPreviewMessages, summary.messages || [], false);
}

function renderAgentContextPanel(agent, summary = null, targetEl = agentChatContext) {
  if (!targetEl) return;
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

  targetEl.innerHTML =
    `<div style="display:flex;flex-direction:column;gap:8px;min-height:0;">
        <details open>
          <summary style="cursor:pointer;font-size:.72rem;font-weight:700;">Role & Instructions (Editable)</summary>
          <textarea data-agent-edit-instructions style="margin-top:6px;width:100%;min-height:96px;padding:7px;border-radius:8px;border:1px solid var(--border);background:var(--panel-bg);color:var(--text);">${esc(agent.instructions || '')}</textarea>
        </details>
        <details open>
          <summary style="cursor:pointer;font-size:.72rem;font-weight:700;">Memory & Activity</summary>
          <div style="margin-top:6px;font-size:.67rem;line-height:1.5;">
            <div><strong>Status:</strong> ${esc(agent.last_status || 'idle')}</div>
            <div><strong>Mode:</strong> ${esc(agent.mode || 'conversational')}</div>
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

  // Hide project selection for "hub" mode so independent agents stay independent
  const projLabel = agentConfigProject.previousElementSibling;
  if (missionViewMode === 'hub') {
    agentConfigProject.style.display = 'none';
    if (projLabel && projLabel.tagName === 'LABEL') projLabel.style.display = 'none';
  } else {
    agentConfigProject.style.display = '';
    if (projLabel && projLabel.tagName === 'LABEL') projLabel.style.display = '';
  }

  agentConfigName.value = editing?.name || '';
  agentConfigMode.value = editing?.mode || 'conversational';
  agentConfigInstructions.value = editing?.instructions || 'You are a helpful specialist agent.';
  agentConfigSources.value = Array.isArray(editing?.sources) ? editing.sources.join('\n') : '';
  agentConfigMemory.value = editing?.memory_notes || '';
  const webSearchCheck = document.getElementById('agent-config-web-search');
  if (webSearchCheck) webSearchCheck.checked = !!editing?.allow_web_search;
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
  if (missionViewMode === 'hub') {
    renderMissionAgentTiles('');
  } else {
    renderMissionAgentTiles(missionSelectedProjectId);
  }
}

function openAgentChat(agentId, returnTo = 'mission') {
  const agent = missionAgents.find(a => a.id === agentId);
  if (!agent) return;
  agentChatPreviewModal?.classList.remove('open');
  agentChatModal?.classList.remove('open');
  store.currentId = agent.chat_id;
  saveStore(store);
  localStorage.setItem('vibe_current_view', 'chat');
  window.location.reload();
}

function openAgentChatPreview(agentId, returnTo = 'project') {
  const agent = missionAgents.find(a => a.id === agentId);
  if (!agent) return;
  agentChatPreviewModal?.classList.remove('open');
  agentChatModal?.classList.remove('open');
  store.currentId = agent.chat_id;
  saveStore(store);
  localStorage.setItem('vibe_current_view', 'chat');
  window.location.reload();
}

function _seedProjectIndexHtml(projectId, projectName) {
  const files = _projectFiles(projectId);
  if (files.some(f => /^index\.html$/i.test(String(f.name || '')))) return; // already exists
  const name = String(projectName || 'Project');
  files.push({
    id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: 'index.html',
    content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name}</title>
  <style>
    body { font-family: sans-serif; padding: 32px; background: #f8f9fa; color: #222; }
    h1 { font-size: 1.6rem; margin: 0 0 12px; }
    p  { opacity: .7; }
  </style>
</head>
<body>
  <h1>${name}</h1>
  <p>Agents will build this project here. This file is the live preview entry point.</p>
</body>
</html>`,
  });
  saveMissionFiles(missionFiles);
}

async function createMissionProject() {
  const name = await showCustomPrompt('Project name:', 'New Project');
  if (!name || !name.trim()) return null;
  const p = {
    id: `proj-${Date.now()}`,
    name: name.trim().slice(0, 80),
    created_at: Date.now(),
    chat_ids: [],
  };
  missionProjects.unshift(p);
  saveMissionProjects(missionProjects);
  _seedProjectIndexHtml(p.id, p.name);
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
  
  createMissionAgent({
    name: 'Project Manager',
    project_id: p.id,
    instructions: 'You are the Project Manager. Coordinate other agents, monitor progress, and break down tasks.',
    mode: 'project_manager',
    is_project_head: true
  });
  
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
    swarm_size: _clampSwarmSize(config.swarm_size || 8),
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

async function createMissionMiscTile(type = 'note', defaultTitle = 'Misc Tile', defaultContent = '') {
  const title = await showCustomPrompt('Tile name:', defaultTitle);
  if (!title || !title.trim()) return null;
  let content = defaultContent;
  if (type === 'note') {
    content = await showCustomPrompt('Initial note:', defaultContent) || '';
  }
  const tile = {
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: type,
    title: title.trim().slice(0, 80),
    content: String(content || '').slice(0, 4000),
    created_at: Date.now(),
    project_id: missionViewMode === 'project' ? missionSelectedProjectId : ''
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

// ── Email Tile ────────────────────────────────────────────────────────────────

function renderEmailTile(item, tile) {
  tile.className = 'mission-widget w-size-1x1 misc-tile-dynamic email-tile';
  tile.innerHTML = `
    <div class="mission-widget-header">
      <span>✉ ${esc(item.title || 'Email')}</span>
      <div class="spacer"></div>
      <span class="email-unread-badge" id="ebadge-${item.id}" style="display:none;"></span>
      <button class="hdr-btn email-tab-btn active" data-etab="inbox" title="Inbox">📥</button>
      <button class="hdr-btn email-tab-btn" data-etab="compose" title="Compose">✏️</button>
      <button class="hdr-btn email-tab-btn" data-etab="config" title="Settings">⚙</button>
      <button class="hdr-btn" data-misc-delete="${esc(item.id)}" title="Remove tile">✕</button>
    </div>
    <div class="mission-widget-body email-body">

      <!-- ── Inbox Panel ── -->
      <div class="email-panel" id="epanel-inbox-${item.id}">
        <div class="email-inbox-toolbar">
          <button class="hdr-btn" id="erefresh-${item.id}" style="font-size:.65rem;">↻ Refresh</button>
          <span class="email-inbox-status" id="estatus-${item.id}" style="font-size:.6rem;opacity:.6;"></span>
          <div class="spacer"></div>
          <button class="hdr-btn" id="eprev-${item.id}" style="font-size:.65rem;">‹</button>
          <span class="email-page-label" id="epage-${item.id}" style="font-size:.6rem;opacity:.7;">p1</span>
          <button class="hdr-btn" id="enext-${item.id}" style="font-size:.65rem;">›</button>
        </div>
        <div class="email-msg-list" id="emsglist-${item.id}">
          <div class="email-empty">Click ↻ Refresh to load emails</div>
        </div>
      </div>

      <!-- ── Message Reader Panel ── -->
      <div class="email-panel" id="epanel-reader-${item.id}" style="display:none;">
        <div class="email-reader-toolbar">
          <button class="hdr-btn" id="eback-${item.id}" style="font-size:.65rem;">← Back</button>
          <div class="spacer"></div>
          <button class="hdr-btn" id="ereply-${item.id}" style="font-size:.65rem;">↩ Reply</button>
          <button class="hdr-btn" id="edelete-${item.id}" style="font-size:.65rem;color:#f87171;">🗑</button>
        </div>
        <div class="email-reader-meta" id="emeta-${item.id}"></div>
        <div class="email-reader-body" id="ebody-${item.id}"></div>
      </div>

      <!-- ── Compose Panel ── -->
      <div class="email-panel" id="epanel-compose-${item.id}" style="display:none;">
        <div class="email-compose-form">
          <input class="email-input" id="eto-${item.id}" type="email" placeholder="To: recipient@example.com" />
          <input class="email-input" id="esubj-${item.id}" type="text" placeholder="Subject" />
          <textarea class="email-textarea" id="etextarea-${item.id}" placeholder="Write your message…"></textarea>
          <button class="hdr-btn email-send-btn" id="esend-${item.id}">Send ↑</button>
        </div>
      </div>

      <!-- ── Config Panel ── -->
      <div class="email-panel" id="epanel-config-${item.id}" style="display:none;">
        <div class="email-config-form">
          <div class="email-config-hint">
            💡 Gmail: use an <strong>App Password</strong> (Google Account → Security → App Passwords).<br>
            IMAP: <code>imap.gmail.com:993</code> · SMTP: <code>smtp.gmail.com:587</code>
          </div>
          <input class="email-input" id="ecfg-addr-${item.id}" type="email" placeholder="Email address" />
          <input class="email-input" id="ecfg-pw-${item.id}" type="password" placeholder="Password / App Password" />
          <div style="display:grid;grid-template-columns:1fr auto;gap:4px;align-items:center;">
            <input class="email-input" id="ecfg-imap-${item.id}" type="text" placeholder="IMAP host" value="imap.gmail.com" />
            <input class="email-input" id="ecfg-imap-port-${item.id}" type="number" placeholder="993" value="993" style="width:56px;" />
          </div>
          <div style="display:grid;grid-template-columns:1fr auto;gap:4px;align-items:center;">
            <input class="email-input" id="ecfg-smtp-${item.id}" type="text" placeholder="SMTP host" value="smtp.gmail.com" />
            <input class="email-input" id="ecfg-smtp-port-${item.id}" type="number" placeholder="587" value="587" style="width:56px;" />
          </div>
          <div id="ecfg-status-${item.id}" style="font-size:.65rem;min-height:14px;color:var(--primary);"></div>
          <button class="hdr-btn email-send-btn" id="ecfg-save-${item.id}">Save Settings</button>
        </div>
      </div>

    </div>
    <div class="mission-widget-resize-handle" data-widget-handle="misc-${esc(item.id)}" title="Resize tile"></div>
  `;

  // ── State ──
  let _emailPage = 1;
  let _emailTotal = 0;
  let _emailLimit = 20;
  let _activeTab = 'inbox';
  let _openUid = null;

  const $ = id => tile.querySelector(`#${id}`);

  function showTab(tab) {
    _activeTab = tab;
    ['inbox', 'reader', 'compose', 'config'].forEach(t => {
      const panel = $(`epanel-${t}-${item.id}`);
      if (panel) panel.style.display = t === tab ? 'flex' : 'none';
    });
    tile.querySelectorAll('.email-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.etab === tab);
    });
  }

  tile.querySelectorAll('.email-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.etab));
  });

  // ── Load config into form ──
  fetch('/api/email/config').then(r => r.json()).then(cfg => {
    if (cfg.email_address) $(`ecfg-addr-${item.id}`).value = cfg.email_address;
    if (cfg.imap_host) $(`ecfg-imap-${item.id}`).value = cfg.imap_host;
    if (cfg.imap_port) $(`ecfg-imap-port-${item.id}`).value = cfg.imap_port;
    if (cfg.smtp_host) $(`ecfg-smtp-${item.id}`).value = cfg.smtp_host;
    if (cfg.smtp_port) $(`ecfg-smtp-port-${item.id}`).value = cfg.smtp_port;
    if (!cfg.configured) showTab('config');
  }).catch(() => { });

  // ── Save config ──
  $(`ecfg-save-${item.id}`)?.addEventListener('click', async () => {
    const statusEl = $(`ecfg-status-${item.id}`);
    statusEl.textContent = 'Saving…';
    const body = {
      email_address: $(`ecfg-addr-${item.id}`).value.trim(),
      password: $(`ecfg-pw-${item.id}`).value,
      imap_host: $(`ecfg-imap-${item.id}`).value.trim(),
      imap_port: Number($(`ecfg-imap-port-${item.id}`).value) || 993,
      smtp_host: $(`ecfg-smtp-${item.id}`).value.trim(),
      smtp_port: Number($(`ecfg-smtp-port-${item.id}`).value) || 587,
    };
    try {
      const res = await fetch('/api/email/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.ok) {
        statusEl.style.color = '#34d399';
        statusEl.textContent = '✓ Saved! Click 📥 to load inbox.';
        $(`ecfg-pw-${item.id}`).value = '';
      } else {
        statusEl.style.color = '#f87171';
        statusEl.textContent = data.error || 'Save failed';
      }
    } catch (e) { statusEl.style.color = '#f87171'; statusEl.textContent = String(e); }
  });

  // ── Load inbox ──
  async function loadInbox(page = 1) {
    const listEl = $(`emsglist-${item.id}`);
    const statusEl = $(`estatus-${item.id}`);
    const pageEl = $(`epage-${item.id}`);
    listEl.innerHTML = `<div class="email-loading">Loading…</div>`;
    statusEl.textContent = '';
    try {
      const res = await fetch(`/api/email/inbox?page=${page}&limit=${_emailLimit}`);
      const data = await res.json();
      if (data.error) { listEl.innerHTML = `<div class="email-error">${esc(data.error)}</div>`; return; }
      _emailPage = page;
      _emailTotal = data.total || 0;
      const maxPage = Math.ceil(_emailTotal / _emailLimit) || 1;
      pageEl.textContent = `${page}/${maxPage}`;
      statusEl.textContent = `${_emailTotal} messages`;
      if (!data.messages?.length) { listEl.innerHTML = `<div class="email-empty">Inbox empty</div>`; return; }
      listEl.innerHTML = '';
      data.messages.forEach(m => {
        const row = document.createElement('div');
        row.className = 'email-msg-row';
        row.dataset.uid = m.uid;
        const fromShort = m.from.replace(/<.*?>/, '').trim().slice(0, 22) || m.from.slice(0, 22);
        const subjShort = (m.subject || '(no subject)').slice(0, 38);
        const dateShort = (m.date || '').replace(/\s+\+\d+/, '').replace(/\s+GMT/, '').trim().slice(0, 20);
        row.innerHTML = `
          <div class="email-row-from">${esc(fromShort)}</div>
          <div class="email-row-subject">${esc(subjShort)}</div>
          <div class="email-row-date">${esc(dateShort)}</div>
        `;
        row.addEventListener('click', () => openMessage(m.uid, m.subject, m.from));
        listEl.appendChild(row);
      });
    } catch (e) { listEl.innerHTML = `<div class="email-error">${esc(String(e))}</div>`; }
  }

  $(`erefresh-${item.id}`)?.addEventListener('click', () => loadInbox(_emailPage));
  $(`eprev-${item.id}`)?.addEventListener('click', () => { if (_emailPage > 1) loadInbox(_emailPage - 1); });
  $(`enext-${item.id}`)?.addEventListener('click', () => {
    const maxPage = Math.ceil(_emailTotal / _emailLimit) || 1;
    if (_emailPage < maxPage) loadInbox(_emailPage + 1);
  });

  // ── Open message ──
  async function openMessage(uid) {
    _openUid = uid;
    showTab('reader');
    const metaEl = $(`emeta-${item.id}`);
    const bodyEl = $(`ebody-${item.id}`);
    metaEl.innerHTML = `<div class="email-loading">Loading…</div>`;
    bodyEl.innerHTML = '';
    try {
      const res = await fetch(`/api/email/message?uid=${encodeURIComponent(uid)}`);
      const m = await res.json();
      if (m.error) { metaEl.innerHTML = `<div class="email-error">${esc(m.error)}</div>`; return; }
      metaEl.innerHTML = `
        <div class="email-meta-row"><span class="email-meta-label">From</span> ${esc(m.from)}</div>
        <div class="email-meta-row"><span class="email-meta-label">To</span> ${esc(m.to)}</div>
        <div class="email-meta-row"><span class="email-meta-label">Subject</span> <strong>${esc(m.subject)}</strong></div>
        <div class="email-meta-row" style="opacity:.5;font-size:.6rem;">${esc(m.date)}</div>
      `;
      bodyEl.textContent = m.body || '(empty)';

      // Pre-fill reply
      $(`ereply-${item.id}`)?.addEventListener('click', () => {
        $(`eto-${item.id}`).value = m.from.replace(/.*<(.+)>/, '$1') || m.from;
        $(`esubj-${item.id}`).value = m.subject.startsWith('Re:') ? m.subject : `Re: ${m.subject}`;
        $(`etextarea-${item.id}`).value = `\n\n--- Original ---\n${m.body?.slice(0, 500) || ''}`;
        showTab('compose');
      }, { once: true });
    } catch (e) { metaEl.innerHTML = `<div class="email-error">${esc(String(e))}</div>`; }
  }

  $(`eback-${item.id}`)?.addEventListener('click', () => showTab('inbox'));

  $(`edelete-${item.id}`)?.addEventListener('click', async () => {
    if (!_openUid || !confirm('Delete this email?')) return;
    await fetch('/api/email/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: _openUid, action: 'delete' }) });
    showTab('inbox');
    loadInbox(_emailPage);
    _openUid = null;
  });

  // ── Send email ──
  $(`esend-${item.id}`)?.addEventListener('click', async () => {
    const btn = $(`esend-${item.id}`);
    btn.textContent = 'Sending…'; btn.disabled = true;
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: $(`eto-${item.id}`).value.trim(),
          subject: $(`esubj-${item.id}`).value.trim(),
          body: $(`etextarea-${item.id}`).value.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Email sent!', 'success');
        $(`eto-${item.id}`).value = '';
        $(`esubj-${item.id}`).value = '';
        $(`etextarea-${item.id}`).value = '';
        showTab('inbox');
      } else {
        showToast(data.error || 'Send failed', 'error');
      }
    } catch (e) { showToast(String(e), 'error'); }
    btn.textContent = 'Send ↑'; btn.disabled = false;
  });
}

function renderMissionMiscTiles() {
  if (!missionWidgetGrid) return;
  document.querySelectorAll('.misc-tile-dynamic').forEach(el => el.remove());

  missionMiscTiles.forEach((item) => {
    const isProjectView = missionViewMode === 'project';
    if (isProjectView && item.project_id !== missionSelectedProjectId) return;
    if (!isProjectView && item.project_id) return;

    const tile = document.createElement('section');
    tile.className = 'mission-widget w-size-1x1 misc-tile-dynamic';
    tile.draggable = true;
    tile.dataset.widgetId = `misc-${item.id}`;

    if (item.type === 'packager') {
      const pOpts = missionProjects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
      tile.innerHTML =
        `<div class="mission-widget-header"><span style="color:#00ffff;">⚒ ${esc(item.title || 'App Compiler')}</span><div class="spacer"></div></div>` +
        `<div class="mission-widget-body" style="display:flex;flex-direction:column;gap:8px;flex:1;">` +
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
        const pName = missionProjects.find(p => p.id === pId)?.name || 'app';

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
          a.href = url; a.download = `${pName.replace(/\s+/g, '_')}.html`; a.click();
          URL.revokeObjectURL(url);
        } else if (fmt === 'python') {
          let pyFiles = files.filter(f => f.name.toLowerCase().endsWith('.py'));
          let mainPy = pyFiles.find(f => f.name.toLowerCase() === 'main.py' || f.name.toLowerCase() === 'app.py') || pyFiles[0];
          if (!mainPy) { showToast('No Python files found.', 'error'); return; }
          const blob = new Blob([mainPy.content], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `${pName.replace(/\s+/g, '_')}.py`; a.click();
          URL.revokeObjectURL(url);
        }
      });

    } else if (item.type === 'note') {
      const contentStr = String(item.content || '');
      tile.innerHTML =
        `<div class="mission-widget-header"><span>${esc(item.title || 'Misc Tile')}</span><div class="spacer"></div><button class="hdr-btn" data-misc-delete="${esc(item.id)}">✕</button></div>` +
        `<div class="mission-widget-body" style="display:flex;flex-direction:column;gap:8px;flex:1;">` +
        `<textarea data-misc-textarea="${item.id}" style="flex:1; border:none; resize:none; background:transparent; color:var(--text); font-family:inherit; font-size:.72rem; outline:none; white-space:pre-wrap;" placeholder="Type your note here...">${esc(contentStr)}</textarea>` +
        `<div style="display:flex;gap:6px;flex-wrap:wrap;">` +

        `</div>` +
        `</div>` +
        `<div class="mission-widget-resize-handle" data-widget-handle="misc-${esc(item.id)}" title="Resize tile"></div>`;

      tile.querySelector(`[data-misc-textarea="${item.id}"]`)?.addEventListener('input', (e) => {
        item.content = e.target.value;
        saveMissionMiscTiles(missionMiscTiles);
      });
    } else if (item.type === 'groupchat') {
      const projName = item.project_id
        ? (missionProjects.find(p => p.id === item.project_id)?.name || 'Project')
        : 'All agents';
      tile.className = 'mission-widget w-size-1x1 misc-tile-dynamic';
      tile.innerHTML =
        `<div class="mission-widget-header">` +
        `<span>💬 ${esc(item.title || 'Group Chat')}</span>` +
        `<div class="spacer"></div>` +
        `<span style="font-size:.6rem;color:var(--text-muted);">${esc(projName)}</span>` +
        `<button class="hdr-btn" data-misc-delete="${esc(item.id)}">✕</button>` +
        `</div>` +
        `<div class="mission-widget-body gchat-body">` +
        `<div class="gchat-messages" id="gchat-msgs-${esc(item.id)}">` +
        `<div class="gchat-empty">Use @AgentName or @all to chat with your agents.</div>` +
        `</div>` +
        `<div class="gchat-composer">` +
        `<div class="gchat-mention-list" id="gchat-ml-${esc(item.id)}"></div>` +
        `<div class="gchat-input-row">` +
        `<textarea class="gchat-input" id="gchat-in-${esc(item.id)}" placeholder="@AgentName or @all …" rows="1"></textarea>` +
        `<button class="gchat-send-btn" id="gchat-sb-${esc(item.id)}" title="Send">↑</button>` +
        `</div>` +
        `</div>` +
        `</div>` +
        `<div class="mission-widget-resize-handle" data-widget-handle="misc-${esc(item.id)}" title="Resize tile"></div>`;

      const msgEl = tile.querySelector(`#gchat-msgs-${item.id}`);
      const inEl = tile.querySelector(`#gchat-in-${item.id}`);
      const sbdEl = tile.querySelector(`#gchat-sb-${item.id}`);
      const mlEl = tile.querySelector(`#gchat-ml-${item.id}`);

      // Load & render persisted messages
      if (!item.messages) item.messages = [];
      item.messages.forEach(m => _gcRenderMsg(msgEl, m));

      const onSave = (msgs) => {
        item.messages = msgs.slice(-200);
        saveMissionMiscTiles(missionMiscTiles);
      };
      _gcSetupComposer(inEl, sbdEl, mlEl, msgEl, item.messages, item.project_id || null, onSave);
    } else if (item.type === 'email') {
      renderEmailTile(item, tile);
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
    show('groupchat', false);
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
    show('groupchat', true);
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

    const previewMeta = _getProjectPreviewEntry(missionSelectedProjectId);
    const previewContainer = document.getElementById('mission-project-preview');
    if (previewContainer) {
      const projFiles = _projectFiles(missionSelectedProjectId);
      const htmlProjFiles = projFiles.filter(f => /\.html?$/i.test(String(f.name || '')));

      // Build sandbox-style files array from project files
      const sbFilesFromProj = () => projFiles.map(f => ({
        path: String(f.name || ''),
        lang: inferLangFromPath(String(f.name || '')),
        code: String(f.content || ''),
      })).filter(f => f.path);

      // Open floating preview modal
      const openFloatPreview = (files, title) => {
        const modal = document.getElementById('sandbox-float-modal');
        const frame = document.getElementById('sandbox-float-frame');
        const titleEl = document.getElementById('sandbox-float-title');
        if (!modal || !frame) return;
        const rendered = buildSandboxPreviewHtml(files);
        frame.srcdoc = rendered;
        if (titleEl) titleEl.textContent = title || 'Live Preview';
        modal.style.display = 'flex';
      };

      if (htmlProjFiles.length) {
        // Render live interactive preview from project HTML files
        const previewFiles = sbFilesFromProj();
        const previewHtml = buildSandboxPreviewHtml(previewFiles);
        const tabOptions = htmlProjFiles.map(f => {
          const name = String(f.name || '');
          const sel = name.toLowerCase() === String(previewMeta.selected?.name || 'index.html').toLowerCase() ? 'selected' : '';
          return `<option value="${esc(name)}" ${sel}>${esc(name)}</option>`;
        }).join('');
        previewContainer.innerHTML = `
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;flex-shrink:0;">
              <span class="hdr-btn" style="pointer-events:none;opacity:.7;font-size:.65rem;">Live Preview</span>
              ${htmlProjFiles.length > 1 ? `<select id="mission-preview-file-select" class="hdr-btn" style="max-width:220px;font-size:.65rem;">${tabOptions}</select>
              <button id="mission-preview-apply" class="hdr-btn" type="button" style="font-size:.65rem;">Switch</button>` : ''}
              <button id="mission-preview-reload" class="hdr-btn" type="button" style="font-size:.65rem;">↻ Reload</button>
              <button id="mission-preview-open-sandbox" class="hdr-btn" type="button" style="font-size:.65rem;">⛶ Fullscreen</button>
            </div>
            <div style="flex:1;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:#fff;min-height:0;">
              <iframe id="mission-preview-iframe" style="width:100%;height:100%;border:none;display:block;"
                sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-modals"></iframe>
            </div>`;

        // Set srcdoc as a property (safer than embedding in attribute via innerHTML)
        const iframe = previewContainer.querySelector('#mission-preview-iframe');
        if (iframe) {
          iframe.srcdoc = previewHtml;
          iframe.addEventListener('load', () => { try { iframe.focus(); } catch (e) { } });
        }

        previewContainer.querySelector('#mission-preview-reload')?.addEventListener('click', () => {
          const fresh = buildSandboxPreviewHtml(sbFilesFromProj());
          if (iframe) iframe.srcdoc = fresh;
        });

        previewContainer.querySelector('#mission-preview-apply')?.addEventListener('click', () => {
          const sel = previewContainer.querySelector('#mission-preview-file-select');
          if (!sel) return;
          _setProjectPreviewEntry(missionSelectedProjectId, sel.value);
          renderMissionProjects();
        });

        previewContainer.querySelector('#mission-preview-open-sandbox')?.addEventListener('click', () => {
          const p = missionProjects.find(x => x.id === missionSelectedProjectId);
          openFloatPreview(sbFilesFromProj(), p?.name || 'Live Preview');
        });

      } else if (projFiles.length) {
        // Non-HTML: show code viewer with tabs + fullscreen button
        const firstFile = projFiles[0];
        const tabsHtml = projFiles.slice(0, 10).map((f, i) =>
          `<button class="hdr-btn mission-preview-tab" data-idx="${i}" style="font-size:.65rem;${i === 0 ? 'border-color:var(--primary);' : ''}">${esc(f.name)}</button>`
        ).join('');
        const codeHtml = esc(String(firstFile.content || ''));
        previewContainer.innerHTML =
          `<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;flex-shrink:0;">
              ${tabsHtml}
              <button id="mission-preview-open-sandbox" class="hdr-btn" type="button" style="margin-left:auto;font-size:.65rem;">⛶ Fullscreen</button>
            </div>
            <pre id="mission-preview-code" style="flex:1;overflow:auto;margin:0;padding:8px;font-size:.68rem;line-height:1.5;border:1px solid var(--border);border-radius:6px;background:var(--glass-1);white-space:pre-wrap;word-break:break-all;min-height:0;">${codeHtml}</pre>`;
        const codeEl = previewContainer.querySelector('#mission-preview-code');
        previewContainer.querySelectorAll('.mission-preview-tab').forEach(btn => {
          btn.addEventListener('click', () => {
            previewContainer.querySelectorAll('.mission-preview-tab').forEach(b => b.style.borderColor = '');
            btn.style.borderColor = 'var(--primary)';
            const f = projFiles[parseInt(btn.dataset.idx, 10)];
            if (codeEl && f) codeEl.textContent = String(f.content || '');
          });
        });
        previewContainer.querySelector('#mission-preview-open-sandbox')?.addEventListener('click', () => {
          const p = missionProjects.find(x => x.id === missionSelectedProjectId);
          openFloatPreview(sbFilesFromProj(), p?.name || 'Sandbox');
        });
      } else {
        previewContainer.innerHTML = `
          <div class="project-empty-state" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:32px 16px; border:1px dashed var(--glass-border); border-radius:12px; background:rgba(255,255,255,0.015); backdrop-filter:blur(4px); margin:4px; text-align:center;">
            <div class="empty-state-logo-wrap" style="position:relative; display:flex; align-items:center; justify-content:center; width:72px; height:72px; margin-bottom:16px;">
              <div style="position:absolute; width:100%; height:100%; border-radius:50%; background:var(--primary-glow); filter:blur(16px); opacity:0.3; animation:pulseGlow 3s ease-in-out infinite alternate;"></div>
              <svg class="empty-state-logo" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--primary); filter: drop-shadow(0 0 12px var(--primary-glow)); animation:floatLogo 4s ease-in-out infinite;">
                <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" />
              </svg>
            </div>
            <h4 style="margin:0 0 6px 0; font-size:1.05rem; font-weight:600; color:var(--text); letter-spacing:0.02em;">${esc(p?.name || 'Untitled Project')}</h4>
            <p style="margin:0; font-size:0.72rem; color:var(--text-muted); max-width:280px; line-height:1.45;">No active code generated yet. Instruct your agents in chat to begin building features.</p>
          </div>
        `;
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
      `<textarea data-agent-cmd="${esc(agent.id)}" placeholder="Command this agent..." style="margin-top:6px;width:100%;min-height:56px;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.95rem;font-family:inherit;"></textarea>` +
      `<div data-agent-sending="${esc(agent.id)}" style="display:none;align-items:center;gap:5px;font-size:.66rem;opacity:.9;margin-top:6px;">` +
      `<span>Sending</span>` +
      `<div class="agent-typing-dots" style="display:flex;gap:5px;align-items:center;padding:2px 0;">` +
      `<span style="width:7px;height:7px;border-radius:50%;background:var(--primary);opacity:.9;animation:agentDotBounce .9s infinite ease-in-out;animation-delay:0s;"></span>` +
      `<span style="width:7px;height:7px;border-radius:50%;background:var(--primary);opacity:.9;animation:agentDotBounce .9s infinite ease-in-out;animation-delay:.18s;"></span>` +
      `<span style="width:7px;height:7px;border-radius:50%;background:var(--primary);opacity:.9;animation:agentDotBounce .9s infinite ease-in-out;animation-delay:.36s;"></span>` +
      `</div>` +
      `</div>` +
      `<div style="display:flex;gap:6px;margin-top:6px;">` +
      `<button class="hdr-btn" data-agent-send="${esc(agent.id)}">Send</button>` +
      `<button class="hdr-btn" data-agent-open="${esc(agent.id)}">Open Chat</button>` +
      `<button class="hdr-btn" data-agent-edit="${esc(agent.id)}">Edit</button>` +
      `<button class="hdr-btn" data-agent-delete="${esc(agent.id)}">Delete</button>` +
      `</div>`;

    card.querySelector(`[data-agent-project="${agent.id}"]`)?.addEventListener('change', (e) => {
      agent.project_id = String(e.target?.value || '').trim();
      saveMissionAgents(missionAgents);
      _syncAgentProjectLink(agent);
      renderMissionProjects();
      renderMissionProjectTiles();
      if (missionViewMode === 'hub') renderMissionAgentTiles('');
      showToast('Agent project updated.', 'success', 1200);
    });

    card.querySelector('[data-agent-send]')?.addEventListener('click', async () => {
      const input = card.querySelector(`[data-agent-cmd="${agent.id}"]`);
      const cmd = input?.value || '';
      if (!String(cmd || '').trim()) return;
      if (input) input.value = '';
      const sendBtn = card.querySelector('[data-agent-send]');
      const sendingEl = card.querySelector(`[data-agent-sending="${agent.id}"]`);
      const originalLabel = sendBtn?.textContent || 'Send';
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';
        sendBtn.style.display = 'none';
      }
      if (sendingEl) sendingEl.style.display = 'flex';
      try {
        await sendCommandToAgent(agent, cmd);
      } finally {
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.textContent = originalLabel;
          sendBtn.style.display = '';
        }
        if (sendingEl) sendingEl.style.display = 'none';
      }
    });

    card.querySelector('[data-agent-open]')?.addEventListener('click', () => {
      store.currentId = agent.chat_id;
      saveStore(store);
      localStorage.setItem('vibe_current_view', 'chat');
      window.location.reload();
    });

    card.querySelector('[data-agent-edit]')?.addEventListener('click', () => {
      openAgentConfigModal(agent.id, missionSelectedProjectId);
    });

    card.querySelector('[data-agent-delete]')?.addEventListener('click', () => {
      deleteMissionAgent(agent.id);
    });

    card.addEventListener('click', (e) => {
      if (e.target.closest('textarea') || e.target.closest('[data-agent-send]') || e.target.closest('[data-agent-open]') || e.target.closest('[data-agent-edit]') || e.target.closest('[data-agent-delete]') || e.target.closest('[data-agent-project]')) return;
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
    const lastReplySnippet = lastReply || 'No AI reply yet.';

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
      `<button class="hdr-btn" data-agent-open="${esc(agent.id)}">Chat</button>`,
      `<button class="hdr-btn" data-agent-schedule="${esc(agent.id)}">Schedule</button>`,
      `<button class="hdr-btn" data-agent-edit="${esc(agent.id)}">Edit</button>`,
      `<button class="hdr-btn" data-agent-add-context="${esc(agent.id)}" title="Add File/URL to Context" style="font-weight:bold;">+</button>`,
      `<button class="hdr-btn" data-agent-delete="${esc(agent.id)}">Delete</button>`,
    ].filter(Boolean);

    const allModels = Array.from(document.querySelectorAll('#model-select option')).map(o => ({
      value: o.value,
      text: o.textContent.replace('✓ ', '').trim()
    })) || [{ value: 'gemini-2.5-pro', text: 'gemini-2.5-pro' }];
    const defaultAgentModel = agent.model || document.getElementById('model-select')?.value || allModels[0].value || '';

    const modelOpts = allModels.map(m =>
      `<option value="${esc(m.value)}" ${m.value === defaultAgentModel ? 'selected' : ''}>${esc(m.text)}</option>`
    ).join('');

    const modeOpts = `
        <option value="direct" ${agent.mode === 'direct' ? 'selected' : ''}>Direct</option>
        <option value="reasoning_fast" ${agent.mode === 'reasoning_fast' ? 'selected' : ''}>Fast Reasoning</option>
        <option value="reasoning" ${agent.mode === 'reasoning' ? 'selected' : ''}>Reasoning</option>
        <option value="swarm" ${agent.mode === 'swarm' ? 'selected' : ''}>Swarm (3-stage)</option>
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
      `<div style="font-size:.75rem;opacity:.86;">Last AI reply</div>` +
      `<div class="msg-text agent-tile-msg" style="font-size:0.85rem;flex-grow:1;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px;background:var(--bg);">${formatChatText(lastReplySnippet)}</div>` +
      `<div data-agent-sending="${esc(agent.id)}" style="display:${globalThinkingAgents.has(agent.id) ? 'flex' : 'none'};align-items:center;gap:5px;font-size:.66rem;opacity:.9;">` +
      `<span>Sending</span>` +
      `<div class="agent-typing-dots" style="display:flex;gap:5px;align-items:center;padding:2px 0;">` +
      `<span style="width:7px;height:7px;border-radius:50%;background:var(--primary);opacity:.9;animation:agentDotBounce .9s infinite ease-in-out;animation-delay:0s;"></span>` +
      `<span style="width:7px;height:7px;border-radius:50%;background:var(--primary);opacity:.9;animation:agentDotBounce .9s infinite ease-in-out;animation-delay:.18s;"></span>` +
      `<span style="width:7px;height:7px;border-radius:50%;background:var(--primary);opacity:.9;animation:agentDotBounce .9s infinite ease-in-out;animation-delay:.36s;"></span>` +
      `</div>` +
      `</div>` +
      `<div class="agent-compose">` +
      `<textarea data-agent-cmd="${esc(agent.id)}" placeholder="Command this agent..." style="width:100%;min-height:62px;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.95rem;font-family:inherit;"></textarea>` +
      `<button class="hdr-btn agent-send-inside" data-agent-send="${esc(agent.id)}">Send</button>` +
      `</div>` +
      `<div class="agent-actions-row" style="--agent-action-cols:${actionButtons.length};">${actionButtons.join('')}</div>` +
      `</div>` +
      `<div class="mission-widget-resize-handle" data-widget-handle="agent-${esc(agent.id)}" title="Resize tile"></div>`;

    tile.querySelector('[data-agent-send]')?.addEventListener('click', async () => {
      const input = tile.querySelector(`[data-agent-cmd="${agent.id}"]`);
      const cmd = input?.value || '';
      if (!String(cmd || '').trim()) return;
      if (input) input.value = '';
      setAgentThinkingState(agent.id, true);
      try {
        await sendCommandToAgent(agent, cmd);
      } finally {
        setAgentThinkingState(agent.id, false);
      }
    });
    tile.querySelector('[data-agent-open]')?.addEventListener('click', () => {
      localStorage.setItem('vibe_current_view', 'chat');
      switchChat(agent.chat_id);
      renderWelcomeState();
      const mainEl = document.getElementById('main');
      if (mainEl) mainEl.style.display = '';
      const missionControl = document.getElementById('mission-control-view');
      if (missionControl) missionControl.classList.remove('open');
      document.body.classList.remove('mission-open');
    });
    tile.querySelector('[data-agent-schedule]')?.addEventListener('click', () => {
      setMissionView('hub');
      if (missionEventForm) missionEventForm.style.display = 'flex';
      if (missionSchedTargetAgent) missionSchedTargetAgent.value = agent.name || '';
      if (missionSchedMessage) missionSchedMessage.value = agent.instructions || '';
      if (missionEventSources) missionEventSources.value = (agent.sources || []).join('\n');
      renderMissionProjects();
    });
    let pendingSelection = null;

    tile.querySelector('[data-agent-add-context]')?.addEventListener('click', async () => {
      const c = await showCustomPrompt("Add Context (Enter URL or 'FILE')");
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
    tile.querySelector(`[data-agent-project="${agent.id}"]`)?.addEventListener('change', (e) => {
      agent.project_id = String(e.target?.value || '').trim();
      saveMissionAgents(missionAgents);
      _syncAgentProjectLink(agent);
      renderMissionProjects();
      renderMissionProjectTiles();
      if (missionViewMode === 'hub') {
        renderMissionAgentTiles('');
      } else {
        renderMissionAgentTiles(missionSelectedProjectId);
      }
      showToast('Agent project updated.', 'success', 1200);
    });
    tile.querySelector(`[data-agent-tile-model="${agent.id}"]`)?.addEventListener('change', (e) => {
      agent.model = e.target.value;
      saveMissionAgents(missionAgents);
    });
    tile.querySelector(`[data-agent-tile-mode="${agent.id}"]`)?.addEventListener('change', (e) => {
      agent.mode = e.target.value;
      saveMissionAgents(missionAgents);
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
    const projectAgents = missionAgents.filter(a => String(a.project_id || '') === p.id);
    const agentCount = projectAgents.length;

    const agentsListHtml = projectAgents.length > 0
      ? `<div style="display:flex; flex-wrap:wrap; gap:4px; max-height: 48px; overflow-y: auto; margin-top:2px; margin-bottom:2px;">` +
      projectAgents.map(a => `<div style="background:rgba(167,139,250,0.1); border:1px solid rgba(167,139,250,0.3); padding:2px 6px; border-radius:4px; font-size:0.55rem; display:flex; align-items:center; gap:4px; white-space:nowrap; text-overflow:ellipsis; overflow:hidden; max-width:100%;">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            ${esc(a.name || 'Agent')}
          </div>`).join('') +
      `</div>`
      : `<div style="font-size:0.6rem; opacity:0.6; margin-top:2px;">No agents</div>`;

    const previewMeta = _getProjectPreviewEntry(p.id);
    let previewHtml = '';
    if (previewMeta.selected && previewMeta.selected.content) {
      const injectedStyles = `<style>
          ::-webkit-scrollbar { width: 5px; height: 5px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: var(--primary-glow, #a78bfa); border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: var(--primary, #8b5cf6); }
        </style>`;
      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(injectedStyles + previewMeta.selected.content);
      previewHtml = `<div style="flex-grow:1;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:#fff;margin-top:2px;">
                        <iframe style="width:100%;height:100%;border:none;pointer-events:none;" src="${dataUrl}"></iframe>
                       </div>`;
    } else {
      previewHtml = `
        <div style="flex-grow:1; border:1px dashed var(--glass-border); border-radius:6px; margin-top:2px; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px; background:rgba(255,255,255,0.01); text-align:center; gap:4px; min-height:80px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--primary); opacity:0.8; display:inline-block; filter: drop-shadow(0 0 6px var(--primary-glow)); animation:floatLogo 4s ease-in-out infinite;">
            <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" />
          </svg>
          <div style="font-size:0.75rem; font-weight:600; color:var(--text); opacity:0.9;">${esc(p.name)}</div>
          <div style="font-size:0.58rem; color:var(--text-muted); line-height:1.3;">No code active yet</div>
        </div>
      `;
    }

    tile.innerHTML =
      `<div class="mission-widget-header"><span>${esc(p.name || 'Untitled Project')}</span><div class="spacer"></div></div>` +
      `<div class="mission-widget-body" style="display:flex;flex-direction:column;gap:8px;flex-grow:1;height:100%; overflow:hidden;">` +
      agentsListHtml +
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

function isMissionOpen() {
  return document.body.classList.contains('mission-open');
}

function openMissionPage() {
  if (!missionPage || !chatPane || !sandboxPane) return;
  document.body.classList.add('mission-open');
  localStorage.setItem('vibe_current_view', 'mission');
  missionPage.style.display = 'block';
  chatPane.style.display = 'none';
  sandboxPane.classList.remove('open');
  sandboxPane.style.display = 'none';
  document.querySelectorAll('#agent-chat-modal, #agent-chat-preview-modal').forEach(m => m.classList.remove('open'));
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
  renderHistory();
  updateCurrentAgentChatControls();
  loadScheduledActions();
}

function closeMissionPage() {
  if (!missionPage || !chatPane || !sandboxPane) return;
  document.body.classList.remove('mission-open');
  localStorage.setItem('vibe_current_view', 'chat');
  missionPage.style.display = 'none';
  chatPane.style.display = '';
  sandboxPane.style.display = '';
  agentChatPreviewModal?.classList.remove('open');
  renderHistory();
  updateCurrentAgentChatControls();
}

// Sidebar controls
const sidebar = document.getElementById('sidebar');
const menuBtn = document.getElementById('menu-btn');
const newChatSidebar = document.getElementById('new-chat-sidebar');
const missionBtnSidebar = document.getElementById('mission-btn-sidebar');

menuBtn?.addEventListener('click', () => {
  if (!sidebar) return;
  sidebar.classList.toggle('open');
  const mainEl = document.getElementById('main');
  const isOpen = sidebar.classList.contains('open');
  mainEl?.classList.toggle('sidebar-open', isOpen);
  document.body.classList.toggle('sidebar-open', isOpen);
});
newChatSidebar?.addEventListener('click', startNewChat);
missionBtnSidebar?.addEventListener('click', openMissionPage);

// Hot-edge trigger: hovering within 4px of the left screen edge opens the sidebar.
// Works in both fullscreen and near-maximised windows.
let lastEdgeTriggerTime = 0;
window.addEventListener('mousemove', (e) => {
  // Check if mouse is at the very left edge (clientX <= 4px)
  if (e.clientX <= 4) {
    const now = Date.now();
    // 1-second cooldown to avoid rapid re-triggering
    if (now - lastEdgeTriggerTime > 1000) {
      lastEdgeTriggerTime = now;
      if (sidebar && !sidebar.classList.contains('open')) {
        sidebar.classList.add('open');
        document.getElementById('main')?.classList.add('sidebar-open');
        document.body.classList.add('sidebar-open');
      }
    }
  }
  
  // Right edge trigger for Sandbox
  if (e.clientX >= window.innerWidth - 4) {
    const now = Date.now();
    if (now - lastEdgeTriggerTime > 1000) {
      if (sandboxPane && !sandboxPane.classList.contains('open') && sandboxPane.style.display !== 'none') {
        lastEdgeTriggerTime = now;
        sandboxPane.style.display = '';
        void sandboxPane.offsetWidth;
        sandboxPane.classList.add('hover-open');
      }
    }
  }
});
// Auto-dismiss sidebar when mouse moves far from the left edge
window.addEventListener('mousemove', (e) => {
  if (e.clientX > 280 && sidebar?.classList.contains('open') && lastEdgeTriggerTime > 0) {
    // Only auto-dismiss if it was opened by edge (tracked by lastEdgeTriggerTime being recent)
    const since = Date.now() - lastEdgeTriggerTime;
    // Dismiss after the mouse leaves and at least 400ms passed since opening
    if (since > 400) {
      sidebar.classList.remove('open');
      document.getElementById('main')?.classList.remove('sidebar-open');
      document.body.classList.remove('sidebar-open');
      lastEdgeTriggerTime = 0;
    }
  }
});

const chatBox = document.getElementById('chat-box');
const chatPane = document.getElementById('chat-pane');
const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');

// ── Restore Chat on Load ──────────────────────────────────────────────
window.addEventListener('load', () => {
  // Open settings only when no provider key exists at all.
  if (!hasAnyApiKey()) {
    openSettings();
  }

  refreshModelOptionMeta();
  refreshProfilePanel();

  renderHistory();
  // Wait a tick for DOM
  setTimeout(() => {
    if (sessionMessages && sessionMessages.length > 0) {
      sessionMessages.forEach(m => {
        if (m.role === 'user') {
          addUserMsg(m.content, false);
        } else {
          addAssistantMsg(m.content, m.classification, m.traces, false, m.web_sources || []);
        }
      });
    }
  }, 50);

  const savedView = localStorage.getItem('vibe_current_view') || 'mission';
  if (savedView === 'mission') {
    openMissionPage();
  } else {
    closeMissionPage();
  }
  updateCurrentAgentChatControls();
  const pendingAgentContext = sessionStorage.getItem('vibe_open_agent_context_after_load');
  if (pendingAgentContext && pendingAgentContext === store.currentId) {
    sessionStorage.removeItem('vibe_open_agent_context_after_load');
    setTimeout(openCurrentAgentContext, 80);
  }

  // ── Agent Extreme Mode: init from saved state ──
  setAgentExtremeMode(isAgentExtremeMode());
  setPulseLoopMode(isPulseLoopMode());

  // Toggle listener
  const agentExtremeToggleEl = document.getElementById('agent-extreme-toggle');
  agentExtremeToggleEl?.addEventListener('change', () => {
    setAgentExtremeMode(agentExtremeToggleEl.checked);
  });

  // Save selected extreme workflow when it changes
  document.getElementById('extreme-mode-select')?.addEventListener('change', (e) => {
    localStorage.setItem('vibe_extreme_last_mode', e.target.value);
    
    // Check if mode has Pulse Loop enabled
    const customMode = getCustomModeById(e.target.value);
    setPulseLoopMode(customMode && customMode.usePulseLoop);
    
    // Lock Model Select if mode has per-step models
    const modelSelect = document.getElementById('model-select');
    if (modelSelect) {
      const wrapper = modelSelect.closest('.custom-select');
      const lockIcon = wrapper ? wrapper.querySelector('.lock-overlay') : null;
      const btn = wrapper ? wrapper.querySelector('.custom-select-btn') : null;
      if (customMode && customMode.usePerStepModels) {
        modelSelect.disabled = true;
        // Do NOT set opacity on the native select, it causes the native chevron to bleed through!
        modelSelect.style.opacity = '0';
        if (btn) btn.style.opacity = '0.5';
        if (wrapper) wrapper.title = '🔒 Model selection is locked by the Custom Mode per-step configuration.';
        if (lockIcon) lockIcon.style.display = 'block';
      } else {
        modelSelect.disabled = false;
        modelSelect.style.opacity = '0'; // Keep native select hidden
        if (btn) btn.style.opacity = '1';
        if (wrapper) wrapper.title = 'Model';
        if (lockIcon) lockIcon.style.display = 'none';
      }
    }
    
    const legacySelect = document.getElementById('chat-mode');
    if (legacySelect) {
      legacySelect.value = e.target.value;
      legacySelect.dispatchEvent(new Event('change'));
    }
  });

  // Initial trigger for lock
  document.getElementById('extreme-mode-select')?.dispatchEvent(new Event('change'));
});

const sendBtn = document.getElementById('send-btn');
const webUrlInput = document.getElementById('web-url-input');
const webAutoToggle = document.getElementById('web-auto-toggle');
const agentWebAutoToggle = document.getElementById('agent-web-auto-toggle');
const webUrlToggle = document.getElementById('web-url-toggle');
const webUrlWrap = document.getElementById('web-url-wrap');
const chatAgentContextToggle = document.getElementById('chat-agent-context-toggle');
const chatAgentContextModal = document.getElementById('chat-agent-context-modal');
const chatAgentContextTitle = document.getElementById('chat-agent-context-title');
const chatAgentContextClose = document.getElementById('chat-agent-context-close');
const chatAgentContextBody = document.getElementById('chat-agent-context-body');
const killSwitchBtn = document.getElementById('kill-switch-btn');
const resetBtn = document.getElementById('reset-btn');
const sandboxBtn = document.getElementById('toggle-sandbox');
const modeSelect = document.getElementById('chat-mode');
const modelSelect = document.getElementById('model-select');
const projectsBtn = document.getElementById('projects-btn');
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
const missionTilePlus = document.getElementById('mission-tile-plus');
const missionTileAddProject = document.getElementById('mission-tile-add-project');
const missionTileAddAgent = document.getElementById('mission-tile-add-agent');
const missionGridContextMenu = document.getElementById('mission-grid-context-menu');
const missionContextAddManager = document.getElementById('mission-context-add-manager');
const missionContextAddSwarm = document.getElementById('mission-context-add-swarm');
const missionContextAddProject = document.getElementById('mission-context-add-project');
const missionContextAddAgent = document.getElementById('mission-context-add-agent');
const missionContextAddMiscNote = document.getElementById('mission-context-add-misc-note');
const missionContextAddMiscPackager = document.getElementById('mission-context-add-misc-packager');
const missionContextAddGroupChat = document.getElementById('mission-context-add-groupchat');
const missionContextAddEmail = document.getElementById('mission-context-add-email');
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
const agentChatContextToggle = document.getElementById('agent-chat-context-toggle');
const agentChatContextClose = document.getElementById('agent-chat-context-close');
const agentChatMessages = document.getElementById('agent-chat-messages');
const agentChatInput = document.getElementById('agent-chat-input');
const agentChatSend = document.getElementById('agent-chat-send');
const agentChatContext = document.getElementById('agent-chat-context');
const agentChatPreviewModal = document.getElementById('agent-chat-preview-modal');
const agentChatPreviewTitle = document.getElementById('agent-chat-preview-title');
const agentChatPreviewPath = document.getElementById('agent-chat-preview-path');
const agentChatPreviewClose = document.getElementById('agent-chat-preview-close');
const agentChatPreviewExpand = document.getElementById('agent-chat-preview-expand');
const agentChatPreviewContext = document.getElementById('agent-chat-preview-context');
const agentChatPreviewMessages = document.getElementById('agent-chat-preview-messages');
const agentChatPreviewInput = document.getElementById('agent-chat-preview-input');
const agentChatPreviewSend = document.getElementById('agent-chat-preview-send');

function updateCurrentAgentChatControls() {
  const agent = _agentForSession();
  const inMainChat = !document.body.classList.contains('mission-open');
  if (chatAgentContextToggle) {
    chatAgentContextToggle.style.display = agent && inMainChat ? '' : 'none';
    chatAgentContextToggle.title = agent ? `View context for ${agent.name || 'Agent'}` : 'View this agent context';
  }
  // Keep main chat selectors in sync with the currently linked agent session.
  if (agent && inMainChat) {
    const agentMode = String(agent.mode || '').trim();
    const agentModel = String(agent.model || '').trim();
    if (modeSelect && agentMode && modeSelect.value !== agentMode) {
      modeSelect.value = agentMode;
      setMode(agentMode);
    }
    if (modelSelect && agentModel && modelSelect.value !== agentModel) {
      modelSelect.value = agentModel;
      setSelectedModel(agentModel);
    }
    refreshModelOptionMeta?.();
  }
}

function saveAgentContextFrom(container, agent) {
  if (!container || !agent) return;
  const ins = container.querySelector('[data-agent-edit-instructions]');
  const src = container.querySelector('[data-agent-edit-sources]');
  const mem = container.querySelector('[data-agent-edit-memory]');
  agent.instructions = String(ins?.value || '').slice(0, 1200);
  agent.sources = String(src?.value || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 24);
  agent.memory_notes = String(mem?.value || '').slice(0, 12000);
  saveMissionAgents(missionAgents);
}

function openCurrentAgentContext() {
  const agent = _agentForSession();
  if (!agent) {
    showToast('This chat is not linked to an agent.', 'error');
    return;
  }
  missionOpenAgentId = agent.id;
  if (chatAgentContextTitle) {
    chatAgentContextTitle.textContent = `${agent.name || 'Agent'} Context`;
  }
  renderAgentContextPanel(agent, _sessionSummaryForAgent(agent), chatAgentContextBody);
  chatAgentContextModal?.classList.add('open');
}
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
const memoryBtn = document.getElementById('memory-btn');
const memoryModal = document.getElementById('memory-modal');
const memoryClose = document.getElementById('memory-close');
const memoryContent = document.getElementById('memory-content');
const thinkBar = document.getElementById('thinking-bar');
const sandboxPane = document.getElementById('sandbox-pane');
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
const profileBtn = document.getElementById('profile-btn');
const profileModal = document.getElementById('profile-modal');
const profileClose = document.getElementById('profile-close');
const profileStatus = document.getElementById('profile-status');
const profileUsername = document.getElementById('profile-username');
const profileEmail = document.getElementById('profile-email');
const profileCreated = document.getElementById('profile-created');
const profileApiKey = document.getElementById('profile-api-key');
const profileSignIn = document.getElementById('profile-signin');
const profileCopyApiKey = document.getElementById('profile-copy-api-key');
const profileLogout = document.getElementById('profile-logout');
const settingsBtn = document.getElementById('settings-btn');
const upLevelBtn = document.getElementById('up-level-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsClose = document.getElementById('settings-close');
const viewportModeSelect = document.getElementById('viewport-mode-select');
const styles = document.querySelectorAll('.style-opt');
const colors = document.querySelectorAll('.color-opt');

function syncWebAutoButton() {
  const on = getWebAutoSearch();
  const apply = (btn) => {
    if (!btn) return;
    btn.classList.toggle('active', on);
    btn.textContent = '🌐';
    btn.title = on
      ? 'Auto web lookup is enabled'
      : 'Auto web lookup is disabled';
  };
  apply(webAutoToggle);
  apply(agentWebAutoToggle);
}

function syncMissionButton() {
  if (!missionBtn) return;
  missionBtn.style.display = 'inline-flex';
}

function applySavedModelSelection() {
  if (!modelSelect) return;
  if (!localStorage.getItem('vibe_v2_deepseek_default')) {
    localStorage.setItem(KEY_MODEL, 'deepseek-ai/DeepSeek-V4-Pro:cheapest');
    localStorage.setItem('vibe_v2_deepseek_default', '1');
  }
  let saved = getSelectedModel().trim();
  if (saved) saved = saved.split(':')[0];
  const exists = saved && Array.from(modelSelect.options || []).some(o => o.value === saved);
  if (exists) {
    modelSelect.value = saved;
    return;
  }
  setSelectedModel(modelSelect.value || '');
}

function openSettings() { settingsModal?.classList.add('open'); }
function closeSettings() { settingsModal?.classList.remove('open'); }
function _maskApiKey(v = '') {
  const raw = String(v || '').trim();
  if (!raw) return '—';
  if (raw.length <= 10) return raw;
  return `${raw.slice(0, 6)}…${raw.slice(-4)}`;
}
async function refreshProfilePanel() {
  if (!profileStatus) return;
  profileStatus.textContent = 'Loading profile...';
  try {
    const res = await fetch('/auth/me');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.authenticated || !data?.user) {
      profileStatus.textContent = 'Guest mode active. Sign in to sync your account data.';
      if (profileUsername) profileUsername.textContent = 'Guest';
      if (profileEmail) profileEmail.textContent = '—';
      if (profileCreated) profileCreated.textContent = '—';
      if (profileApiKey) profileApiKey.textContent = '—';
      if (profileSignIn) profileSignIn.style.display = '';
      if (profileLogout) profileLogout.style.display = 'none';
      if (profileCopyApiKey) profileCopyApiKey.style.display = 'none';
      return;
    }
    const user = data.user;
    profileStatus.textContent = 'Signed in';
    if (profileUsername) profileUsername.textContent = String(user.username || '—');
    if (profileEmail) profileEmail.textContent = String(user.email || '—');
    if (profileCreated) profileCreated.textContent = user.created_at ? new Date(user.created_at).toLocaleString() : '—';
    if (profileApiKey) profileApiKey.textContent = _maskApiKey(user.api_key || '');
    if (profileSignIn) profileSignIn.style.display = 'none';
    if (profileLogout) profileLogout.style.display = '';
    if (profileCopyApiKey) {
      profileCopyApiKey.style.display = '';
      profileCopyApiKey.dataset.fullApiKey = String(user.api_key || '');
    }
  } catch (_) {
    profileStatus.textContent = 'Unable to load profile right now.';
  }
}
function openProfile() {
  profileModal?.classList.add('open');
  refreshProfilePanel();
}
function closeProfile() { profileModal?.classList.remove('open'); }
function navigateUpOneLevel() {
  const previewOpen = !!agentChatPreviewModal?.classList.contains('open');
  const agentOpen = !!agentChatModal?.classList.contains('open');
  
  if (previewOpen || agentOpen) {
    const aid = missionOpenAgentId;
    const agent = (missionAgents || []).find(a => a.id === aid) || null;
    if (previewOpen) closeAgentChatPreviewModal();
    if (agentOpen) closeAgentChatModal();
    if (!document.body.classList.contains('mission-open')) openMissionPage();
    if (agent?.project_id) {
      missionSelectedProjectId = agent.project_id;
      setMissionView('project', agent.project_id);
    } else {
      setMissionView('hub');
    }
    renderMissionProjects();
    return;
  }
  
  if (document.body.classList.contains('mission-open')) {
    if (missionViewMode === 'project') {
      setMissionView('hub');
      renderMissionProjects();
      return;
    }
    showToast('Already at top level.', 'info', 1100);
    return;
  }

  // Not in a modal, not in mission view. Check if current chat is an agent.
  const currentAgent = _agentForSession();
  openMissionPage();
  if (currentAgent && currentAgent.project_id) {
    missionSelectedProjectId = currentAgent.project_id;
    setMissionView('project', currentAgent.project_id);
  } else {
    setMissionView('hub');
  }
  renderMissionProjects();
}
function setStyle(s) {
  document.body.dataset.theme = s;
  styles.forEach(opt => opt.classList.toggle('active', opt.dataset.style === s));
  localStorage.setItem('vibe_style', s);
}
function setColor(c) {
  document.body.dataset.color = c;
  colors.forEach(opt => opt.classList.toggle('active', opt.dataset.color === c));
  localStorage.setItem('vibe_color', c);
}
function setTheme(t) {
  const mapping = {
    'default': { style: 'glass', color: 'midnight-red' },
    'midnight': { style: 'glass', color: 'deep-purple' },
    'light': { style: 'glass', color: 'clean-light' },
    'minimal': { style: 'minimal', color: 'clean-light' },
    'cyberpunk': { style: 'glass', color: 'cyberpunk' },
    'forest': { style: 'neo', color: 'forest-sage' },
    'claymorphism': { style: 'clay', color: 'clean-light' },
    'claymorphism-red': { style: 'clay', color: 'clay-crimson' },
    'crimson-black': { style: 'glass', color: 'crimson-black' },
    'aurora': { style: 'glass', color: 'aurora-glass' },
    'sunset-neon': { style: 'glass', color: 'sunset-neon' }
  };
  const mapped = mapping[t] || mapping['default'];
  setStyle(mapped.style);
  setColor(mapped.color);
  localStorage.setItem('vibe_theme', t);
}

/* ── Custom glass dropdowns ────────────────────────────────── */
function buildCustomSelects() {
  const ids = ['extreme-mode-select', 'model-select'];
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
    icon.textContent = (id === 'chat-mode' || id === 'extreme-mode-select') ? '🧠' : '⚙️';
    wrapper.classList.add('icon-only');

    btn.appendChild(icon);
    btn.appendChild(lbl);
    btn.appendChild(chev);
    wrapper.appendChild(btn);

    // Floating panel
    const panel = document.createElement('div');
    panel.className = 'custom-select-panel';
    wrapper.appendChild(panel);

    // Add a visual lock icon overlay
    if (id === 'model-select') {
      const modelSelectWrapper = wrapper;
      const lock = document.createElement('div');
      lock.className = 'lock-overlay';
      lock.innerHTML = '🔒';
      lock.style.position = 'absolute';
      lock.style.top = '-4px';
      lock.style.right = '-4px';
      lock.style.fontSize = '10px';
      lock.style.zIndex = '10';
      lock.style.display = 'none'; // Hidden by default
      modelSelectWrapper.appendChild(lock);
    }

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
      if (sel.disabled) return;
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

profileBtn?.addEventListener('click', openProfile);
profileClose?.addEventListener('click', closeProfile);
profileModal?.addEventListener('click', (e) => { if (e.target === profileModal) closeProfile(); });
profileCopyApiKey?.addEventListener('click', async () => {
  const full = String(profileCopyApiKey.dataset.fullApiKey || '').trim();
  if (!full) {
    showToast('No API key available to copy.', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(full);
    showToast('API key copied to clipboard.', 'success');
  } catch (_) {
    showToast('Could not copy API key.', 'error');
  }
});
profileLogout?.addEventListener('click', async () => {
  try {
    await fetch('/auth/logout', { method: 'POST' });
  } catch (_) { }
  window.location.href = '/login';
});
profileSignIn?.addEventListener('click', () => {
  window.location.href = '/login';
});
upLevelBtn?.addEventListener('click', navigateUpOneLevel);

settingsBtn?.addEventListener('click', openSettings);
settingsClose?.addEventListener('click', closeSettings);
settingsModal?.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });
styles.forEach(opt => opt.addEventListener('click', () => setStyle(opt.dataset.style)));
colors.forEach(opt => opt.addEventListener('click', () => setColor(opt.dataset.color)));
if (viewportModeSelect) {
  viewportModeSelect.value = getViewportModeSetting();
  viewportModeSelect.addEventListener('change', () => {
    setViewportModeSetting(viewportModeSelect.value || 'auto');
    applyViewportModeSetting();
    showToast(`UI mode set to ${getViewportModeSetting()}.`, 'info', 1400);
  });
}
applyViewportModeSetting();
window.addEventListener('resize', () => {
  if (getViewportModeSetting() === 'auto') applyViewportModeSetting();
});
applySavedModelSelection();
refreshModelOptionMeta();
populateModeSelect();
buildCustomSelects();
modeSelect?.addEventListener('change', () => {
  setMode(modeSelect.value);
  populateModeSelect();
  // If the current main chat is linked to an agent, keep that agent mode aligned.
  const linked = _agentForSession();
  if (linked) {
    const nextMode = String(modeSelect.value || '').trim();
    if (nextMode && linked.mode !== nextMode) {
      linked.mode = nextMode;
      saveMissionAgents(missionAgents);
    }
  }
});
modelSelect?.addEventListener('change', () => {
  setSelectedModel(modelSelect.value || '');
  refreshModelOptionMeta();
  // If the current main chat is linked to an agent, keep that agent model aligned.
  const linked = _agentForSession();
  if (linked) {
    const nextModel = String(modelSelect.value || '').trim();
    if (nextModel && linked.model !== nextModel) {
      linked.model = nextModel;
      saveMissionAgents(missionAgents);
    }
  }
  if (!hasAnyApiKey()) openSettings();
});
webAutoToggle?.addEventListener('click', () => {
  setWebAutoSearch(!getWebAutoSearch());
  syncWebAutoButton();
});
agentWebAutoToggle?.addEventListener('click', () => {
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

let savedStyle = localStorage.getItem('vibe_style');
let savedColor = localStorage.getItem('vibe_color');

if (!savedStyle || !savedColor) {
  const legacyTheme = localStorage.getItem('vibe_theme') || 'default';
  const mapping = {
    'default': { style: 'glass', color: 'midnight-red' },
    'midnight': { style: 'glass', color: 'deep-purple' },
    'light': { style: 'glass', color: 'clean-light' },
    'minimal': { style: 'minimal', color: 'clean-light' },
    'cyberpunk': { style: 'glass', color: 'cyberpunk' },
    'forest': { style: 'neo', color: 'forest-sage' },
    'claymorphism': { style: 'clay', color: 'clean-light' },
    'claymorphism-red': { style: 'clay', color: 'clay-crimson' },
    'crimson-black': { style: 'glass', color: 'crimson-black' },
    'aurora': { style: 'glass', color: 'aurora-glass' },
    'sunset-neon': { style: 'glass', color: 'sunset-neon' }
  };
  const mapped = mapping[legacyTheme] || mapping['default'];
  savedStyle = savedStyle || mapped.style;
  savedColor = savedColor || mapped.color;
}

setStyle(savedStyle);
setColor(savedColor);

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
let workshopExpandedIndex = 0;
let circuitSelectedSource = null;
let circuitSelectedTarget = null;
let circuitMousePos = { x: 0, y: 0 };
let circuitDraggedNodeIdx = null;
let circuitDragOffset = { x: 0, y: 0 };

/* ── Sandbox ──────────────────────────────────────────────────── */
function inferLangFromPath(path = '') {
  const p = path.toLowerCase();
  if (p.endsWith('.html') || p.endsWith('.htm')) return 'html';
  if (p.endsWith('.css')) return 'css';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'javascript';
  if (p.endsWith('.ts') || p.endsWith('.tsx')) return 'typescript';
  if (p.endsWith('.py')) return 'python';
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

function injectSandboxRuntimeBridge(html = '') {
  const bridge = `<script>
(function () {
  if (window.__vibeAlphaBridgeInstalled) return;
  window.__vibeAlphaBridgeInstalled = true;
  const origFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!origFetch) return;

  function toUrl(input) {
    try {
      if (typeof input === 'string') return new URL(input, window.location.href);
      if (input && typeof input.url === 'string') return new URL(input.url, window.location.href);
    } catch (_) {}
    return null;
  }

  function shouldProxy(urlObj) {
    if (!urlObj) return false;
    const host = String(urlObj.hostname || '').toLowerCase();
    return host === 'www.alphavantage.co' || host === 'alphavantage.co';
  }

  function proxyFetch(input, init) {
    const urlObj = toUrl(input);
    if (!shouldProxy(urlObj)) return origFetch(input, init);

    const params = new URLSearchParams(urlObj.search || '');
    const key = params.get('apikey') || params.get('apiKey') || '';
    params.delete('apikey');
    params.delete('apiKey');

    const headers = new Headers((init && init.headers) || (input && input.headers) || {});
    if (key && !headers.get('X-Alpha-Vantage-Key')) headers.set('X-Alpha-Vantage-Key', key);
    // Same-origin proxy avoids iframe CORS failures.
    const proxyUrl = '/api/proxy/alphavantage?' + params.toString();
    const nextInit = Object.assign({}, init || {}, {
      method: 'GET',
      headers,
      credentials: 'same-origin',
      mode: 'same-origin',
    });
    return origFetch(proxyUrl, nextInit);
  }

  window.fetch = proxyFetch;
  window.vibeFetchAlphaVantage = function (params) {
    const query = new URLSearchParams(params || {});
    const key = query.get('apikey') || query.get('apiKey') || '';
    query.delete('apikey');
    query.delete('apiKey');
    const headers = {};
    if (key) headers['X-Alpha-Vantage-Key'] = key;
    return origFetch('/api/proxy/alphavantage?' + query.toString(), {
      method: 'GET',
      headers,
      credentials: 'same-origin',
      mode: 'same-origin',
    });
  };
})();
<\/script>`;
  if (!html) return bridge;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${bridge}</head>`);
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body([^>]*)>/i, `<body$1>${bridge}`);
  return bridge + html;
}

function buildSandboxPreviewHtml(files) {
  const htmlFile = files.find(f => /\.html?$/i.test(f.path)) || files.find(f => f.lang === 'html');
  if (!htmlFile) {
    const pyFile = files.find(f => /\.py$/i.test(String(f.path || '')) || f.lang === 'python');
    if (pyFile) {
      return `<!doctype html><html><body style="font-family:sans-serif;padding:16px;line-height:1.45;">
<h3 style="margin:0 0 10px;">Python file detected</h3>
<p style="margin:0 0 8px;">This preview pane runs web code (HTML/CSS/JS). Python code is loaded in the sandbox editor, but it cannot execute inside this browser iframe.</p>
<p style="margin:0;">File: <code>${esc(String(pyFile.path || 'main.py'))}</code></p>
</body></html>`;
    }
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

  html = injectSandboxRuntimeBridge(html);
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

function _sandboxPathForLang(lang = '') {
  const l = String(lang || '').toLowerCase();
  if (l === 'python' || l === 'py') return 'main.py';
  if (l === 'javascript' || l === 'js') return 'script.js';
  if (l === 'typescript' || l === 'ts' || l === 'tsx') return 'main.ts';
  if (l === 'css') return 'styles.css';
  if (l === 'json') return 'data.json';
  if (l === 'markdown' || l === 'md') return 'notes.md';
  return 'index.html';
}

function openCodeInSandbox(code = '', lang = 'text') {
  const l = String(lang || 'text').toLowerCase();
  const path = _sandboxPathForLang(l);
  const files = [];
  if (path !== 'index.html') {
    files.push({
      path: 'index.html',
      lang: 'html',
      code: `<!doctype html><html><body style="font-family:sans-serif;padding:16px;">
<h3>Opened ${esc(path)}</h3>
<p>This preview panel renders web content. Switch to Code View to edit the source file.</p>
</body></html>`,
    });
  }
  files.push({ path, lang: inferLangFromPath(path), code: String(code || '') });
  openSandbox('', files);
}

function openFilesInSandbox(files = []) {
  const normalized = normalizeSandboxFiles(files);
  if (!normalized.length) return;
  if (!normalized.some(f => /\.html?$/i.test(f.path))) {
    const first = normalized[0];
    normalized.unshift({
      path: 'index.html',
      lang: 'html',
      code: `<!doctype html><html><body style="font-family:sans-serif;padding:16px;line-height:1.45;">
<h3>Code loaded into sandbox</h3>
<p>The source file <code>${esc(first.path || 'file')}</code> is available in Code View.</p>
<p>Preview runs HTML/CSS/JS only. Python files need a Python runner to execute.</p>
</body></html>`,
    });
  }
  openSandbox('', normalized);
}

function openSandbox(htmlCode, files = null, forceOpen = false) {
  const normalized = files ? normalizeSandboxFiles(files) : normalizeSandboxFiles([
    { path: 'index.html', lang: 'html', code: htmlCode || '' },
  ]);
  sandboxFiles = normalized;
  activeSandboxFile = normalized[0]?.path || 'index.html';
  
  if (forceOpen) {
    sandboxPane.classList.add('open');
    if (sandboxBtn) sandboxBtn.classList.add('active');
    const edgeBtn = document.getElementById('sandbox-edge-btn');
    if (edgeBtn) edgeBtn.classList.remove('attention');
  } else {
    const edgeBtn = document.getElementById('sandbox-edge-btn');
    if (edgeBtn && !sandboxPane.classList.contains('open')) {
      edgeBtn.classList.add('attention');
    }
  }
  
  renderSandboxFileList();
  renderSandboxEditor();
  refreshSandboxPreview();
  setSandboxView(sandboxViewToggle?.checked ? 'code' : 'project');
}

function setSandboxMaximized(on) {
  const maximized = !!on;
  sandboxPane.classList.toggle('maximized', maximized);
  const fsBtn = document.getElementById('sb-fullscreen');
  if (fsBtn) {
    fsBtn.textContent = maximized ? 'Restore' : 'Fullscreen';
    fsBtn.title = maximized ? 'Restore sandbox size (Esc)' : 'Expand preview inside browser';
    fsBtn.setAttribute('aria-label', fsBtn.title);
  }
}

function closeSandbox() {
  setSandboxMaximized(false);
  sandboxPane.classList.remove('open');
  sandboxPane.classList.remove('hover-open');
  if (sandboxBtn) sandboxBtn.classList.remove('active');
  sandboxFrame.srcdoc = '';
  clearSandboxBlobUrls();
}
if (sandboxBtn) {
  sandboxBtn.addEventListener('click', () => {
    sandboxPane.classList.contains('open') ? closeSandbox()
      : (sandboxFiles.length ? openSandbox('', sandboxFiles, true) : (lastHtmlCode ? openSandbox(lastHtmlCode, null, true) : null));
  });
}

// Sandbox Edge interactions
const sandboxEdgeBtn = document.getElementById('sandbox-edge-btn');
if (sandboxEdgeBtn) {
  let hoverTimeout;
  sandboxEdgeBtn.addEventListener('mouseenter', () => {
    clearTimeout(hoverTimeout);
    if (!sandboxPane.classList.contains('open')) {
      sandboxPane.style.display = ''; // Ensure visible if we hover
      void sandboxPane.offsetWidth; // Force layout reflow
      sandboxPane.classList.add('hover-open');
    }
  });
  
  sandboxEdgeBtn.addEventListener('mouseleave', () => {
    hoverTimeout = setTimeout(() => {
      sandboxPane.classList.remove('hover-open');
    }, 450);
  });
  
  sandboxPane.addEventListener('mouseenter', () => {
    clearTimeout(hoverTimeout);
  });
  
  sandboxPane.addEventListener('mouseleave', () => {
    hoverTimeout = setTimeout(() => {
      sandboxPane.classList.remove('hover-open');
    }, 450);
  });
  
  sandboxEdgeBtn.addEventListener('click', () => {
    clearTimeout(hoverTimeout);
    sandboxPane.classList.remove('hover-open');
    sandboxEdgeBtn.classList.remove('attention');
    sandboxPane.classList.toggle('open');
    sandboxPane.style.display = ''; 
    if (sandboxBtn) sandboxBtn.classList.toggle('active', sandboxPane.classList.contains('open'));
  });
}

// Compile Application Logic
const socket = io();
const compileBtn = document.getElementById('sb-compile');
const compileTerminal = document.getElementById('compile-terminal');
const compileOutput = document.getElementById('compile-output');
const compileClose = document.getElementById('compile-close');

if (compileBtn) {
  compileBtn.addEventListener('click', () => {
    if (!sandboxFiles || sandboxFiles.length === 0) {
      showToast('Sandbox is empty. Nothing to compile.', 'error');
      return;
    }
    if (compileTerminal) compileTerminal.style.display = 'block';
    if (compileOutput) compileOutput.textContent = 'Starting compilation pipeline...\n';
    
    // Extract full file path logic from the active sandbox UI
    socket.emit('compile_app', { files: sandboxFiles });
  });
}

if (compileClose) {
  compileClose.addEventListener('click', () => {
    if (compileTerminal) compileTerminal.style.display = 'none';
  });
}

socket.on('compile_log', (data) => {
  if (compileOutput && compileTerminal) {
    compileOutput.textContent += (data.line || '') + '\n';
    compileTerminal.scrollTop = compileTerminal.scrollHeight;
  }
});

socket.on('compile_done', (data) => {
  if (compileOutput && compileTerminal) {
    compileOutput.textContent += '\n\n🎉 COMPILATION SUCCESSFUL!\n';
    compileOutput.textContent += 'Binaries exported to:\n' + (data.out_dir || '') + '\n';
    compileTerminal.scrollTop = compileTerminal.scrollHeight;
  }
});

sandboxPane.addEventListener('mouseleave', (e) => {
  // If moving mouse to the edge button, don't close yet
  if (e.relatedTarget === sandboxEdgeBtn) return;
  if (!sandboxPane.classList.contains('open')) {
    sandboxPane.classList.remove('hover-open');
  }
});

sandboxViewToggle?.addEventListener('change', () => {
  setSandboxView(sandboxViewToggle.checked ? 'code' : 'project');
});

// Sandbox Device Simulator
const deviceSelect = document.getElementById('sb-device-select');
let sandboxResizeObserver = null;

function applyDeviceSimulation() {
  if (!sandboxFrame || !deviceSelect) return;
  const val = deviceSelect.value;
  const workArea = document.getElementById('sandbox-work');
  if (!workArea) return;
  
  if (val === 'responsive') {
    sandboxFrame.style.width = '100%';
    sandboxFrame.style.height = '100%';
    sandboxFrame.style.transform = 'none';
    sandboxFrame.style.position = 'relative';
    sandboxFrame.style.left = 'auto';
    sandboxFrame.style.top = 'auto';
    sandboxFrame.style.boxShadow = 'none';
    sandboxFrame.style.borderRadius = '0';
  } else {
    const [wStr, hStr] = val.split('x');
    const targetW = parseInt(wStr, 10);
    const targetH = parseInt(hStr, 10);
    
    sandboxFrame.style.width = `${targetW}px`;
    sandboxFrame.style.height = `${targetH}px`;
    sandboxFrame.style.position = 'absolute';
    sandboxFrame.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';
    sandboxFrame.style.borderRadius = '8px';
    
    // Compute scale
    const containerRect = workArea.getBoundingClientRect();
    const padding = 40;
    const availW = containerRect.width - padding;
    const availH = containerRect.height - padding;
    
    let scale = Math.min(availW / targetW, availH / targetH);
    if (scale > 1) scale = 1; // Don't scale up past 100%
    
    sandboxFrame.style.transformOrigin = 'top left';
    sandboxFrame.style.transform = `scale(${scale})`;
    
    // Center it
    const scaledW = targetW * scale;
    const scaledH = targetH * scale;
    const leftOffset = (containerRect.width - scaledW) / 2;
    const topOffset = (containerRect.height - scaledH) / 2;
    
    sandboxFrame.style.left = `${Math.max(0, leftOffset)}px`;
    sandboxFrame.style.top = `${Math.max(0, topOffset)}px`;
  }
}

deviceSelect?.addEventListener('change', applyDeviceSimulation);

if (window.ResizeObserver) {
  sandboxResizeObserver = new ResizeObserver(() => {
    if (deviceSelect && deviceSelect.value !== 'responsive') {
      applyDeviceSimulation();
    }
  });
  const workArea = document.getElementById('sandbox-work');
  if (workArea) sandboxResizeObserver.observe(workArea);
}
sandboxEditor?.addEventListener('input', () => {
  const file = sandboxFiles.find(f => f.path === activeSandboxFile);
  if (!file) return;
  file.code = sandboxEditor.value;
});
document.getElementById('sb-close')?.addEventListener('click', closeSandbox);
document.getElementById('sb-new-app')?.addEventListener('click', () => {
  openSandbox('', buildStarterFiles());
});
document.getElementById('sb-add-file')?.addEventListener('click', async () => {
  const rawPath = await showCustomPrompt('File path (e.g. src/app.js):', 'new-file.js');
  const path = (rawPath || '').trim();
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
  if (!sandboxPane.classList.contains('open')) return;
  const next = !sandboxPane.classList.contains('maximized');
  setSandboxMaximized(next);
  if (next) {
    setSandboxView('project');
    sandboxFrame?.focus?.();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sandboxPane?.classList.contains('maximized')) {
    setSandboxMaximized(false);
  }
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

async function saveProjectFromCode(code, lang = 'text') {
  const defaultTitle = `Project ${new Date().toLocaleString()}`;
  const title = await showCustomPrompt('Project name:', defaultTitle);
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

async function saveProjectFromFiles(files) {
  const defaultTitle = `App ${new Date().toLocaleString()}`;
  const title = await showCustomPrompt('Project name:', defaultTitle);
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
    inputs: [],
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

// Shared context menu — one instance reused
let _ctxMenu = null;
function showModeContextMenu(e, m) {
  e.preventDefault();
  if (_ctxMenu) _ctxMenu.remove();

  const menu = document.createElement('div');
  menu.id = '_mode-ctx-menu';
  menu.style.cssText = [
    'position:fixed',
    `left:${Math.min(e.clientX, window.innerWidth - 170)}px`,
    `top:${Math.min(e.clientY, window.innerHeight - 120)}px`,
    'z-index:99999',
    'background:rgba(14,16,28,0.97)',
    'border:1px solid rgba(0,243,255,0.25)',
    'border-radius:10px',
    'padding:6px',
    'min-width:160px',
    'box-shadow:0 8px 32px rgba(0,0,0,0.6)',
    'backdrop-filter:blur(12px)',
    'font-size:0.8rem',
  ].join(';');

  function menuItem(icon, label, danger, cb) {
    const btn = document.createElement('button');
    btn.style.cssText = [
      'display:flex', 'align-items:center', 'gap:8px',
      'width:100%', 'padding:7px 10px', 'border:none',
      'background:transparent', 'color:' + (danger ? '#ff6b6b' : '#e8eaf6'),
      'cursor:pointer', 'border-radius:6px', 'text-align:left',
    ].join(';');
    btn.innerHTML = `<span style="width:16px;text-align:center;">${icon}</span> ${label}`;
    btn.addEventListener('mouseenter', () => btn.style.background = danger ? 'rgba(255,107,107,0.15)' : 'rgba(255,255,255,0.08)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
    btn.addEventListener('click', () => { menu.remove(); _ctxMenu = null; cb(); });
    return btn;
  }

  menu.appendChild(menuItem('📋', 'Duplicate', false, () => {
    const cloned = cloneMode(m);
    const allModes = loadCustomModes();
    allModes.push(cloned);
    saveCustomModes(allModes);
    activeWorkshopMode = cloned;
    workshopExpandedIndex = 0;
    workshopAdvancedVisible = {};
    renderWorkshopModeList();
    renderWorkshopEditor();
    populateModeSelect();
  }));

  menu.appendChild(menuItem('🗑', 'Delete', true, () => {
    if (!confirm(`Delete "${m.name || 'Custom Mode'}"?`)) return;
    const allModes = loadCustomModes().filter(x => x.id !== m.id);
    saveCustomModes(allModes);
    if (activeWorkshopMode && activeWorkshopMode.id === m.id) {
      activeWorkshopMode = allModes[0] ? JSON.parse(JSON.stringify(allModes[0])) : null;
    }
    renderWorkshopModeList();
    renderWorkshopEditor();
    populateModeSelect();
  }));

  document.body.appendChild(menu);
  _ctxMenu = menu;

  // Close on any outside click
  setTimeout(() => {
    function closeCtx(ev) {
      if (!menu.contains(ev.target)) { menu.remove(); _ctxMenu = null; document.removeEventListener('mousedown', closeCtx); }
    }
    document.addEventListener('mousedown', closeCtx);
  }, 0);
}

function renderWorkshopModeList() {
  const modes = loadCustomModes();
  workshopModeList.innerHTML = '';
  if (!modes.length) {
    workshopModeList.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);padding:4px 6px;">No custom modes yet.</div>';
    return;
  }
  modes.forEach(m => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:4px;border-radius:6px;overflow:hidden;';

    const nameBtn = document.createElement('button');
    nameBtn.className = 'hdr-btn';
    nameBtn.style.cssText = 'flex:1;text-align:left;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    nameBtn.textContent = `${m.name || 'Custom Mode'} (${(m.agents || []).length})`;
    nameBtn.title = 'Click to open · Right-click for options';
    if (activeWorkshopMode && activeWorkshopMode.id === m.id) nameBtn.classList.add('active');

    nameBtn.addEventListener('click', () => {
      activeWorkshopMode = JSON.parse(JSON.stringify(m));
      workshopExpandedIndex = 0;
      workshopAdvancedVisible = {};
      renderWorkshopEditor();
      renderWorkshopModeList();
    });

    nameBtn.addEventListener('contextmenu', (e) => showModeContextMenu(e, m));

    // Trash delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'hdr-btn btn-danger';
    delBtn.style.cssText = 'flex-shrink:0;padding:4px 7px;font-size:0.75rem;opacity:0.75;';
    delBtn.textContent = '🗑';
    delBtn.title = 'Delete this mode';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showModeContextMenu(e, m);
    });

    row.appendChild(nameBtn);
    row.appendChild(delBtn);
    workshopModeList.appendChild(row);
  });
}

function fileOptionsHtml(selected = []) {
  return workshopFiles.map(f => {
    const sel = selected.includes(f) ? 'selected' : '';
    return `<option value="${esc(f)}" ${sel}>${esc(f)}</option>`;
  }).join('');
}

function animateCardSwap(card1, card2, onComplete) {
  const rect1 = card1.getBoundingClientRect();
  const rect2 = card2.getBoundingClientRect();
  const diffY = rect2.top - rect1.top;

  card1.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease';
  card2.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease';

  card1.style.transform = `translateY(${diffY}px)`;
  card2.style.transform = `translateY(${-diffY}px)`;

  setTimeout(() => {
    card1.style.transition = '';
    card2.style.transition = '';
    card1.style.transform = '';
    card2.style.transform = '';
    onComplete();
  }, 350);
}

function drawCircuitboardWires() {
  const svg = document.getElementById('workshop-circuit-svg');
  if (!svg || !activeWorkshopMode) return;
  svg.innerHTML = '';

  const agents = activeWorkshopMode.agents || [];
  const N = agents.length;
  if (N <= 1) return;

  const canvasWrap = document.getElementById('workshop-circuit-canvas-wrap');
  const width = canvasWrap?.clientWidth || 700;
  const height = canvasWrap?.clientHeight || 180;

  // Resolve node positions (use saved freestyle coords, or compute and cache default staggered layout)
  const resolvedCoords = agents.map((a, i) => {
    if (typeof a.x === 'number' && typeof a.y === 'number') {
      return { x: a.x, y: a.y };
    }
    const ratio = N > 1 ? i / (N - 1) : 0.5;
    const defaultX = 70 + ratio * (width - 140);
    const defaultY = height / 2 + (i % 2 === 0 ? -32 : 32);
    a.x = defaultX;
    a.y = defaultY;
    return { x: defaultX, y: defaultY };
  });

  // Generate gorgeous magnetic deflection curve bending dynamically around intermediate node obstacles
  function getMagneticPath(x1, y1, x2, y2, sourceIdx, targetIdx) {
    const dx = x2 - x1;
    const offset = Math.max(40, Math.abs(dx) * 0.5);
    let cx1 = x1 + offset;
    let cy1 = y1;
    let cx2 = x2 - offset;
    let cy2 = y2;

    resolvedCoords.forEach((c, k) => {
      if (k === sourceIdx || k === targetIdx) return;

      const minX = Math.min(x1, x2) - 15;
      const maxX = Math.max(x1, x2) + 15;
      if (c.x > minX && c.x < maxX) {
        const segmentT = (c.x - x1) / (x2 - x1 || 1);
        const expectedY = y1 + segmentT * (y2 - y1);
        const verticalDist = c.y - expectedY;

        if (Math.abs(verticalDist) < 65) {
          const pushForce = 55 * (verticalDist >= 0 ? -1 : 1);
          cy1 += pushForce;
          cy2 += pushForce;
        }
      }
    });

    return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  }

  // 1. Draw established neon circuit connections
  agents.forEach((a, j) => {
    if (Array.isArray(a.inputs)) {
      a.inputs.forEach(i => {
        if (i >= N || i < 0) return;

        const start = resolvedCoords[i];
        const end = resolvedCoords[j];
        if (!start || !end) return;

        const x1 = start.x + 55;
        const y1 = start.y;
        const x2 = end.x - 55;
        const y2 = end.y;

        const d = getMagneticPath(x1, y1, x2, y2, i, j);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', 'circuit-wire');

        const colors = ['#00f3ff', '#ff007f', '#39ff14', '#b50fec', '#ffdd00'];
        const wireColor = colors[(i + j) % colors.length];
        path.setAttribute('stroke', wireColor);
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('fill', 'none');

        path.style.pointerEvents = 'stroke';
        path.style.cursor = 'pointer';
        path.innerHTML = `<title>Double click to disconnect wire</title>`;

        path.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          a.inputs = a.inputs.filter(x => x !== i);
          renderWorkshopEditor();
        });

        path.addEventListener('mouseenter', () => {
          path.setAttribute('stroke-width', '4');
          path.style.filter = `drop-shadow(0 0 4px ${wireColor})`;
        });
        path.addEventListener('mouseleave', () => {
          path.setAttribute('stroke-width', '2.5');
          path.style.filter = '';
        });

        svg.appendChild(path);
      });
    }
  });

  // 2. Draw active dragging output pin -> cursor preview string
  if (circuitSelectedSource !== null) {
    const start = resolvedCoords[circuitSelectedSource];
    if (start) {
      const x1 = start.x + 55;
      const y1 = start.y;
      const x2 = circuitMousePos.x;
      const y2 = circuitMousePos.y;

      const d = getMagneticPath(x1, y1, x2, y2, circuitSelectedSource, -1);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', '#ff007f');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-dasharray', '5,5');
      path.setAttribute('fill', 'none');
      path.style.pointerEvents = 'none';
      path.style.filter = 'drop-shadow(0 0 6px rgba(255, 0, 127, 0.6))';
      svg.appendChild(path);
    }
  }

  // 3. Draw active dragging cursor -> input pin preview string
  if (circuitSelectedTarget !== null) {
    const end = resolvedCoords[circuitSelectedTarget];
    if (end) {
      const x1 = circuitMousePos.x;
      const y1 = circuitMousePos.y;
      const x2 = end.x - 55;
      const y2 = end.y;

      const d = getMagneticPath(x1, y1, x2, y2, -1, circuitSelectedTarget);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', '#00f3ff');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-dasharray', '5,5');
      path.setAttribute('fill', 'none');
      path.style.pointerEvents = 'none';
      path.style.filter = 'drop-shadow(0 0 6px rgba(0, 243, 255, 0.6))';
      svg.appendChild(path);
    }
  }
}

function renderWorkshopCircuitboard() {
  const container = document.getElementById('workshop-circuit-container');
  const svg = document.getElementById('workshop-circuit-svg');
  const nodesWrap = document.getElementById('workshop-circuit-nodes');
  if (!container || !svg || !nodesWrap) return;

  if (!activeWorkshopMode || (activeWorkshopMode.agents || []).length <= 1) {
    container.style.display = 'none';
    svg.innerHTML = '';
    nodesWrap.innerHTML = '';
    return;
  }

  container.style.display = 'flex';
  svg.innerHTML = '';
  nodesWrap.innerHTML = '';

  const agents = activeWorkshopMode.agents || [];
  const N = agents.length;
  const coords = [];

  const canvasWrap = document.getElementById('workshop-circuit-canvas-wrap');
  const width = canvasWrap.clientWidth || 700;
  const height = canvasWrap.clientHeight || 180;

  // Resolve staggered layout coordinates
  for (let i = 0; i < N; i++) {
    let x, y;
    if (typeof agents[i].x === 'number' && typeof agents[i].y === 'number') {
      x = agents[i].x;
      y = agents[i].y;
    } else {
      const ratio = N > 1 ? i / (N - 1) : 0.5;
      x = 70 + ratio * (width - 140);
      y = height / 2 + (N > 1 ? (i % 2 === 0 ? -32 : 32) : 0);
      agents[i].x = x;
      agents[i].y = y;
    }
    coords.push({ x, y });
  }

  // Draw nodes with interactive mouse dragging
  agents.forEach((a, i) => {
    const coord = coords[i];
    const node = document.createElement('div');
    node.className = `circuit-node ${workshopExpandedIndex === i ? 'selected' : ''}`;
    node.style.left = `${coord.x}px`;
    node.style.top = `${coord.y}px`;

    const isSource = (circuitSelectedSource === i);
    const isTarget = (circuitSelectedTarget === i);

    node.innerHTML = `
      <span class="circuit-pin circuit-pin-in ${isTarget ? 'active' : ''}" data-in-idx="${i}" title="Incoming Connection Input Feed"></span>
      <span style="font-family:monospace;font-size:0.6rem;opacity:0.4;background:rgba(255,255,255,0.06);padding:2px 4px;border-radius:4px;">A${i + 1}</span>
      <strong style="font-size:0.68rem;max-width:90px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0.02em;">${esc(a.name || `Agent ${i + 1}`)}</strong>
      <span class="circuit-pin circuit-pin-out ${isSource ? 'active' : ''}" data-out-idx="${i}" title="Outgoing Connection Source (Output Feed)" style="${isSource ? 'box-shadow: 0 0 12px #ff007f;' : ''}"></span>
    `;

    // Freestyle dragging listeners setup
    node.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('circuit-pin')) return;

      e.preventDefault();
      circuitDraggedNodeIdx = i;
      const startX = e.clientX;
      const startY = e.clientY;
      const originalX = coord.x;
      const originalY = coord.y;

      function onMouseMove(moveEvt) {
        if (circuitDraggedNodeIdx === null) return;
        const dx = moveEvt.clientX - startX;
        const dy = moveEvt.clientY - startY;

        let newX = originalX + dx;
        let newY = originalY + dy;

        newX = Math.max(50, Math.min(width - 50, newX));
        newY = Math.max(25, Math.min(height - 25, newY));

        coord.x = newX;
        coord.y = newY;
        a.x = newX;
        a.y = newY;

        node.style.left = `${newX}px`;
        node.style.top = `${newY}px`;

        drawCircuitboardWires();
      }

      function onMouseUp() {
        circuitDraggedNodeIdx = null;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        activeWorkshopMode.agents[i].x = coord.x;
        activeWorkshopMode.agents[i].y = coord.y;
      }

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    node.addEventListener('click', (e) => {
      if (e.target.classList.contains('circuit-pin')) return;
      workshopExpandedIndex = i;
      renderWorkshopEditor();
    });

    nodesWrap.appendChild(node);
  });

  // Pin event bindings
  nodesWrap.querySelectorAll('[data-out-idx]').forEach(pin => {
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(pin.getAttribute('data-out-idx'));
      if (circuitSelectedSource === idx) {
        circuitSelectedSource = null;
      } else {
        circuitSelectedSource = idx;
        circuitSelectedTarget = null;
      }
      renderWorkshopCircuitboard();
    });
  });

  nodesWrap.querySelectorAll('[data-in-idx]').forEach(pin => {
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(pin.getAttribute('data-in-idx'));

      // Connecting output to input
      if (circuitSelectedSource !== null && circuitSelectedSource !== idx) {
        const sourceIdx = circuitSelectedSource;
        const targetAgent = agents[idx];
        targetAgent.inputs = targetAgent.inputs || [];
        if (!targetAgent.inputs.includes(sourceIdx)) {
          targetAgent.inputs.push(sourceIdx);
        } else {
          targetAgent.inputs = targetAgent.inputs.filter(x => x !== sourceIdx);
        }
        circuitSelectedSource = null;
        renderWorkshopEditor();
      }
      // Start backward wire drawing if no source selected
      else if (circuitSelectedSource === null) {
        if (circuitSelectedTarget === idx) {
          circuitSelectedTarget = null;
        } else {
          circuitSelectedTarget = idx;
        }
        renderWorkshopCircuitboard();
      }
    });
  });

  // Track live mouse position at window level so it works even when hovering nodes
  const canvasRect = canvasWrap.getBoundingClientRect();
  function onCircuitMouseMove(e) {
    const rect = canvasWrap.getBoundingClientRect();
    circuitMousePos.x = e.clientX - rect.left;
    circuitMousePos.y = e.clientY - rect.top;
    if (circuitSelectedSource !== null || circuitSelectedTarget !== null) {
      drawCircuitboardWires();
    }
  }
  // Store handler on canvasWrap so we can replace it on re-render
  if (canvasWrap._circuitMouseHandler) {
    window.removeEventListener('mousemove', canvasWrap._circuitMouseHandler);
  }
  canvasWrap._circuitMouseHandler = onCircuitMouseMove;
  window.addEventListener('mousemove', onCircuitMouseMove);

  // Click canvas background to cancel active connection preview
  canvasWrap.addEventListener('mousedown', (e) => {
    if (e.target === canvasWrap) {
      circuitSelectedSource = null;
      circuitSelectedTarget = null;
      renderWorkshopCircuitboard();
    }
  });

  // Escape key triggers cancel
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      circuitSelectedSource = null;
      circuitSelectedTarget = null;
      renderWorkshopCircuitboard();
      window.removeEventListener('keydown', escHandler);
    }
  };
  window.addEventListener('keydown', escHandler);

  drawCircuitboardWires();
}

// Re-align connection wire SVG positions dynamically on window resizing
window.addEventListener('resize', renderWorkshopCircuitboard);

// Modern ResizeObserver to perfectly realign the circuitboard layout the millisecond the modal transitions open!
if (typeof ResizeObserver !== 'undefined') {
  const canvasWrapObserver = new ResizeObserver(() => {
    if (activeWorkshopMode && (activeWorkshopMode.agents || []).length > 1) {
      renderWorkshopCircuitboard();
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const wrap = document.getElementById('workshop-circuit-canvas-wrap');
    if (wrap) canvasWrapObserver.observe(wrap);
  });
  setTimeout(() => {
    const wrap = document.getElementById('workshop-circuit-canvas-wrap');
    if (wrap) canvasWrapObserver.observe(wrap);
  }, 100);
}

function renderWorkshopEditor() {
  if (!activeWorkshopMode) return;
  workshopModeName.value = activeWorkshopMode.name || '';
  
  const pulseCheckbox = document.getElementById('workshop-pulse-loop-checkbox');
  const perStepModelsCheckbox = document.getElementById('workshop-per-step-models-checkbox');
  const pulseConfigDiv = document.getElementById('workshop-pulse-config');
  if (pulseCheckbox) {
    pulseCheckbox.checked = !!activeWorkshopMode.usePulseLoop;
    if (pulseConfigDiv) pulseConfigDiv.style.display = pulseCheckbox.checked ? 'flex' : 'none';
  }
  if (perStepModelsCheckbox) {
    perStepModelsCheckbox.checked = !!activeWorkshopMode.usePerStepModels;
  }
  
  const pInterval = document.getElementById('workshop-pulse-interval');
  const pUnit = document.getElementById('workshop-pulse-unit');
  const pPrompt = document.getElementById('workshop-pulse-prompt');
  if (pInterval) pInterval.value = activeWorkshopMode.pulseInterval || 30;
  if (pUnit) pUnit.value = activeWorkshopMode.pulseUnit || 'seconds';
  if (pPrompt) pPrompt.value = activeWorkshopMode.pulsePrompt || 'Continue iteration based on the synthesis.';

  const availableModels = Array.from(document.querySelectorAll('#model-select option')).map(o => o.value);

  workshopAgents.innerHTML = '';
  const agentCount = (activeWorkshopMode.agents || []).length;
  const fileCount = (activeWorkshopMode.agents || []).reduce((sum, a) => sum + (Array.isArray(a.files) ? a.files.length : 0), 0);
  workshopMeta.textContent = `Agents: ${agentCount} • Attached files: ${fileCount}`;

  (activeWorkshopMode.agents || []).forEach((a, idx) => {
    const isExpanded = (workshopExpandedIndex === idx);
    const isAdvVisible = !!workshopAdvancedVisible[idx];

    const card = document.createElement('div');
    card.className = `workshop-agent-card ${isExpanded ? 'is-expanded' : ''}`;

    let filesSelectedCount = Array.isArray(a.files) ? a.files.length : 0;
    let cardSummary = `${a.name || `Agent ${idx + 1}`} (${filesSelectedCount} files attached)`;

    card.innerHTML = `
      <div class="workshop-agent-hdr" data-toggle="${idx}">
        <span class="workshop-agent-hdr-title">
          <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <strong>${esc(a.name || `Agent ${idx + 1}`)}</strong>
        </span>
        <span style="font-size:0.62rem;opacity:0.65;margin-left:auto;margin-right:12px;">${isExpanded ? '' : esc(cardSummary)}</span>
        <div style="display:flex;gap:4px;align-items:center;" onclick="event.stopPropagation();">
          <button class="hdr-btn" data-up="${idx}" title="Move Up">↑</button>
          <button class="hdr-btn" data-down="${idx}" title="Move Down">↓</button>
          <button class="hdr-btn btn-danger" data-del="${idx}" title="Remove Agent">Remove</button>
        </div>
      </div>
      <div class="workshop-agent-body">
        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:0.65rem;color:var(--text-muted);margin-bottom:4px;font-weight:600;letter-spacing:0.03em;">AGENT NAME</label>
          <input data-name="${idx}" value="${esc(a.name || '')}" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);" placeholder="Enter agent name..." />
        </div>
        ${activeWorkshopMode.usePerStepModels ? `
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:0.65rem;color:var(--text-muted);margin-bottom:4px;font-weight:600;letter-spacing:0.03em;">MODEL OVERRIDE</label>
            <select data-model="${idx}" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);">
              <option value="">Default Model</option>
              ${availableModels.map(m => `<option value="${m}" ${a.model === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
        ` : ''}
        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:0.65rem;color:var(--text-muted);margin-bottom:4px;font-weight:600;letter-spacing:0.03em;">PERSONALITY / SYSTEM PROMPT</label>
          <textarea data-persona="${idx}" rows="4" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);resize:vertical;" placeholder="Define how this agent should behave...">${esc(a.persona || '')}</textarea>
        </div>

        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:0.65rem;color:var(--text-muted);margin-bottom:6px;font-weight:600;letter-spacing:0.03em;">⚡ AGENT ABILITIES (Requests are forwarded to next agents)</label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <label class="toggle-wrapper" title="Allow agent to search the web">
              <span class="toggle-switch"><input type="checkbox" data-ability="search" data-idx="${idx}" ${(a.abilities || []).includes('search') ? 'checked' : ''}><span class="toggle-slider"></span></span> Web Search
            </label>
            <label class="toggle-wrapper" title="Allow agent to read calendar">
              <span class="toggle-switch"><input type="checkbox" data-ability="calendar" data-idx="${idx}" ${(a.abilities || []).includes('calendar') ? 'checked' : ''}><span class="toggle-slider"></span></span> Read Calendar
            </label>
            <label class="toggle-wrapper" title="Allow agent to read recent emails">
              <span class="toggle-switch"><input type="checkbox" data-ability="email" data-idx="${idx}" ${(a.abilities || []).includes('email') ? 'checked' : ''}><span class="toggle-slider"></span></span> Read Email
            </label>
            <label class="toggle-wrapper" title="Allow agent to skip downstream steps">
              <span class="toggle-switch"><input type="checkbox" data-ability="skip" data-idx="${idx}" ${(a.abilities || []).includes('skip') ? 'checked' : ''}><span class="toggle-slider"></span></span> Route / Skip
            </label>
          </div>
        </div>
        
        <!-- Incoming Feeds Card Controls -->
        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:0.65rem;color:var(--text-muted);margin-bottom:6px;font-weight:600;letter-spacing:0.03em;">🔌 INCOMING DATA FEEDS (from other agents)</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${(activeWorkshopMode.agents || []).map((otherA, otherIdx) => {
      if (otherIdx === idx) return '';
      const isConnected = Array.isArray(a.inputs) && a.inputs.includes(otherIdx);
      return `
                <button class="hdr-btn ${isConnected ? 'btn-connected' : ''}" data-feed-toggle="${idx}-${otherIdx}" style="font-size:0.64rem;padding:4px 8px;transition:all 0.2s;${isConnected ? 'background:rgba(0,243,255,0.15);border-color:#00f3ff;color:#00f3ff;box-shadow:0 0 6px rgba(0,243,255,0.2);' : ''}">
                  ${isConnected ? '🔌 Connected to' : '➕ Connect'} ${esc(otherA.name || `Agent ${otherIdx + 1}`)}
                </button>
              `;
    }).join('') || '<div style="font-size:0.65rem;opacity:0.5;">Add more agents to enable circuitboard feeds.</div>'}
          </div>
        </div>

        <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;">
          <button class="hdr-btn btn-advanced" data-adv-toggle="${idx}">
            ${isAdvVisible ? '⚙ Hide Advanced Options' : '⚙ Show Advanced Options'}
          </button>
          <div class="workshop-agent-adv-panel ${isAdvVisible ? 'is-visible' : ''}">
            <div style="margin-top:12px;">
              <label style="display:flex;align-items:center;gap:8px;font-size:0.65rem;color:var(--text);font-weight:600;letter-spacing:0.03em;cursor:pointer;">
                <input type="checkbox" data-search="${idx}" ${a.search ? 'checked' : ''} />
                🔌 ENTRUST WITH WEB SEARCH CAPABILITY
              </label>
              <div style="font-size:0.6rem;opacity:0.5;margin-top:4px;">If checked, this agent will independently browse the live internet using DuckDuckGo to gather real-time factual context before reasoning.</div>
            </div>
            <div style="margin-top:12px;">
              <label style="display:block;font-size:0.65rem;color:var(--text-muted);margin-bottom:4px;font-weight:600;letter-spacing:0.03em;">ATTACHED PROJECT FILES (multi-select)</label>
              <select data-files="${idx}" multiple size="5" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-family:monospace;font-size:0.68rem;">
                ${fileOptionsHtml(a.files || [])}
              </select>
              <div style="font-size:0.6rem;opacity:0.5;margin-top:4px;">Hold Ctrl (Cmd) to select multiple files.</div>
            </div>
            <div style="margin-top:12px;">
              <label style="display:block;font-size:0.65rem;color:var(--text-muted);margin-bottom:4px;font-weight:600;letter-spacing:0.03em;">CREATIVITY / TEMPERATURE (0.0 - 1.5)</label>
              <div style="display:flex;align-items:center;gap:12px;">
                <input data-temp="${idx}" type="range" min="0" max="1.5" step="0.1" value="${Number(a.temperature ?? 0.7)}" style="flex-grow:1;height:4px;background:var(--border);border-radius:2px;outline:none;" />
                <span data-temp-val="${idx}" style="font-family:monospace;font-size:0.75rem;width:30px;text-align:right;">${Number(a.temperature ?? 0.7).toFixed(1)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    workshopAgents.appendChild(card);
  });

  workshopAgents.querySelectorAll('[data-toggle]').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const idx = Number(hdr.dataset.toggle);
      workshopExpandedIndex = (workshopExpandedIndex === idx) ? -1 : idx;
      renderWorkshopEditor();
    });
  });

  workshopAgents.querySelectorAll('[data-adv-toggle]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(btn.getAttribute('data-adv-toggle'));
      workshopAdvancedVisible[idx] = !workshopAdvancedVisible[idx];
      renderWorkshopEditor();
    });
  });

  workshopAgents.querySelectorAll('[data-feed-toggle]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const [i, otherI] = btn.getAttribute('data-feed-toggle').split('-').map(Number);
      const agent = activeWorkshopMode.agents[i];
      agent.inputs = agent.inputs || [];
      if (agent.inputs.includes(otherI)) {
        agent.inputs = agent.inputs.filter(x => x !== otherI);
      } else {
        agent.inputs.push(otherI);
      }
      renderWorkshopEditor();
    });
  });

  workshopAgents.querySelectorAll('[data-name]').forEach(el => {
    el.addEventListener('input', (e) => {
      const i = Number(e.target.dataset.name);
      activeWorkshopMode.agents[i].name = e.target.value;
      const cardEl = e.target.closest('.workshop-agent-card');
      const titleEl = cardEl?.querySelector('.workshop-agent-hdr-title strong');
      if (titleEl) titleEl.textContent = e.target.value || `Agent ${i + 1}`;

      // Also sync the circuitboard text immediately
      const nodeEl = document.querySelector(`.circuit-node:nth-child(${i + 1}) strong`);
      if (nodeEl) nodeEl.textContent = e.target.value || `Agent ${i + 1}`;
      saveActiveWorkshopMode();
    });
  });

  workshopAgents.querySelectorAll('[data-persona]').forEach(el => {
    el.addEventListener('change', (e) => {
      const i = Number(e.target.dataset.persona);
      activeWorkshopMode.agents[i].persona = e.target.value;
      saveActiveWorkshopMode();
    });
  });

  workshopAgents.querySelectorAll('[data-files]').forEach(el => {
    el.addEventListener('change', (e) => {
      const i = Number(e.target.dataset.files);
      activeWorkshopMode.agents[i].files = Array.from(e.target.selectedOptions).map(o => o.value);
      saveActiveWorkshopMode();
    });
  });

  workshopAgents.querySelectorAll('[data-model]').forEach(el => {
    el.addEventListener('change', (e) => {
      const i = Number(e.target.dataset.model);
      activeWorkshopMode.agents[i].model = e.target.value;
      saveActiveWorkshopMode();
    });
  });

  workshopAgents.querySelectorAll('[data-temp]').forEach(el => {
    el.addEventListener('change', (e) => {
      const i = Number(e.target.dataset.temp);
      const v = Number(e.target.value || 0.7);
      activeWorkshopMode.agents[i].temperature = Math.max(0, Math.min(1.5, v));
      const valDisplay = el.parentNode.querySelector(`[data-temp-val="${i}"]`);
      if (valDisplay) valDisplay.textContent = v.toFixed(1);
      saveActiveWorkshopMode();
    });
  });

  workshopAgents.querySelectorAll('[data-search]').forEach(el => {
    el.addEventListener('change', (e) => {
      const i = Number(e.target.dataset.search);
      activeWorkshopMode.agents[i].search = e.target.checked;
      saveActiveWorkshopMode();
    });
  });

  workshopAgents.querySelectorAll('[data-ability]').forEach(el => {
    el.addEventListener('change', (e) => {
      const i = Number(e.target.dataset.idx);
      const ability = e.target.dataset.ability;
      if (!Array.isArray(activeWorkshopMode.agents[i].abilities)) {
        activeWorkshopMode.agents[i].abilities = [];
      }
      if (e.target.checked) {
        if (!activeWorkshopMode.agents[i].abilities.includes(ability)) {
          activeWorkshopMode.agents[i].abilities.push(ability);
        }
      } else {
        activeWorkshopMode.agents[i].abilities = activeWorkshopMode.agents[i].abilities.filter(a => a !== ability);
      }
      saveActiveWorkshopMode();
    });
  });

  workshopAgents.querySelectorAll('[data-up]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = Number(btn.dataset.up);
      if (i <= 0) return;

      const cards = workshopAgents.querySelectorAll('.workshop-agent-card');
      const currentCard = cards[i];
      const targetCard = cards[i - 1];
      if (currentCard && targetCard) {
        animateCardSwap(currentCard, targetCard, () => {
          const a = activeWorkshopMode.agents;
          // Dynamically swap and remap inputs coordinates indices
          a.forEach(agent => {
            if (Array.isArray(agent.inputs)) {
              agent.inputs = agent.inputs.map(x => {
                if (x === i) return i - 1;
                if (x === i - 1) return i;
                return x;
              });
            }
          });
          [a[i - 1], a[i]] = [a[i], a[i - 1]];
          if (workshopExpandedIndex === i) workshopExpandedIndex = i - 1;
          else if (workshopExpandedIndex === i - 1) workshopExpandedIndex = i;
          renderWorkshopEditor();
        });
      }
    });
  });

  workshopAgents.querySelectorAll('[data-down]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = Number(btn.dataset.down);
      const a = activeWorkshopMode.agents;
      if (i >= a.length - 1) return;

      const cards = workshopAgents.querySelectorAll('.workshop-agent-card');
      const currentCard = cards[i];
      const targetCard = cards[i + 1];
      if (currentCard && targetCard) {
        animateCardSwap(currentCard, targetCard, () => {
          const a = activeWorkshopMode.agents;
          // Dynamically swap and remap inputs coordinates indices
          a.forEach(agent => {
            if (Array.isArray(agent.inputs)) {
              agent.inputs = agent.inputs.map(x => {
                if (x === i) return i + 1;
                if (x === i + 1) return i;
                return x;
              });
            }
          });
          [a[i + 1], a[i]] = [a[i], a[i + 1]];
          if (workshopExpandedIndex === i) workshopExpandedIndex = i + 1;
          else if (workshopExpandedIndex === i + 1) workshopExpandedIndex = i;
          renderWorkshopEditor();
        });
      }
    });
  });

  workshopAgents.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = Number(btn.dataset.del);

      const cards = workshopAgents.querySelectorAll('.workshop-agent-card');
      const card = cards[i];
      if (card) {
        card.style.transition = 'opacity 0.25s ease, transform 0.25s ease, max-height 0.25s ease, margin 0.25s ease, padding 0.25s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9)';
        card.style.maxHeight = '0px';
        card.style.margin = '0px';
        card.style.padding = '0px';
        card.style.overflow = 'hidden';
        setTimeout(() => {
          activeWorkshopMode.agents.splice(i, 1);
          // Shift and clean connections mapping
          activeWorkshopMode.agents.forEach(agent => {
            if (Array.isArray(agent.inputs)) {
              agent.inputs = agent.inputs.map(x => {
                if (x === i) return null;
                if (x > i) return x - 1;
                return x;
              }).filter(x => x !== null);
            }
          });
          if (!activeWorkshopMode.agents.length) activeWorkshopMode.agents.push(makeAgent('Agent 1'));
          if (workshopExpandedIndex >= activeWorkshopMode.agents.length) {
            workshopExpandedIndex = activeWorkshopMode.agents.length - 1;
          }
          renderWorkshopEditor();
        }, 250);
      }
    });
  });

  renderWorkshopCircuitboard();
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
  workshopExpandedIndex = 0;
  workshopAdvancedVisible = {};
  renderWorkshopModeList();
  renderWorkshopEditor();
}

function closeWorkshop() { workshopModal.classList.remove('open'); }

function saveActiveWorkshopMode() {
  if (!activeWorkshopMode) return;
  activeWorkshopMode.name = (workshopModeName.value || activeWorkshopMode.name || 'Custom Mode').trim();
  if (!activeWorkshopMode.name) activeWorkshopMode.name = 'Custom Mode';
  
  const pulseCheckbox = document.getElementById('workshop-pulse-loop-checkbox');
  const perStepModelsCheckbox = document.getElementById('workshop-per-step-models-checkbox');
  const pulseConfigDiv = document.getElementById('workshop-pulse-config');
  if (pulseCheckbox) {
    activeWorkshopMode.usePulseLoop = !!pulseCheckbox.checked;
    if (pulseConfigDiv) pulseConfigDiv.style.display = pulseCheckbox.checked ? 'flex' : 'none';
  }
  if (perStepModelsCheckbox) {
    activeWorkshopMode.usePerStepModels = !!perStepModelsCheckbox.checked;
  }
  
  const pInterval = document.getElementById('workshop-pulse-interval');
  const pUnit = document.getElementById('workshop-pulse-unit');
  const pPrompt = document.getElementById('workshop-pulse-prompt');
  if (pInterval) activeWorkshopMode.pulseInterval = parseInt(pInterval.value, 10) || 30;
  if (pUnit) activeWorkshopMode.pulseUnit = pUnit.value;
  if (pPrompt) activeWorkshopMode.pulsePrompt = pPrompt.value;

  const modes = loadCustomModes();
  const idx = modes.findIndex(m => m.id === activeWorkshopMode.id);
  if (idx >= 0) modes[idx] = activeWorkshopMode;
  else modes.push(activeWorkshopMode);
  saveCustomModes(modes);
  renderWorkshopModeList();
  populateModeSelect();
}

// Auto-save whenever the mode name input changes
let _autoSaveNameTimer = null;
workshopModeName?.addEventListener('input', () => {
  clearTimeout(_autoSaveNameTimer);
  _autoSaveNameTimer = setTimeout(saveActiveWorkshopMode, 800);
});

document.getElementById('workshop-pulse-loop-checkbox')?.addEventListener('change', () => {
  const pulseConfigDiv = document.getElementById('workshop-pulse-config');
  if (pulseConfigDiv) {
    pulseConfigDiv.style.display = document.getElementById('workshop-pulse-loop-checkbox').checked ? 'flex' : 'none';
  }
  saveActiveWorkshopMode();
});

document.getElementById('workshop-per-step-models-checkbox')?.addEventListener('change', () => {
  saveActiveWorkshopMode();
  renderWorkshopEditor(); // Re-render to show/hide model selects
});

document.getElementById('workshop-pulse-interval')?.addEventListener('change', () => saveActiveWorkshopMode());
document.getElementById('workshop-pulse-unit')?.addEventListener('change', () => saveActiveWorkshopMode());
document.getElementById('workshop-pulse-prompt')?.addEventListener('change', () => saveActiveWorkshopMode());

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

async function importWorkshopMode() {
  const raw = await showCustomPrompt('Paste exported mode JSON:');
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
    workshopExpandedIndex = 0;
    workshopAdvancedVisible = {};
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
  workshopExpandedIndex = 0;
  workshopAdvancedVisible = {};
  renderWorkshopModeList();
  renderWorkshopEditor();
  populateModeSelect();
}

workshopBtn?.addEventListener('click', openWorkshop);
workshopClose?.addEventListener('click', closeWorkshop);
workshopModal?.addEventListener('click', (e) => { if (e.target === workshopModal) closeWorkshop(); });
workshopNewModeBtn?.addEventListener('click', () => {
  activeWorkshopMode = makeMode();
  workshopExpandedIndex = 0;
  workshopAdvancedVisible = {};
  // Save immediately so it appears in the list right away
  const modes = loadCustomModes();
  modes.push(activeWorkshopMode);
  saveCustomModes(modes);
  populateModeSelect();
  renderWorkshopModeList();
  renderWorkshopEditor();
  // Focus the name field so user can rename immediately
  setTimeout(() => workshopModeName?.select(), 50);
});
workshopAddAgentBtn?.addEventListener('click', () => {
  if (!activeWorkshopMode) return;
  activeWorkshopMode.agents.push(makeAgent(`Agent ${activeWorkshopMode.agents.length + 1}`));
  workshopExpandedIndex = activeWorkshopMode.agents.length - 1;
  renderWorkshopEditor();

  const cards = workshopAgents.querySelectorAll('.workshop-agent-card');
  const newCard = cards[cards.length - 1];
  if (newCard) {
    newCard.style.opacity = '0';
    newCard.style.transform = 'scale(0.9)';
    newCard.style.transition = 'none';
    requestAnimationFrame(() => {
      newCard.style.transition = 'opacity 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
      newCard.style.opacity = '1';
      newCard.style.transform = 'scale(1)';
    });
  }
});
workshopSaveModeBtn?.addEventListener('click', saveActiveWorkshopMode);
workshopCloneModeBtn?.addEventListener('click', () => {
  if (!activeWorkshopMode) return;
  const cloned = cloneMode(activeWorkshopMode);
  const modes = loadCustomModes();
  modes.push(cloned);
  saveCustomModes(modes);
  activeWorkshopMode = cloned;
  workshopExpandedIndex = 0;
  workshopAdvancedVisible = {};
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

function formatChatText(text) {
  if (!text) return '';
  let noThink = text.replace(/<think>([\s\S]*?)<\/think>/gi, '').trim();
  if (typeof marked !== 'undefined') {
    const html = marked.parse(noThink);
    const temp = document.createElement('div');
    temp.innerHTML = html;
    temp.querySelectorAll('pre code').forEach((block) => {
      const pre = block.parentElement;
      const lang = block.className.replace('language-', '') || 'text';
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block';
      wrapper.innerHTML = `
        <div class="code-block-header">
          <span class="lang">${lang}</span>
          <div class="spacer"></div>
        </div>
        <pre><code class="language-${lang}">${esc(block.textContent)}</code></pre>
      `;
      pre.replaceWith(wrapper);
    });
    return temp.innerHTML;
  }
  let escaped = esc(noThink);
  return escaped.replace(/```([\w-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const hd = lang ? `<div class="code-block-header"><span class="lang">${lang}</span><div class="spacer"></div></div>` : '';
    return `<div class="code-block">${hd}<pre><code>${code}</code></pre></div>`;
  });
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function setDisabled(s) { sendBtn.disabled = s; input.disabled = s; }

function setThinking(html) {
  thinkBar.classList.remove('fade');
  thinkBar.innerHTML = html;
  const agent = _agentForSession(store.currentId);
  if (agent) setAgentThinkingState(agent.id, true);
}
function clearThinking() {
  thinkBar.classList.add('fade');
  setTimeout(() => { thinkBar.innerHTML = ''; thinkBar.classList.remove('fade'); }, 600);
  const agent = _agentForSession(store.currentId);
  if (agent) setAgentThinkingState(agent.id, false);
}

function renderWelcomeState() {
  const existing = document.getElementById('welcome-screen');
  const hasMessages = Array.from(chatBox.children).some(child => child.id !== 'welcome-screen' && child.id !== 'typing');
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
  // Trust explicit HTML/web tags
  if (['html', 'htm', 'xml', 'xhtml', 'javascript', 'js', 'css'].includes(lc)) return true;

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

  if (isAgentExtremeMode()) {
    div.className = 'extreme-user-card';
    div.innerHTML = `
      <div class="extreme-user-inner">
        <div class="extreme-user-icon">You</div>
        <div class="extreme-user-text">${esc(text)}</div>
      </div>`;
  } else {
    div.className = 'msg user';
    div.innerHTML = `<div class="role">You</div><div class="msg-text">${esc(text)}</div>`;
  }

  chatBox.appendChild(div);
  renderWelcomeState();
  chatBox.scrollTop = chatBox.scrollHeight;
}


/* ── Schedule-tag parser ───────────────────────────────────────────────── */
function _attrVal(tagStr, attr) {
  const m = tagStr.match(new RegExp(attr + '=["\']([^"\']*)["\']'));
  return m ? m[1] : '';
}
function _localDateStr(date) {
  /* "YYYY-MM-DD" in local time, not UTC */
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/* Encode/decode persistent schedule-notice markers embedded in message text.
   Format: [SCHED_NOTICE|title=...|when=...|repeat=...]
   Pipes and newlines inside values are not allowed (they're replaced with spaces). */
function _encodeSchedNotice(title, isoWhen, repeat) {
  const safe = s => String(s || '').replace(/[|\n\r]/g, ' ');
  return `[SCHED_NOTICE|title=${safe(title)}|when=${safe(isoWhen)}|repeat=${safe(repeat)}]`;
}
function _renderSchedNoticeEl(title, isoWhen, repeat) {
  const runAt = new Date(isoWhen);
  const whenStr = isNaN(runAt) ? isoWhen
    : runAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const repeatStr = repeat && repeat !== 'none' ? ` · repeats ${repeat}` : '';
  const el = document.createElement('div');
  el.className = 'sched-inline-notice';
  el.innerHTML =
    `<span class="sched-notice-icon">📅</span>` +
    `<span><strong>Scheduled:</strong> "${esc(title)}"<br>` +
    `<span class="sched-notice-when">${esc(whenStr)}${repeatStr}</span></span>` +
    `<button class="sched-notice-link" title="Open Calendar">Open Calendar →</button>`;
  el.querySelector('.sched-notice-link').addEventListener('click', () => {
    document.getElementById('calendar-btn')?.click();
  });
  return el;
}
/* Strip [SCHED_NOTICE|...] markers from text and return { cleaned, notices[] } */
function _extractSchedNotices(text) {
  const notices = [];
  const cleaned = text.replace(/\[SCHED_NOTICE\|([^\]]*)\]/g, (_, inner) => {
    const get = k => { const m = inner.match(new RegExp(`${k}=([^|\\]]*)`)); return m ? m[1].trim() : ''; };
    notices.push({ title: get('title'), when: get('when'), repeat: get('repeat') });
    return '';
  }).trim();
  return { cleaned, notices };
}

async function _autoCreateScheduleTag(tagStr, anchorMsgEl) {
  const runAtRaw = _attrVal(tagStr, 'run_at');
  const title = _attrVal(tagStr, 'event_title') || 'Scheduled Event';
  const message = _attrVal(tagStr, 'message') || title;
  const mode = _attrVal(tagStr, 'mode') || 'conversational';
  const repeat = _attrVal(tagStr, 'repeat') || 'none';
  const agent = _attrVal(tagStr, 'agent') || '';
  if (!runAtRaw) return;
  const runAt = new Date(runAtRaw);
  if (isNaN(runAt.getTime())) return;
  try {
    const res = await fetch('/api/scheduled-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_at: runAt.toISOString(),
        event_title: title,
        message,
        instructions: message,
        agent_name: agent || 'Agent',
        target_agent: agent,
        mode,
        model: modelSelect?.value || '',
        repeat,
        enabled: true,
      }),
    });
    if (res.ok) {
      /* 1. Inject notice card into the live DOM element */
      const target = anchorMsgEl || chatBox?.querySelector('.msg.assistant:last-child');
      if (target) target.appendChild(_renderSchedNoticeEl(title, runAt.toISOString(), repeat));

      /* 2. Persist the notice into the saved message so it survives reload.
            Find the last assistant entry in sessionMessages and append the marker. */
      for (let i = sessionMessages.length - 1; i >= 0; i--) {
        if (sessionMessages[i].role === 'assistant') {
          sessionMessages[i].content += '\n' + _encodeSchedNotice(title, runAt.toISOString(), repeat);
          saveCurrentChat();
          break;
        }
      }

      showToast(`📅 Scheduled: "${title}"`, 'success');
      await loadScheduledActions();
    } else {
      const d = await res.json().catch(() => ({}));
      showToast(`Calendar error: ${d?.error || res.status}`, 'error');
    }
  } catch (e) {
    showToast(`Calendar error: ${e?.message || e}`, 'error');
  }
}

function addAssistantMsg(text, classification, traces, save = true, webSources = [], model = null) {
  /* 1. Strip any raw <schedule> tags (new messages) → queue for API call */
  const _pendingSchedules = [];
  const _tagRe2 = /<schedule\b([^>]*)\/>/gi;
  text = text.replace(_tagRe2, (_, attrs) => { _pendingSchedules.push(attrs); return ''; }).trim();

  /* 2. Extract persisted [SCHED_NOTICE|...] markers (reloaded messages) */
  const { cleaned: _cleanedText, notices: _persistedNotices } = _extractSchedNotices(text);
  text = _cleanedText;

  if (save) {
    sessionMessages.push({ role: 'assistant', content: text, classification, traces, web_sources: webSources });
    saveCurrentChat();
  }
  const div = document.createElement('div');
  div.className = 'msg assistant';

  /* ── Render the clean reply (text + code blocks) ── */
  const segments = parseCodeBlocks(text);
  const extractedFiles = extractFileSystemFromText(text);
  let bodyHtml = '';
  let foundRunnable = null;
  let webHtml = '';
  if (Array.isArray(webSources) && webSources.length > 0) {
    const urls = webSources.map(w => `<a href="${esc(w.url)}" target="_blank" style="color:var(--primary);text-decoration:underline;">${esc(w.title || w.url)}</a>`).join(', ');
    webHtml = `<div style="margin-bottom:8px;padding:6px;border-radius:6px;background:var(--code-bg);border:1px solid var(--primary);font-size:0.7rem;opacity:0.9;">🌐 <strong>Searched Web:</strong> ${urls}</div>`;
  }
  bodyHtml += webHtml;


  for (const seg of segments) {
    if (seg.type === 'text') {
      const trimmed = seg.content.trim();
      if (trimmed) bodyHtml += `<div class="msg-text">${typeof marked !== 'undefined' ? marked.parse(trimmed) : esc(trimmed)}</div>`;
    } else {
      const runnable = isRunnableHtml(seg.lang, seg.content);
      if (runnable && !foundRunnable) foundRunnable = { code: seg.content, lang: seg.lang };
      bodyHtml +=
        `<div class="code-block">` +
        `<div class="code-block-header">` +
        `<span class="lang">${esc(seg.lang)}</span><div class="spacer"></div>` +
        `<button class="save-btn" data-open-code data-lang="${esc(seg.lang)}">Open</button>` +
        `<button class="save-btn" data-save data-lang="${esc(seg.lang)}">Save</button>` +
        (runnable ? `<button class="run-btn" data-run data-lang="${esc(seg.lang)}">Run</button>` : '') +
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

  const fsActionHtml = (extractedFiles.length >= 1)
    ? `<div style="margin:0 0 10px;"><button class="hdr-btn" data-open-filesystem>Open in Sandbox (${extractedFiles.length} file${extractedFiles.length === 1 ? '' : 's'})</button></div>`
    : '';

  let thoughtsHtml = '';
  const graphId = 'completed-graph-' + Math.random().toString(36).substr(2, 5);
  if (Array.isArray(traces) && traces.length > 0) {
    const thoughtRows = traces.map(t => {
      return `<div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05);"><strong style="color:var(--primary); font-size:0.7rem;">${esc(t.agent)}</strong><div style="font-size:0.68rem; opacity:0.8; white-space:pre-wrap;">${esc(t.content)}</div></div>`;
    }).join('');

    const activeMode = getModeFromClassification(classification);
    const customMode = activeMode === 'custom' ? getCustomModeById(modeSelect?.value || getMode()) : null;

    thoughtsHtml = `<details style="margin-bottom:10px; background:var(--glass-2); padding:10px; border-radius:8px; border:1px solid var(--border);" ontoggle="redrawCompletedGraph(this, '${graphId}')">
        <summary style="font-size:0.72rem; opacity:0.9; cursor:pointer; font-weight:600; display:flex; align-items:center; gap:6px;">
          <span>🧠 Show Agent Reasoning Circuit (${traces.length} steps)</span>
        </summary>
        <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border);">
          <div id="${graphId}" class="reasoning-graph-container" style="background:transparent; border:none; margin:0 0 16px 0; padding:0;"></div>
          <div style="max-height: 250px; overflow:auto; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px;">
            ${thoughtRows}
          </div>
        </div>
      </details>`;
  }

  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const modelStr = model ? `<span class="role-model">${esc(model)}</span>` : '';

  // ─────────────────────────────────────────────────────────────────
  // AGENT EXTREME MODE: full canvas orchestration render
  // ─────────────────────────────────────────────────────────────────
  const isErrorMsg = !classification && text && text.startsWith('⚠️');
  const isLegacyHistorical = (!traces || traces.length === 0) && save === false;
  
  if (isAgentExtremeMode() && !isErrorMsg && !isLegacyHistorical) {
    div.className = '';  // reset; we use a wrapper approach

    // Determine the workflow mode used
    const extremeSel = document.getElementById('extreme-mode-select');
    const extremeMode = getModeFromClassification(classification) || extremeSel?.value || getMode();

    const isCustom = extremeMode === 'custom' || (extremeMode && extremeMode.startsWith('custom_'));
    const customModeId = (extremeMode && extremeMode.startsWith('custom_')) ? extremeMode : (extremeSel?.value || getMode());
    const customModeForExtreme = isCustom ? getCustomModeById(customModeId) : null;

    const finalAgentName = isCustom
      ? (customModeForExtreme?.agents?.slice(-1)[0]?.name || 'Synthesizer')
      : 'Synthesizer';

    const totalMs = (traces || []).reduce((s, t) => s + (t.elapsed_ms || 0), 0);
    const traceCount = (traces || []).length;

    // Canvas card (agent nodes layered layout)
    const canvasDiv = document.createElement('div');
    canvasDiv.className = 'extreme-canvas-card';
    const canvasId = 'extreme-canvas-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    canvasDiv.innerHTML = `<div id="${canvasId}" style="position:relative; width:100%;"></div>`;
    chatBox.appendChild(canvasDiv);

    // Render the final completed graph
    const targetCanvas = canvasDiv.querySelector('#' + canvasId);
    if (targetCanvas) {
      targetCanvas.__finalBodyHtml = bodyHtml;
      renderExtremeCanvas(targetCanvas, extremeMode, customModeForExtreme, traces, false);
    }

    if (fsActionHtml || checklistHtml) {
      const extraDiv = document.createElement('div');
      extraDiv.style.cssText = 'padding: 12px; margin-top: -8px; display: flex; justify-content: center; flex-direction: column; align-items: center;';
      extraDiv.innerHTML = `${fsActionHtml}${checklistHtml}`;
      canvasDiv.appendChild(extraDiv);
    }

    // Attach run-button handlers to canvasDiv
    canvasDiv.querySelectorAll('[data-run]').forEach(btn => {
      const code = btn.closest('.code-block').querySelector('pre').textContent;
      const lang = btn.dataset.lang || 'html';
      btn.addEventListener('click', () => openCodeInSandbox(code, lang));
    });
    canvasDiv.querySelectorAll('[data-open-code]').forEach(btn => {
      const code = btn.closest('.code-block').querySelector('pre').textContent;
      const lang = btn.dataset.lang || 'text';
      btn.addEventListener('click', () => openCodeInSandbox(code, lang));
    });
    canvasDiv.querySelectorAll('[data-save]').forEach(btn => {
      const code = btn.closest('.code-block').querySelector('pre').textContent;
      const lang = btn.dataset.lang || 'text';
      btn.addEventListener('click', () => saveProjectFromCode(code, lang));
    });
    canvasDiv.querySelectorAll('[data-plan-check]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const row = e.target.closest('.pc-item');
        row?.classList.toggle('done', !!e.target.checked);
      });
    });
    canvasDiv.querySelector('[data-open-filesystem]')?.addEventListener('click', () => {
      openFilesInSandbox(extractedFiles);
    });

    if (extractedFiles.length > 0) {
      setTimeout(() => openFilesInSandbox(extractedFiles, false), 300);
    } else if (foundRunnable) {
      setTimeout(() => openCodeInSandbox(foundRunnable.code, foundRunnable.lang, false), 300);
    }

    renderWelcomeState();
    _persistedNotices.forEach(n => canvasDiv.appendChild(_renderSchedNoticeEl(n.title, n.when, n.repeat)));
    if (_pendingSchedules.length) {
      _pendingSchedules.forEach(attrs => _autoCreateScheduleTag(attrs, canvasDiv));
    }
    chatBox.scrollTop = chatBox.scrollHeight;
    return;
  }

  // ─────────────────────────────────────────────────────────────────
  // CONVERSATIONAL MODE: simple text bubble (no reasoning graph)
  // ─────────────────────────────────────────────────────────────────
  div.className = 'msg assistant';
  div.innerHTML = `<div class="role">AI <span class="role-meta"><span class="role-time">${nowStr}</span>${modelStr}</span></div>${fsActionHtml}${checklistHtml}${bodyHtml}`;

  /* ── Attach run-button handlers ── */
  div.querySelectorAll('[data-run]').forEach(btn => {
    const code = btn.closest('.code-block').querySelector('pre').textContent;
    const lang = btn.dataset.lang || 'html';
    btn.addEventListener('click', () => openCodeInSandbox(code, lang));
  });
  div.querySelectorAll('[data-open-code]').forEach(btn => {
    const code = btn.closest('.code-block').querySelector('pre').textContent;
    const lang = btn.dataset.lang || 'text';
    btn.addEventListener('click', () => openCodeInSandbox(code, lang));
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
    openFilesInSandbox(extractedFiles);
  });

  if (foundRunnable) setTimeout(() => openCodeInSandbox(foundRunnable.code, foundRunnable.lang), 300);

  chatBox.appendChild(div);
  renderWelcomeState();

  _persistedNotices.forEach(n => div.appendChild(_renderSchedNoticeEl(n.title, n.when, n.repeat)));
  if (_pendingSchedules.length) {
    _pendingSchedules.forEach(attrs => _autoCreateScheduleTag(attrs, div));
  }

  chatBox.scrollTop = chatBox.scrollHeight;
}


function getModeFromClassification(classification) {
  // Map backend classification strings → frontend mode IDs used in getAgentBlueprint
  if (!classification) return null;
  const c = classification.toUpperCase();
  if (c === 'DEEP') return 'reasoning';
  if (c === 'FAST') return 'reasoning_fast';
  if (c === 'CUSTOM') return 'custom';
  if (c === 'HISTORIAN') return 'reasoning_historian';
  if (c === 'DIRECT') return 'direct';
  if (c === 'CONVERSATIONAL') return 'conversational';
  if (c === 'PROJECT_MANAGER') return 'project_manager';
  return null;
}

function getAgentBlueprint(mode, modeConfig, traces) {
  if (modeConfig && Array.isArray(modeConfig.agents) && modeConfig.agents.length > 0) {
    return modeConfig.agents.map((a, idx) => ({
      name: a.name || `Agent ${idx + 1}`,
      inputs: a.inputs || []
    }));
  }
  if (mode === 'reasoning_fast') {
    return [
      { name: "Classifier", inputs: [] },
      { name: "Classifier (Search)", inputs: [0] },
      { name: "Introspector", inputs: [1] },
      { name: "Synthesizer", inputs: [2] },
      { name: "Historian", inputs: [3] }
    ];
  }
  if (mode === 'reasoning' || mode === 'reasoning_once' || mode === 'reasoning_loop' || mode === 'project_manager') {
    return [
      { name: "Classifier", inputs: [] },
      { name: "Classifier (Search)", inputs: [0] },
      { name: "Introspector", inputs: [1] },
      { name: "Architect", inputs: [2] },
      { name: "Skeptic", inputs: [3] },
      { name: "Architect (V2)", inputs: [4] },
      { name: "Synthesizer", inputs: [5] },
      { name: "BugChecker", inputs: [6] },
      { name: "SynthesizerFix", inputs: [7] },
      { name: "Historian", inputs: [8] }
    ];
  }
  if (mode === 'reasoning_historian') {
    return [
      { name: "Historian", inputs: [] }
    ];
  }
  if (mode === 'conversational') {
    return [
      { name: "Muse", inputs: [] },
      { name: "Guide", inputs: [0] }
    ];
  }
  return [
    { name: "Assistant", inputs: [] }
  ];
}

function inferModeFromTraces(traces, defaultMode) {
  if (defaultMode === 'custom' || (defaultMode && defaultMode.startsWith('custom_'))) {
    return defaultMode;
  }
  if (!traces || traces.length === 0) return defaultMode || 'direct';

  const agentNames = new Set(traces.map(t => t.agent));

  if (agentNames.has('Architect') || agentNames.has('Skeptic') || agentNames.has('BugChecker')) {
    return 'reasoning';
  }
  if (agentNames.has('Introspector') && !agentNames.has('Architect')) {
    return 'reasoning_fast';
  }
  if (agentNames.has('Muse') || agentNames.has('Guide')) {
    return 'conversational';
  }
  if (agentNames.has('Historian') && agentNames.size === 1) {
    return 'reasoning_historian';
  }

  return defaultMode || 'reasoning';
}

function startStreamTicker(container, mode, modeConfig) {
  if (container.__streamTicker) return;

  container.__streamTicker = setInterval(() => {
    const state = window.__extremeStreamState;
    const activeRunId = container.__activeRunId || window.__activeRunId || 'live-run';
    if (!state || state.runId !== activeRunId || !container.__backendTraces) return;

    // 1. Compute layer index for every node in the blueprint
    const originalBlueprint = getAgentBlueprint(mode, modeConfig, container.__backendTraces);
    const blueprintLayers = {};
    originalBlueprint.forEach(node => blueprintLayers[node.name] = 0);

    let changed = true;
    for (let step = 0; step < originalBlueprint.length + 5 && changed; step++) {
      changed = false;
      originalBlueprint.forEach(node => {
        let maxParentLayer = -1;
        const parentIndices = node.inputs || [];
        parentIndices.forEach(parentIdx => {
          if (parentIdx >= 0 && parentIdx < originalBlueprint.length) {
            const parentName = originalBlueprint[parentIdx].name;
            if (parentName in blueprintLayers) {
              maxParentLayer = Math.max(maxParentLayer, blueprintLayers[parentName] ?? -1);
            }
          }
        });
        if (maxParentLayer !== -1 && blueprintLayers[node.name] !== maxParentLayer + 1) {
          blueprintLayers[node.name] = maxParentLayer + 1;
          changed = true;
        }
      });
    }

    const maxLayerIdx = Math.max(...Object.values(blueprintLayers), 0);

    let structureChanged = false;
    let textChanged = false;

    // 2. Stream based on current phase
    if (typeof state.phase === 'number') {
      const currentLayerIdx = state.phase;
      const currentLayerNodes = originalBlueprint.filter(node => blueprintLayers[node.name] === currentLayerIdx);

      const laterLayerHasTrace = container.__backendTraces.some(t => {
        const lName = t.agent;
        const lLayer = blueprintLayers[lName];
        return typeof lLayer === 'number' && lLayer > currentLayerIdx;
      });
      const runIsFinished = !!window.__pendingExtremeResponse;
      const isCurrentLayerSkipped = laterLayerHasTrace || runIsFinished;

      let allFinished = true;
      currentLayerNodes.forEach(node => {
        if (!state.nodes[node.name]) {
          state.nodes[node.name] = { text: '', wordIndex: 0, isFinished: false };
          structureChanged = true;
        }

        const nodeState = state.nodes[node.name];
        const matchingTrace = container.__backendTraces.find(t => t.agent === node.name);

        if (matchingTrace) {
          const targetText = matchingTrace.content || '';
          if (nodeState.text !== targetText) {
            nodeState.text = targetText;
            textChanged = true;
          }

          const isCompleted = matchingTrace.status === 'completed' || matchingTrace.status === 'ok' || matchingTrace.status === 'skipped';
          if (isCompleted && !nodeState.isFinished) {
            nodeState.isFinished = true;
            structureChanged = true;
          }
        } else if (isCurrentLayerSkipped) {
          if (!nodeState.isFinished) {
            nodeState.isFinished = true;
            structureChanged = true;
          }
        }

        if (!nodeState.isFinished) {
          allFinished = false;
        }
      });

      if (allFinished && currentLayerNodes.length > 0) {
        if (currentLayerIdx + 1 > maxLayerIdx) {
          state.phase = 'synthesis';
        } else {
          state.phase = currentLayerIdx + 1;
        }
        structureChanged = true;
      }
    } else if (state.phase === 'synthesis') {
      let targetText = '';
      if (window.__pendingExtremeResponse && window.__pendingExtremeResponse.reply) {
        targetText = window.__pendingExtremeResponse.reply;
      }

      if (targetText) {
        if (state.synthesis.text !== targetText) {
          state.synthesis.text = targetText;
          textChanged = true;
        }
        const hasPendingResponse = !!window.__pendingExtremeResponse;
        if (hasPendingResponse) {
          state.synthesis.isFinished = true;
          state.phase = 'finished';
          structureChanged = true;

          clearInterval(container.__streamTicker);
          container.__streamTicker = null;

          const data = window.__pendingExtremeResponse;
          window.__pendingExtremeResponse = null;

          // Rename the typing div so removeTyping() doesn't destroy our canvas
          const typingDiv = document.getElementById('typing');
          if (typingDiv) {
            const innerCanvas = typingDiv.querySelector('#live-extreme-canvas');
            if (innerCanvas) {
              typingDiv.id = `run-node-${data.runId || window.__activeRunId}`;
              typingDiv.classList.remove('typing-indicator');
              innerCanvas.removeAttribute('id'); // Very important to prevent duplicate ID matching on next run!
            }
          }

          removeTyping();

          // Save to history so it's not lost on reload
          sessionMessages.push({
            role: 'assistant',
            content: data.reply,
            classification: data.classification,
            traces: data.traces || [],
            web_sources: data.web_sources || []
          });
          const sess = store.sessions[store.currentId];
          if (sess) {
            sess.messages = sessionMessages;
            sess.timestamp = Date.now();
            saveStore(store);
          }

          if (data.web_sources && data.web_sources.length > 0) {
            const urls = data.web_sources.map(w => `<a href="${esc(w.url)}" target="_blank" style="color:var(--primary);text-decoration:underline;">${esc(w.title || w.url)}</a>`).join(', ');
            container.__finalBodyHtml = `<div style="margin-bottom:8px;padding:6px;border-radius:6px;background:var(--code-bg);border:1px solid var(--primary);font-size:0.7rem;opacity:0.9;">🌐 <strong>Searched Web:</strong> ${urls}</div>` + (typeof marked !== 'undefined' ? marked.parse(state.synthesis.text) : `<p>${esc(state.synthesis.text)}</p>`);
          } else {
            container.__finalBodyHtml = typeof marked !== 'undefined' ? marked.parse(state.synthesis.text) : `<p>${esc(state.synthesis.text)}</p>`;
          }

          stopStageTicker();

          if (webUrlInput) webUrlInput.value = '';
          webUrlWrap?.classList.remove('open');
          setDisabled(false);
          renderWelcomeState();

          // Re-render to inject the final body HTML into the final node
          renderExtremeCanvas(container, mode, modeConfig, container.__backendTraces, false, true);

          if (isPulseLoopMode() && window.__pulseActive) {
            startPulseLoopTimer();
          }

          // Auto-scroll to the bottom so the user doesn't have to scroll to see the final answer
          setTimeout(() => {
            if (chatBox) {
              chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });
            }
          }, 100);

          input?.focus();
        }
      }
    }

    if (structureChanged) {
      renderExtremeCanvas(container, mode, modeConfig, container.__backendTraces, typeof state.phase === 'number' || state.phase === 'synthesis', true);
    } else if (textChanged) {
      if (typeof state.phase === 'number') {
        const currentLayerIdx = state.phase;
        const currentLayerNodes = originalBlueprint.filter(node => blueprintLayers[node.name] === currentLayerIdx);
        currentLayerNodes.forEach(node => {
          const nodeState = state.nodes[node.name];
          if (nodeState) {
            const nodeEl = container.querySelector(`[data-node-name="${node.name.replace(/"/g, '&quot;')}"]`);
            if (nodeEl) {
              const scrollEl = nodeEl.querySelector('.extreme-node-content-scroll');
              if (scrollEl) {
                scrollEl.textContent = nodeState.text;
                scrollEl.scrollTop = scrollEl.scrollHeight;
              }
              // Auto-scroll chatBox if the node expands beyond the bottom
              if (chatBox) {
                const rect = nodeEl.getBoundingClientRect();
                const chatRect = chatBox.getBoundingClientRect();
                if (rect.bottom > chatRect.bottom) {
                  chatBox.scrollTop += (rect.bottom - chatRect.bottom) + 20;
                }
              }
            }
          }
        });
      } else if (state.phase === 'synthesis') {
        const wrap = container.querySelector('.extreme-synthesis-body .msg-text');
        if (wrap) {
          const bodyContent = typeof marked !== 'undefined' ? marked.parse(state.synthesis.text) : `<p>${esc(state.synthesis.text)}</p>`;
          wrap.innerHTML = bodyContent;
        }
      }
    }
  }, 30);
}

// ── Pulse Loop Logic ────────────────────────────────────────────────────────
window.__pulseInterval = window.__pulseInterval || 30;
window.__pulseUnit = window.__pulseUnit || 'seconds';
window.__pulsePrompt = window.__pulsePrompt || 'Continue iteration based on the synthesis.';
window.__pulseCountdownStr = window.__pulseCountdownStr || '00:00';
window.__pulseActive = window.__pulseActive !== false; // default true when enabled
let _pulseTimerId = null;
let _pulseSecondsRemaining = 0;

function updatePulseCountdownStr() {
  const mins = Math.floor(_pulseSecondsRemaining / 60);
  const secs = _pulseSecondsRemaining % 60;
  window.__pulseCountdownStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  const display = document.getElementById('pulse-countdown-display');
  if (display) {
    display.textContent = window.__pulseCountdownStr;
  }
}

function startPulseLoopTimer() {
  stopPulseLoopTimer();
  if (!isPulseLoopMode() || window.__pulseActive === false) return;
  
  let totalSecs = window.__pulseInterval;
  if (window.__pulseUnit === 'minutes') totalSecs *= 60;
  if (window.__pulseUnit === 'hours') totalSecs *= 3600;
  
  _pulseSecondsRemaining = totalSecs;
  updatePulseCountdownStr();
  
  _pulseTimerId = setInterval(() => {
    _pulseSecondsRemaining--;
    if (_pulseSecondsRemaining <= 0) {
      stopPulseLoopTimer();
      _pulseSecondsRemaining = 0;
      updatePulseCountdownStr();
      triggerPulseIteration();
    } else {
      updatePulseCountdownStr();
    }
  }, 1000);
}

function stopPulseLoopTimer() {
  if (_pulseTimerId) {
    clearInterval(_pulseTimerId);
    _pulseTimerId = null;
  }
}

function triggerPulseIteration() {
  if (!isPulseLoopMode()) return;
  const inputEl = document.getElementById('user-input');
  const formEl = document.getElementById('chat-form');
  if (inputEl && formEl && window.__pulsePrompt) {
    inputEl.value = window.__pulsePrompt;
    // Dispatch submit event to trigger the existing chat-form flow
    formEl.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }
}

function renderExtremeCanvas(container, mode, modeConfig, traces, isLive, isTickerUpdate = false) {
  if (!container) return;

  const inferredMode = inferModeFromTraces(traces, mode);

  // Track parameters to support click-driven dynamic redrawing
  container.__lastMode = inferredMode;
  container.__lastModeConfig = modeConfig;
  container.__lastTraces = traces;
  container.__lastIsLive = isLive;

  const activeRunId = container.__activeRunId || window.__activeRunId || 'live-run';

  if (isLive) {
    if (!isTickerUpdate) {
      if (!window.__extremeStreamState || window.__extremeStreamState.runId !== activeRunId) {
        window.__extremeStreamState = {
          runId: activeRunId,
          phase: 0,
          nodes: {},
          synthesis: { text: '', wordIndex: 0, isFinished: false }
        };
      }
      container.__backendTraces = traces;
      if (!container.__streamTicker) {
        startStreamTicker(container, mode, modeConfig);
      } else {
        return;
      }
    }
  } else {
    if (container.__streamTicker) {
      clearInterval(container.__streamTicker);
      container.__streamTicker = null;
    }
  }

  // Register container-delegated click listener for expand/collapse actions
  if (!container.__delegatedClicksBound) {
    container.__delegatedClicksBound = true;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-toggle-expand]');
      if (!btn) return;

      const nodeName = btn.dataset.toggleExpand;
      window.__expandedNodes = window.__expandedNodes || new Set();

      if (window.__expandedNodes.has(nodeName)) {
        window.__expandedNodes.delete(nodeName);
      } else {
        window.__expandedNodes.add(nodeName);
      }

      if (container.__lastMode) {
        renderExtremeCanvas(
          container,
          container.__lastMode,
          container.__lastModeConfig,
          container.__lastTraces,
          container.__lastIsLive
        );
      }
    });

    // Pulse Loop Handlers
    container.addEventListener('input', (e) => {
      if (e.target.id === 'pulse-interval-input') {
        window.__pulseInterval = parseInt(e.target.value, 10) || 30;
        updatePulseCountdownStr();
      }
      if (e.target.id === 'pulse-prompt-input') {
        window.__pulsePrompt = e.target.value;
      }
    });

    container.addEventListener('change', (e) => {
      if (e.target.id === 'pulse-interval-unit') {
        window.__pulseUnit = e.target.value;
        updatePulseCountdownStr();
      }
    });

    container.addEventListener('click', (e) => {
      if (e.target.id === 'pulse-toggle-btn') {
        window.__pulseActive = !(window.__pulseActive !== false);
        e.target.textContent = window.__pulseActive ? 'Stop' : 'Start';
        e.target.style.color = window.__pulseActive ? '#ef4444' : '#10b981';
        e.target.style.borderColor = window.__pulseActive ? '#ef4444' : '#10b981';
        
        const display = container.querySelector('#pulse-countdown-display');
        if (display) {
          display.style.color = window.__pulseActive ? '#10b981' : '#ef4444';
        }
        
        if (window.__pulseActive) {
          startPulseLoopTimer();
        } else {
          stopPulseLoopTimer();
        }
      }
    });
  }

  const originalBlueprint = getAgentBlueprint(inferredMode, modeConfig, traces);
  let blueprint = [...originalBlueprint];

  const activeNames = new Set(blueprint.map(b => b.name));

  function getTransitiveInputs(nodeName, visited = new Set()) {
    if (visited.has(nodeName)) return [];
    visited.add(nodeName);

    const node = originalBlueprint.find(n => n.name === nodeName);
    if (!node) return [];

    let inputs = [];
    let rawInputs = [];
    const nodeIdx = originalBlueprint.findIndex(n => n.name === nodeName);

    if (inferredMode === 'custom' && modeConfig && modeConfig.agents) {
      let parentIndices = node.inputs || [];
      if (parentIndices.length === 0 && nodeIdx > 0) {
        parentIndices = [nodeIdx - 1];
      }
      parentIndices.forEach(parentIdx => {
        if (parentIdx >= 0 && parentIdx < modeConfig.agents.length) {
          rawInputs.push(modeConfig.agents[parentIdx].name || `Agent ${parentIdx + 1}`);
        }
      });
    } else {
      let parentIndices = node.inputs || [];
      if (parentIndices.length === 0 && nodeIdx > 0) {
        parentIndices = [nodeIdx - 1];
      }
      parentIndices.forEach(parentIdx => {
        if (parentIdx >= 0 && parentIdx < originalBlueprint.length) {
          rawInputs.push(originalBlueprint[parentIdx].name);
        }
      });
    }

    rawInputs.forEach(parentName => {
      if (activeNames.has(parentName)) {
        inputs.push(parentName);
      } else {
        inputs.push(...getTransitiveInputs(parentName, visited));
      }
    });
    return Array.from(new Set(inputs));
  }

  // Compute layers for all blueprint elements to determine streaming timeline
  const blueprintLayers = {};
  blueprint.forEach(node => blueprintLayers[node.name] = 0);

  let changed = true;
  for (let step = 0; step < blueprint.length + 5 && changed; step++) {
    changed = false;
    blueprint.forEach(node => {
      let maxParentLayer = -1;
      let parentIndices = node.inputs || [];
      if (parentIndices.length === 0 && blueprint.findIndex(n => n.name === node.name) > 0) {
        parentIndices = [blueprint.findIndex(n => n.name === node.name) - 1];
      }
      parentIndices.forEach(parentIdx => {
        if (parentIdx >= 0 && parentIdx < blueprint.length) {
          const parentName = blueprint[parentIdx].name;
          if (parentName in blueprintLayers) {
            maxParentLayer = Math.max(maxParentLayer, blueprintLayers[parentName] ?? -1);
          }
        }
      });
      if (maxParentLayer !== -1 && blueprintLayers[node.name] !== maxParentLayer + 1) {
        blueprintLayers[node.name] = maxParentLayer + 1;
        changed = true;
      }
    });
  }

  const agents = blueprint.map((node) => {
    const inputNames = getTransitiveInputs(node.name);

    let status = 'pending';
    let elapsed = 0;
    let snippet = 'Waiting...';
    let fullContent = '';
    let web_sources = [];

    const matchingTrace = (traces || []).find(t => t.agent === node.name);
    if (matchingTrace) {
      web_sources = matchingTrace.web_sources || [];
      status = matchingTrace.status || 'completed';
      if (status === 'ok') {
        status = 'completed';
      }
      elapsed = matchingTrace.elapsed_ms || 0;
      fullContent = matchingTrace.content || '';

      if (matchingTrace.content) {
        snippet = matchingTrace.content.slice(0, 80).replace(/\n/g, ' ') + (matchingTrace.content.length > 80 ? '...' : '');
      } else {
        snippet = status === 'running' ? 'Thinking...' : 'Waiting...';
      }
    }

    // Override status and content based on simulated stream timeline
    if (isLive && window.__extremeStreamState && window.__extremeStreamState.runId === activeRunId) {
      const nodeLayer = blueprintLayers[node.name] || 0;
      const currentPhase = window.__extremeStreamState.phase;

      if (typeof currentPhase === 'number') {
        if (nodeLayer === currentPhase) {
          status = 'running';
        } else if (nodeLayer < currentPhase) {
          status = 'completed';
        } else {
          status = 'pending';
        }
      } else {
        status = 'completed';
      }

      const nodeState = window.__extremeStreamState.nodes[node.name];
      if (nodeState) {
        fullContent = nodeState.text;
        if (nodeState.text) {
          snippet = nodeState.text.slice(0, 80).replace(/\n/g, ' ') + (nodeState.text.length > 80 ? '...' : '');
        } else {
          snippet = status === 'running' ? 'Thinking and analyzing...' : 'Waiting...';
        }
      } else {
        fullContent = '';
        snippet = status === 'running' ? 'Thinking and analyzing...' : 'Waiting...';
      }
    }

    return {
      name: node.name,
      inputs: inputNames,
      status: status,
      elapsed: elapsed,
      snippet: snippet,
      fullContent: fullContent,
      web_sources: web_sources
    };
  });

  const totalAgentsCount = originalBlueprint.length;
  const completedCount = agents.filter(a => a.status === 'completed').length;
  const remainingCount = Math.max(0, totalAgentsCount - completedCount);

  // SEQUENTIAL GRAPH VIEW: Filter out pending nodes to show progress step-by-step
  let activeAgents = [];
  if (isLive && window.__extremeStreamState && window.__extremeStreamState.runId === activeRunId) {
    const currentPhase = window.__extremeStreamState.phase;
    activeAgents = agents.filter(a => {
      if (a.status === 'skipped') return false;
      const nodeLayer = blueprintLayers[a.name] || 0;
      const hasTrace = (traces || []).some(t => t.agent === a.name);
      if (typeof currentPhase === 'number') {
        if (nodeLayer > currentPhase) return false;
        if (nodeLayer === currentPhase) return true;
        return hasTrace;
      }
      return hasTrace;
    });
  } else {
    activeAgents = agents.filter(a => a.status === 'running' || a.status === 'completed');
    if (activeAgents.length === 0 && agents.length > 0) {
      agents[0].status = 'running';
      agents[0].snippet = 'Initializing...';
      activeAgents = [agents[0]];
    }
  }

  // Limit wire connections strictly to active/visible nodes
  const activeNamesSet = new Set(activeAgents.map(a => a.name));
  activeAgents.forEach(a => {
    a.inputs = a.inputs.filter(parentName => activeNamesSet.has(parentName));
  });

  // Layering layout logic for active nodes
  const nodeLayers = {};
  activeAgents.forEach(a => nodeLayers[a.name] = 0);

  changed = true;
  for (let step = 0; step < activeAgents.length + 5 && changed; step++) {
    changed = false;
    activeAgents.forEach(a => {
      let maxParentLayer = -1;
      a.inputs.forEach(parentName => {
        if (parentName in nodeLayers) {
          maxParentLayer = Math.max(maxParentLayer, nodeLayers[parentName] ?? -1);
        }
      });
      if (maxParentLayer !== -1 && nodeLayers[a.name] !== maxParentLayer + 1) {
        nodeLayers[a.name] = maxParentLayer + 1;
        changed = true;
      }
    });
  }

  const layers = [];
  activeAgents.forEach(a => {
    const layerIdx = nodeLayers[a.name] || 0;
    if (!layers[layerIdx]) layers[layerIdx] = [];
    layers[layerIdx].push(a);
  });

  const cleanedLayers = layers.filter(l => l && l.length > 0);

  let layersHtml = '';
  cleanedLayers.forEach((layer) => {
    let nodesHtml = '';
    layer.forEach(node => {
      let statusClass = node.status;
      const isNodeRunning = node.status === 'running';
      const isManuallyExpanded = window.__expandedNodes && window.__expandedNodes.has(node.name);
      const isExpanded = isNodeRunning || isManuallyExpanded;

      const isFinalNode = (node.name === originalBlueprint.slice(-1)[0]?.name);
      const finalClass = isFinalNode ? 'extreme-agent-node-final' : '';

      // We no longer use manual expansion buttons, but we need to know if the content should be fully rendered (it's running or final)
      let isExpandedFinal = isFinalNode && (node.status === 'running' || node.status === 'completed');
      let isExpandedNode = isExpandedFinal || node.status === 'running';
      let toggleBtnHtml = ''; // Fix ReferenceError

      let bodyContent = node.fullContent || '';
      let summaryText = node.snippet || '';

      // Try to parse out the SUMMARY block if it exists
      if (bodyContent.includes('SUMMARY:')) {
        const parts = bodyContent.split('SUMMARY:');
        bodyContent = parts[0].trim();
        summaryText = parts[1].trim();
      }

      let contentHtml = '';
      if (isExpandedNode) {
        if (isFinalNode && window.__extremeStreamState && (window.__extremeStreamState.phase === 'synthesis' || window.__extremeStreamState.phase === 'finished')) {
          bodyContent = window.__extremeStreamState.synthesis.text;
        }

        bodyContent = bodyContent || (isNodeRunning ? 'Thinking and analyzing...' : 'No output content.');

        if (isFinalNode && typeof marked !== 'undefined' && node.status === 'completed') {
          let parsedFinal = marked.parse(bodyContent);
          if (container.__finalBodyHtml) {
            parsedFinal = container.__finalBodyHtml;
          }
          contentHtml = `<div class="extreme-node-content-scroll markdown-body" style="margin-top: 8px; font-size: 1.05rem; color: var(--text); line-height: 1.65; max-height: none; text-align: left; padding: 12px; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--glass-border); border-radius: 6px; white-space: normal; word-break: break-word; overflow: visible;">${parsedFinal}</div>`;
        } else {
          contentHtml = `<div class="extreme-node-content-scroll" style="margin-top: 8px; font-size: 0.95rem; color: var(--text); line-height: 1.5; max-height: none; text-align: left; padding: 12px; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--glass-border); border-radius: 6px; white-space: pre-wrap; word-break: break-word; font-family: inherit; overflow: visible;">${esc(bodyContent)}</div>`;
        }
      } else {
        // For non-final nodes, render the full content, but CSS will hide it unless hovered
        let displaySummary = summaryText || (isNodeRunning ? 'Thinking...' : esc(node.snippet));
        if (node.status === 'skipped') displaySummary = '⏭ Skipped by routing logic';
        
        contentHtml = `
          <div class="extreme-node-status ${statusClass === 'running' ? 'running-text' : ''}" style="font-size: 0.68rem; color: var(--text-muted); margin-top: 4px; font-weight: 600;">${esc(displaySummary)}</div>
          <div class="extreme-node-content-scroll" style="margin-top: 8px; font-size: 0.9rem; color: var(--text); line-height: 1.5; max-height: 500px; overflow-y: auto; text-align: left; padding: 12px; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--glass-border); border-radius: 6px; white-space: pre-wrap; word-break: break-word; font-family: inherit; display: none;">${esc(bodyContent)}</div>
        `;
      }

      if (node.web_sources && node.web_sources.length > 0) {
        const urls = node.web_sources.map(w => `<a href="${esc(w.url)}" target="_blank" style="color:var(--primary);text-decoration:underline;pointer-events:all;">${esc(w.title || w.url)}</a>`).join(', ');
        contentHtml += `<div class="extreme-node-search-badge" style="margin-top:8px;padding:6px;border-radius:6px;background:var(--code-bg);border:1px solid var(--primary);font-size:0.7rem;opacity:0.9;">🌐 <strong>Searched Web:</strong> ${urls}</div>`;
      }

      let timerHeaderHtml = '';
      if (isFinalNode && isLive) {
        const elapsedSec = window.__runStartTime ? Math.floor((Date.now() - window.__runStartTime) / 1000) : 0;
        const loadingMessage = elapsedSec > 30 ? '🐢 Running deep reasoning...' : '⚡ Orchestrating network...';
        timerHeaderHtml = `
          <span style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.85; margin-left: 8px; display:inline-flex; align-items:center; gap:4px; font-weight:normal;">
            <span class="extreme-status-spinner" style="width: 10px; height: 10px; border: 1.5px solid var(--primary); border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 1s linear infinite;"></span>
            <span class="extreme-live-status-message">${loadingMessage}</span>
            (<span class="extreme-live-elapsed-time">${elapsedSec}s</span>)
          </span>
        `;
      } else if (node.status === 'skipped') {
        timerHeaderHtml = `<span class="extreme-node-elapsed" style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.85; margin-left: 8px; font-weight:normal;">⏭ Skipped</span>`;
      } else if (node.elapsed) {
        timerHeaderHtml = `<span class="extreme-node-elapsed" style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.85; margin-left: 8px; font-weight:normal;">⏱ ${(node.elapsed / 1000).toFixed(2)}s</span>`;
      }

      let nodeStyle = '';
      if (node.status === 'skipped') {
        nodeStyle = 'display: none !important;';
      }

      nodesHtml += `
        <div class="extreme-agent-node ${statusClass} ${finalClass} ${isExpandedFinal ? 'expanded' : 'collapsed'}" data-node-name="${esc(node.name)}" style="transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); ${nodeStyle}">
          <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
            <div class="extreme-node-label" style="margin:0;">${isFinalNode ? 'Synthesis & Output' : 'Agent'}</div>
            ${isExpandedFinal ? toggleBtnHtml : ''}
          </div>
          <div class="extreme-node-name" style="${isFinalNode ? 'font-size: 0.9rem; color: var(--primary);' : ''}">
            ${esc(node.name)}
            ${timerHeaderHtml}
          </div>
          ${contentHtml}
          <div style="display:flex; justify-content:flex-end; align-items:center; margin-top:4px; width:100%;">
            ${!isExpandedFinal ? toggleBtnHtml : ''}
          </div>
        </div>
      `;
    });

    layersHtml += `
      <div class="extreme-layer-row" style="display:flex; justify-content:center; gap:24px; width:100%; flex-wrap:wrap; z-index:2;">
        ${nodesHtml}
      </div>
    `;
  });

  if (isPulseLoopMode()) {
    const pulseInterval = window.__pulseInterval || 30;
    const pulseUnit = window.__pulseUnit || 'seconds';
    const pulsePrompt = window.__pulsePrompt || 'Continue iteration based on the synthesis.';
    const pulseCountdown = window.__pulseCountdownStr || '00:00';
    const pulseActive = window.__pulseActive !== false;

    const leftWallHtml = `
      <div class="extreme-layer-row extreme-wall-row" style="display:flex; justify-content:center; gap:24px; width:100%; flex-wrap:wrap; z-index:2; margin-bottom: 12px;">
        <div class="extreme-agent-node extreme-wall-node pulse-left-wall" data-node-name="pulse-left-wall" style="background: rgba(16, 185, 129, 0.05); border: 1px solid #10b981; box-shadow: 0 0 15px rgba(16, 185, 129, 0.2); min-width: 200px;">
          <div class="extreme-node-label" style="color: #10b981; text-align: center;">Pulse Source</div>
          <div class="extreme-node-name" style="font-size: 0.9rem; text-align: center; border-bottom: 1px solid rgba(16, 185, 129, 0.3); padding-bottom: 6px; margin-bottom: 6px;">Iteration Start</div>
          <div style="font-size: 0.7rem; color: var(--text-muted); text-align: center;">Autonomous loop activated.</div>
        </div>
      </div>
    `;

    const rightWallHtml = `
      <div class="extreme-layer-row extreme-wall-row" style="display:flex; justify-content:center; gap:24px; width:100%; flex-wrap:wrap; z-index:2; margin-top: 12px;">
        <div class="extreme-agent-node extreme-wall-node pulse-right-wall" data-node-name="pulse-right-wall" style="background: rgba(16, 185, 129, 0.05); border: 1px solid #10b981; box-shadow: 0 0 15px rgba(16, 185, 129, 0.2); min-width: 280px;">
          <div class="extreme-node-label" style="color: #10b981; text-align: center;">Pulse Control</div>
          <div class="extreme-node-name" style="font-size: 0.9rem; margin-bottom: 8px; text-align: center; border-bottom: 1px solid rgba(16, 185, 129, 0.3); padding-bottom: 6px;">Next Iteration</div>
          
          <div style="display:flex; flex-direction:column; gap:8px; width: 100%;">
            <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(0,0,0,0.4); padding: 12px; border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.2);">
              <div id="pulse-countdown-display" style="font-family: monospace; font-size: 1.5rem; font-weight: bold; color: ${pulseActive ? '#10b981' : '#ef4444'}; text-shadow: 0 0 10px rgba(16, 185, 129, 0.5);">${pulseCountdown}</div>
              <button id="pulse-toggle-btn" class="hdr-btn" style="border-color: ${pulseActive ? '#ef4444' : '#10b981'}; color: ${pulseActive ? '#ef4444' : '#10b981'}; font-size: 0.75rem; padding: 4px 12px;">${pulseActive ? 'Stop' : 'Start'}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    layersHtml = leftWallHtml + layersHtml + rightWallHtml;
  }

  const newContainerHtml = `
    <div class="extreme-layers-container-wrap" style="position:relative; width:100%;">
      <svg class="extreme-connections-svg" style="position:absolute; top:0; left:0; pointer-events:none; width:100%; height:100%; z-index: 1;"></svg>
      <div class="extreme-layers-wrap" style="position:relative; display:flex; flex-direction:column; align-items:center; gap:48px; z-index: 2; width:100%;">
        ${layersHtml}
      </div>
    </div>
  `;

  if (isLive && isTickerUpdate && container.firstElementChild) {
    const existingWrap = container.querySelector('.extreme-layers-wrap');
    if (existingWrap) {
      const temp = document.createElement('div');
      temp.innerHTML = layersHtml;
      const newRows = Array.from(temp.children);

      newRows.forEach((newRow, rIdx) => {
        if (rIdx < existingWrap.children.length) {
          const oldRow = existingWrap.children[rIdx];
          const newNodes = Array.from(newRow.children);
          newNodes.forEach(newNode => {
            const nodeName = newNode.dataset.nodeName;
            const oldNode = oldRow.querySelector(`[data-node-name="${nodeName.replace(/"/g, '&quot;')}"]`);
            if (oldNode) {
              oldNode.className = newNode.className;
              // Skip updating innerHTML for right wall so we don't lose input state
              if (nodeName !== 'pulse-right-wall') {
                oldNode.innerHTML = newNode.innerHTML;
              }
            } else {
              oldRow.appendChild(newNode);
            }
          });
        } else {
          existingWrap.appendChild(newRow);
        }
      });

      // Removing liveSynthesisHtml and statWrap handling since they are removed from layout
    } else {
      container.innerHTML = newContainerHtml;
    }
  } else {
    container.innerHTML = newContainerHtml;
  }

  container.__agents = activeAgents;

  if (typeof ResizeObserver !== 'undefined' && !container.__resizeObserver) {
    container.__resizeObserver = new ResizeObserver(() => {
      if (container.__agents) {
        drawExtremeConnections(container, container.__agents);
      }
    });
    container.__resizeObserver.observe(container);
  }

  // Continuous 60fps tracking during live runs for smooth card resize transitions
  if (isLive && !container.__animationFrameBound) {
    container.__animationFrameBound = true;
    const updateLoop = () => {
      if (!container.__lastIsLive) {
        container.__animationFrameBound = false;
        return;
      }
      if (container.__agents) {
        drawExtremeConnections(container, container.__agents);
      }
      requestAnimationFrame(updateLoop);
    };
    requestAnimationFrame(updateLoop);
  }

  requestAnimationFrame(() => {
    drawExtremeConnections(container, activeAgents);
  });
}

function drawExtremeConnections(container, agents) {
  const svg = container.querySelector('.extreme-connections-svg');
  if (!svg) return;

  const layoutWrap = svg.parentElement;
  const containerRect = layoutWrap.getBoundingClientRect();
  if (containerRect.width === 0) return;

  svg.setAttribute('width', containerRect.width);
  svg.setAttribute('height', containerRect.height);
  svg.innerHTML = '';

  agents.forEach(child => {
    const childEl = container.querySelector(`[data-node-name="${esc(child.name)}"]`);
    if (!childEl) return;
    const childRect = childEl.getBoundingClientRect();

    const childX = childRect.left - containerRect.left + childRect.width / 2;
    const childY = childRect.top - containerRect.top;

    child.inputs.forEach(parentName => {
      const parentEl = container.querySelector(`[data-node-name="${esc(parentName)}"]`);
      if (!parentEl) return;
      const parentRect = parentEl.getBoundingClientRect();

      const parentX = parentRect.left - containerRect.left + parentRect.width / 2;
      const parentY = parentRect.top - containerRect.top + parentRect.height;

      const cp1X = parentX;
      const cp1Y = parentY + (childY - parentY) / 2;
      const cp2X = childX;
      const cp2Y = childY - (childY - parentY) / 2;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${parentX} ${parentY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${childX} ${childY}`);

      path.setAttribute('class', 'extreme-wire ' + child.status);
      svg.appendChild(path);
    });
  });

  if (isPulseLoopMode()) {
    // Draw Left Wall -> First Layer
    const leftWall = container.querySelector('[data-node-name="pulse-left-wall"]');
    if (leftWall) {
      const parentRect = leftWall.getBoundingClientRect();
      const parentX = parentRect.left - containerRect.left + parentRect.width / 2;
      const parentY = parentRect.top - containerRect.top + parentRect.height;

      agents.filter(a => a.inputs.length === 0).forEach(child => {
        const childEl = container.querySelector(`[data-node-name="${esc(child.name)}"]`);
        if (!childEl) return;
        const childRect = childEl.getBoundingClientRect();
        const childX = childRect.left - containerRect.left + childRect.width / 2;
        const childY = childRect.top - containerRect.top;

        const cp1X = parentX;
        const cp1Y = parentY + (childY - parentY) / 2;
        const cp2X = childX;
        const cp2Y = childY - (childY - parentY) / 2;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${parentX} ${parentY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${childX} ${childY}`);
        path.setAttribute('class', 'extreme-wire completed');
        svg.appendChild(path);
      });
    }

    // Draw Final Node -> Right Wall
    const rightWall = container.querySelector('[data-node-name="pulse-right-wall"]');
    if (rightWall && agents.length > 0) {
      const finalEl = container.querySelector('.extreme-agent-node-final');
      if (finalEl) {
        const parentRect = finalEl.getBoundingClientRect();
        const parentX = parentRect.left - containerRect.left + parentRect.width / 2;
        const parentY = parentRect.top - containerRect.top + parentRect.height;

        const childRect = rightWall.getBoundingClientRect();
        const childX = childRect.left - containerRect.left + childRect.width / 2;
        const childY = childRect.top - containerRect.top;

        const cp1X = parentX;
        const cp1Y = parentY + (childY - parentY) / 2;
        const cp2X = childX;
        const cp2Y = childY - (childY - parentY) / 2;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${parentX} ${parentY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${childX} ${childY}`);
        path.setAttribute('class', 'extreme-wire completed');
        svg.appendChild(path);
      }
    }
  }
}

function renderReasoningGraph(container, mode, modeConfig, traces) {
  if (!container) return;
  const originalBlueprint = getAgentBlueprint(mode, modeConfig, traces);
  let blueprint = [...originalBlueprint];
  const isFinished = !container.classList.contains('polling-active');

  if (isFinished) {
    blueprint = blueprint.filter(node => {
      const hasTrace = (traces || []).some(t => t.agent === node.name);
      const isCore = ['Classifier', 'Synthesizer', 'Assistant', 'Historian', 'BugChecker'].includes(node.name);
      return hasTrace || isCore;
    });
  }

  const activeNames = new Set(blueprint.map(b => b.name));

  function getTransitiveInputs(nodeName, visited = new Set()) {
    if (visited.has(nodeName)) return [];
    visited.add(nodeName);

    const node = originalBlueprint.find(n => n.name === nodeName);
    if (!node) return [];

    let inputs = [];
    let rawInputs = [];
    if (mode === 'custom' && modeConfig && modeConfig.agents) {
      const parentIndices = node.inputs || [];
      parentIndices.forEach(parentIdx => {
        if (parentIdx >= 0 && parentIdx < modeConfig.agents.length) {
          rawInputs.push(modeConfig.agents[parentIdx].name || `Agent ${parentIdx + 1}`);
        }
      });
    } else {
      const parentIndices = node.inputs || [];
      parentIndices.forEach(parentIdx => {
        if (parentIdx >= 0 && parentIdx < originalBlueprint.length) {
          rawInputs.push(originalBlueprint[parentIdx].name);
        }
      });
    }

    rawInputs.forEach(parentName => {
      if (activeNames.has(parentName)) {
        inputs.push(parentName);
      } else {
        inputs.push(...getTransitiveInputs(parentName, visited));
      }
    });
    return Array.from(new Set(inputs));
  }

  const agents = blueprint.map((node) => {
    const inputNames = getTransitiveInputs(node.name);

    let status = 'pending';
    let elapsed = 0;
    const matchingTrace = (traces || []).find(t => t.agent === node.name);
    if (matchingTrace) {
      status = matchingTrace.status || 'completed';
      elapsed = matchingTrace.elapsed_ms || 0;
    }

    return {
      name: node.name,
      inputs: inputNames,
      status: status,
      elapsed: elapsed
    };
  });

  const nodeLayers = {};
  agents.forEach(a => nodeLayers[a.name] = 0);

  let changed = true;
  for (let step = 0; step < agents.length + 5 && changed; step++) {
    changed = false;
    agents.forEach(a => {
      let maxParentLayer = -1;
      a.inputs.forEach(parentName => {
        maxParentLayer = Math.max(maxParentLayer, nodeLayers[parentName] ?? -1);
      });
      if (maxParentLayer !== -1 && nodeLayers[a.name] !== maxParentLayer + 1) {
        nodeLayers[a.name] = maxParentLayer + 1;
        changed = true;
      }
    });
  }

  const layers = [];
  agents.forEach(a => {
    const layerIdx = nodeLayers[a.name] || 0;
    if (!layers[layerIdx]) layers[layerIdx] = [];
    layers[layerIdx].push(a);
  });

  const cleanedLayers = layers.filter(l => l && l.length > 0);

  let layersHtml = '';
  cleanedLayers.forEach((layer) => {
    let nodesHtml = '';
    layer.forEach(node => {
      let statusClass = 'pending';
      let icon = '⭕';
      let spinnerHtml = '';
      if (node.status === 'running') {
        statusClass = 'running';
        icon = '⚙️';
        spinnerHtml = `<span class="agent-spinner"></span>`;
      } else if (node.status === 'completed') {
        statusClass = 'completed';
        icon = '✅';
      }

      const elapsedText = node.elapsed ? `<span class="node-elapsed">${node.elapsed}ms</span>` : '';

      nodesHtml += `
        <div class="reasoning-node ${statusClass}" data-node-name="${esc(node.name)}">
          <div class="node-badge">${spinnerHtml}${icon}</div>
          <div class="node-details">
            <span class="node-name">${esc(node.name)}</span>
            ${elapsedText}
          </div>
        </div>
      `;
    });

    layersHtml += `
      <div class="reasoning-layer">
        ${nodesHtml}
      </div>
    `;
  });

  container.innerHTML = `
    <svg class="graph-connections-svg" style="position:absolute; top:0; left:0; pointer-events:none; width:100%; height:100%; z-index: 1;"></svg>
    <div class="graph-layers-wrap" style="position:relative; display:flex; justify-content:space-around; align-items:center; gap:20px; z-index: 2; width:100%; min-height: 100px;">
      ${layersHtml}
    </div>
  `;

  container.__agents = agents;

  if (typeof ResizeObserver !== 'undefined' && !container.__resizeObserver) {
    container.__resizeObserver = new ResizeObserver(() => {
      if (container.__agents) {
        drawSVGConnections(container, container.__agents);
      }
    });
    container.__resizeObserver.observe(container);
  }

  requestAnimationFrame(() => {
    drawSVGConnections(container, agents);
  });
}

function drawSVGConnections(container, agents) {
  const svg = container.querySelector('.graph-connections-svg');
  if (!svg) return;

  const containerRect = container.getBoundingClientRect();
  if (containerRect.width === 0) return;
  svg.setAttribute('width', containerRect.width);
  svg.setAttribute('height', containerRect.height);
  svg.innerHTML = '';

  agents.forEach(child => {
    const childEl = container.querySelector(`[data-node-name="${esc(child.name)}"]`);
    if (!childEl) return;
    const childRect = childEl.getBoundingClientRect();
    const childX = childRect.left - containerRect.left;
    const childY = childRect.top - containerRect.top + childRect.height / 2;

    child.inputs.forEach(parentName => {
      const parentEl = container.querySelector(`[data-node-name="${esc(parentName)}"]`);
      if (!parentEl) return;
      const parentRect = parentEl.getBoundingClientRect();
      const parentX = parentRect.left - containerRect.left + parentRect.width;
      const parentY = parentRect.top - containerRect.top + parentRect.height / 2;

      const cp1X = parentX + (childX - parentX) / 2;
      const cp1Y = parentY;
      const cp2X = parentX + (childX - parentX) / 2;
      const cp2Y = childY;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${parentX} ${parentY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${childX} ${childY}`);

      let strokeColor = 'rgba(255, 255, 255, 0.15)';
      let dashArray = '4,4';
      let strokeWidth = '1.5';

      if (child.status === 'completed') {
        strokeColor = '#10b981';
        dashArray = 'none';
        strokeWidth = '2';
      } else if (child.status === 'running') {
        strokeColor = '#8b5cf6';
        dashArray = '4,4';
        strokeWidth = '2';
      }

      path.setAttribute('stroke', strokeColor);
      path.setAttribute('stroke-width', strokeWidth);
      path.setAttribute('fill', 'none');
      if (dashArray !== 'none') {
        path.setAttribute('stroke-dasharray', dashArray);
      }

      svg.appendChild(path);
    });
  });
}

let activeRunId = null;
let pollingInterval = null;

function startPollingRun(runId, mode, customMode) {
  if (pollingInterval) clearInterval(pollingInterval);
  activeRunId = runId;
  pollingInterval = setInterval(async () => {
    if (activeRunId !== runId) {
      clearInterval(pollingInterval);
      return;
    }
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) return;
      const data = await res.json();
      const runState = data.run;
      if (runState && runState.result) {
        if (isAgentExtremeMode()) {
          const extremeContainer = document.getElementById('live-extreme-canvas');
          if (extremeContainer) {
            extremeContainer.__activeRunId = runId;
            renderExtremeCanvas(extremeContainer, mode, customMode, runState.result.traces || [], true);
          }
        } else {
          const graphContainer = document.getElementById('live-reasoning-graph');
          if (graphContainer) {
            renderReasoningGraph(graphContainer, mode, customMode, runState.result.traces || []);
          }
        }
      }
    } catch (e) {
      console.error('Error polling run traces:', e);
    }
  }, 600);
}

function stopPollingRun() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  activeRunId = null;
}

window.redrawCompletedGraph = function (detailsEl, graphId) {
  const container = document.getElementById(graphId);
  if (container && detailsEl.open && container.__traces) {
    renderReasoningGraph(container, container.__mode, container.__customMode, container.__traces);
  }
};

function showTyping() {
  const mode = getActiveMode();
  const customMode = getCustomModeById(mode);

  window.__runStartTime = Date.now();
  if (window.__typingTimer) clearInterval(window.__typingTimer);

  const div = document.createElement('div');
  div.id = 'typing';

  if (isAgentExtremeMode()) {
    div.className = 'extreme-canvas-card';
    div.innerHTML = `<div id="live-extreme-canvas" style="position:relative; width:100%;"></div>`;
  } else if (mode === 'direct' || mode === 'conversational') {
    div.className = 'msg assistant typing-indicator';
    div.style.cssText = 'display: flex; flex-direction: column; align-items: flex-start; gap: 8px;';
    div.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="display: flex; gap: 5px; align-items: center;">
          <span></span><span></span><span></span>
        </div>
        <div class="conversational-timer-text" style="font-size: 0.72rem; color: var(--text-muted); font-weight: 500;">Thinking... (0s)</div>
      </div>
      <div class="conversational-long-warning-container"></div>
    `;
  } else {
    div.className = 'msg assistant graph-typing';
    const modeLabelRaw = customMode ? customMode.name : mode.replace('reasoning_', '').replace(/_/g, ' ');
    const modeLabel = modeLabelRaw.charAt(0).toUpperCase() + modeLabelRaw.slice(1);
    div.innerHTML = `
      <div class="role">AI</div>
      <div class="reasoning-graph-title">
        <span class="agent-spinner"></span>
        <span>Reasoning Workflow: ${esc(modeLabel)} (0s)</span>
      </div>
      <div id="live-reasoning-graph" class="reasoning-graph-container polling-active"></div>
    `;
  }

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;

  if (isAgentExtremeMode()) {
    const extremeContainer = div.querySelector('#live-extreme-canvas');
    if (extremeContainer) {
      extremeContainer.__activeRunId = window.__activeRunId;
      renderExtremeCanvas(extremeContainer, mode, customMode, [], true);
    }
  } else {
    const graphContainer = div.querySelector('#live-reasoning-graph');
    if (graphContainer) {
      renderReasoningGraph(graphContainer, mode, customMode, []);
    }
  }

  // Start unified active timer
  window.__typingTimer = setInterval(() => {
    const typingDiv = document.getElementById('typing');
    if (!typingDiv) {
      clearInterval(window.__typingTimer);
      return;
    }
    const elapsedSec = Math.floor((Date.now() - window.__runStartTime) / 1000);

    if (isAgentExtremeMode()) {
      const elapsedSpan = typingDiv.querySelector('.extreme-live-elapsed-time');
      if (elapsedSpan) {
        elapsedSpan.textContent = elapsedSec + 's';
      }
      if (elapsedSec > 30) {
        const msgSpan = typingDiv.querySelector('.extreme-live-status-message');
        if (msgSpan && !msgSpan.dataset.longRunning) {
          msgSpan.textContent = '🐢 Running deep reasoning pipeline... (With multiple agents, this can take a few minutes)';
          msgSpan.dataset.longRunning = '1';
        }
      }
    } else if (mode === 'direct' || mode === 'conversational') {
      const timerText = typingDiv.querySelector('.conversational-timer-text');
      if (timerText) timerText.textContent = `Thinking... (${elapsedSec}s)`;

      const warnContainer = typingDiv.querySelector('.conversational-long-warning-container');
      if (elapsedSec > 30 && warnContainer && !warnContainer.querySelector('.conversational-long-warning')) {
        const warnDiv = document.createElement('div');
        warnDiv.className = 'conversational-long-warning';
        warnDiv.style.cssText = 'font-size: 0.72rem; color: var(--text-muted); opacity: 0.85; margin-top: 6px; animation: fadeIn 0.3s ease both;';
        warnDiv.textContent = '⚠️ Vibe Engine is crafting a response. With larger models, this can sometimes take longer...';
        warnContainer.appendChild(warnDiv);
      }
    } else {
      const graphTitle = typingDiv.querySelector('.reasoning-graph-title span:last-child');
      if (graphTitle) {
        const modeLabelRaw = customMode ? customMode.name : mode.replace('reasoning_', '').replace(/_/g, ' ');
        const modeLabel = modeLabelRaw.charAt(0).toUpperCase() + modeLabelRaw.slice(1);
        graphTitle.textContent = `Reasoning Workflow: ${modeLabel} (${elapsedSec}s)`;
      }

      const graphContainer = typingDiv.querySelector('.reasoning-graph-container');
      if (graphContainer && elapsedSec > 30) {
        let warnEl = typingDiv.querySelector('.graph-long-warning');
        if (!warnEl) {
          warnEl = document.createElement('div');
          warnEl.className = 'graph-long-warning';
          warnEl.style.cssText = 'margin-top: 12px; font-size: 0.72rem; color: var(--text-muted); text-align: center; width: 100%; opacity: 0.85; animation: fadeIn 0.3s ease both;';
          warnEl.textContent = '⚠️ Running multi-agent chain. With multiple agents, this can take a few minutes...';
          typingDiv.appendChild(warnEl);
        }
      }
    }
  }, 1000);
}

function removeTyping() {
  stopPollingRun();
  if (window.__typingTimer) {
    clearInterval(window.__typingTimer);
    window.__typingTimer = null;
  }
  document.getElementById('typing')?.remove();
}

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

/* ── Memory Center ───────────────────────────────────────────── */
async function openMemory(tab = 'shared') {
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
  if (!memoryData || !memoryContent) {
    if (memoryContent) memoryContent.textContent = 'Loading…';
    return;
  }
  const help = document.getElementById('memory-help');
  if (tab === 'shared') {
    if (help) help.textContent = 'Shared notes are visible to all mission agents. You can edit them here; agents may add important cross-agent facts when they explicitly output a shared memory update.';
    const shared = localStorage.getItem('ai_global_shared_memory') || '';
    memoryContent.innerHTML =
      `<textarea id="shared-memory-editor" style="width:100%;min-height:300px;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-family:inherit;resize:vertical;" placeholder="Facts, preferences, or project-wide notes every agent should know...">${esc(shared)}</textarea>
         <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
           <button id="shared-memory-clear" class="hdr-btn" type="button">Clear</button>
           <button id="shared-memory-save" class="hdr-btn" type="button">Save Shared Notes</button>
         </div>`;
    document.getElementById('shared-memory-save')?.addEventListener('click', () => {
      const val = document.getElementById('shared-memory-editor')?.value || '';
      localStorage.setItem('ai_global_shared_memory', val.trim());
      showToast('Shared memory saved.', 'success', 1600);
    });
    document.getElementById('shared-memory-clear')?.addEventListener('click', () => {
      const ed = document.getElementById('shared-memory-editor');
      if (ed && confirm('Clear shared memory notes?')) {
        ed.value = '';
        localStorage.removeItem('ai_global_shared_memory');
        showToast('Shared memory cleared.', 'success', 1600);
      }
    });
  } else if (tab === 'agents') {
    if (help) help.textContent = 'Each Mission Hub agent has private memory. Agents can add important notes themselves, and you can edit or clear those notes here.';
    const rows = (missionAgents || []).map(agent => {
      return `<section style="border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--header-bg);margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <strong style="font-size:.82rem;">${esc(agent.name || 'Agent')}</strong>
            <span style="font-size:.68rem;color:var(--text-muted);">${esc(agent.project_id ? 'Project agent' : 'Independent agent')}</span>
            <button class="hdr-btn" type="button" data-agent-memory-save="${esc(agent.id)}" style="margin-left:auto;">Save</button>
          </div>
          <textarea data-agent-memory-editor="${esc(agent.id)}" style="width:100%;min-height:110px;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-family:inherit;resize:vertical;" placeholder="Private memory for this agent...">${esc(agent.memory_notes || '')}</textarea>
        </section>`;
    }).join('');
    memoryContent.innerHTML = rows || '<div style="font-size:.8rem;color:var(--text-muted);">No agents yet. Create agents in Mission Hub to give them private memory.</div>';
  } else if (tab === 'system') {
    if (help) help.textContent = 'System notes are read-only background material used by the reasoning pipeline. The old “manifesto” lives here now so it is less mysterious.';
    memoryContent.innerHTML =
      `<details open style="margin-bottom:10px;"><summary style="cursor:pointer;font-weight:700;">Core System Notes</summary><pre style="white-space:pre-wrap;margin-top:8px;">${esc(memoryData.manifesto || '(empty)')}</pre></details>
         <details><summary style="cursor:pointer;font-weight:700;">Typed Memory</summary><pre style="white-space:pre-wrap;margin-top:8px;">${esc(JSON.stringify(memoryData.typed_memory || {}, null, 2))}</pre></details>`;
  } else if (tab === 'activity') {
    if (help) help.textContent = 'Read-only logs of notable past failures, historian notes, and thought journal entries. Heuristics are intentionally dormant for now.';
    memoryContent.innerHTML =
      `<details open style="margin-bottom:10px;"><summary style="cursor:pointer;font-weight:700;">Failures</summary><pre style="white-space:pre-wrap;margin-top:8px;">${esc(JSON.stringify(memoryData.failures || {}, null, 2))}</pre></details>
         <details style="margin-bottom:10px;"><summary style="cursor:pointer;font-weight:700;">Historian Notes</summary><pre style="white-space:pre-wrap;margin-top:8px;">${esc(JSON.stringify(memoryData.historian_notes || {}, null, 2))}</pre></details>
         <details><summary style="cursor:pointer;font-weight:700;">Thought Journal</summary><pre style="white-space:pre-wrap;margin-top:8px;">${esc(JSON.stringify(memoryData.thought_journal || {}, null, 2))}</pre></details>`;
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

memoryBtn?.addEventListener('click', () => openMemory('shared'));
memoryClose?.addEventListener('click', () => memoryModal?.classList.remove('open'));
memoryModal?.addEventListener('click', (e) => {
  if (e.target === memoryModal) {
    memoryModal.classList.remove('open');
    return;
  }
  const saveBtn = e.target && e.target.closest && e.target.closest('[data-agent-memory-save]');
  if (saveBtn) {
    const agentId = saveBtn.getAttribute('data-agent-memory-save');
    const agent = missionAgents.find(a => a.id === agentId);
    const editor = memoryModal.querySelector(`[data-agent-memory-editor="${CSS.escape(agentId)}"]`);
    if (agent && editor) {
      agent.memory_notes = String(editor.value || '').slice(0, 12000);
      saveMissionAgents(missionAgents);
      renderMissionProjects();
      showToast('Agent memory saved.', 'success', 1600);
    }
  }
});
document.querySelectorAll('.memory-tab').forEach(btn => {
  btn.addEventListener('click', () => setMemoryTab(btn.dataset.tab));
});

missionBtn?.addEventListener('click', openMissionPage);
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

function setAgentChatContextOpen(open) {
  const isOpen = !!open;
  agentChatModal?.classList.toggle('context-open', isOpen);
  if (agentChatContextToggle) {
    agentChatContextToggle.textContent = isOpen ? 'Hide Context' : 'Show Context';
    agentChatContextToggle.title = isOpen ? 'Hide context panel' : 'Show context panel';
  }
}

const closeAgentChatModal = () => {
  agentChatModal?.classList.remove('open');
  setAgentChatContextOpen(false);
  missionOpenAgentId = '';
};

const closeAgentChatPreviewModal = () => {
  agentChatPreviewModal?.classList.remove('open');
  if (!agentChatModal?.classList.contains('open')) {
    missionOpenAgentId = '';
  }
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
agentChatContextToggle?.addEventListener('click', () => {
  const isOpen = agentChatModal?.classList.contains('context-open');
  setAgentChatContextOpen(!isOpen);
});
agentChatContextClose?.addEventListener('click', () => setAgentChatContextOpen(false));
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
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    agentChatSend?.click();
  }
});

function expandPreviewToFullChat(openContext = false) {
  const aid = missionOpenAgentId;
  if (!aid) return;
  const agent = missionAgents.find(a => a.id === aid);
  const sid = String(agent?.chat_id || '').trim();
  if (!agent || !sid || !store.sessions[sid]) {
    showToast('Agent has no linked full chat.', 'error');
    return;
  }
  // Close modals
  agentChatPreviewModal?.classList.remove('open');
  agentChatModal?.classList.remove('open');
  // Close Mission Hub if open
  if (document.body.classList.contains('mission-open')) {
    if (typeof closeMissionPage === 'function') closeMissionPage();
  }
  // Switch session without page reload
  store.currentId = sid;
  saveStore(store);
  sessionMessages = store.sessions[sid].messages || [];
  // Re-render chat box from the new session
  if (chatBox) {
    chatBox.innerHTML = '';
    const msgs = store.sessions[sid].messages || [];
    msgs.forEach(m => {
      if (m.role === 'user') addUserMsg(m.content, false);
      else addAssistantMsg(m.content || '', m.classification, m.traces || [], false, m.web_sources || []);
    });
  }
  renderHistory();
  renderWelcomeState?.();
  showToast(`Opened: ${agent.name || 'Agent'} chat`, 'success', 1400);
  if (openContext) {
    setTimeout(() => {
      document.getElementById('agent-chat-context-toggle')?.click();
    }, 150);
  }
}

agentChatPreviewClose?.addEventListener('click', closeAgentChatPreviewModal);
agentChatPreviewExpand?.addEventListener('click', () => expandPreviewToFullChat(false));
agentChatPreviewContext?.addEventListener('click', () => expandPreviewToFullChat(true));
agentChatPreviewModal?.addEventListener('click', (e) => {
  if (e.target === agentChatPreviewModal) closeAgentChatPreviewModal();
});
agentChatPreviewSend?.addEventListener('click', async () => {
  const aid = missionOpenAgentId;
  const agent = missionAgents.find(a => a.id === aid);
  if (!agent) return;
  const text = (agentChatPreviewInput?.value || '').trim();
  if (!text) return;
  if (agentChatPreviewInput) agentChatPreviewInput.value = '';
  await sendCommandToAgent(agent, text);
});
agentChatPreviewInput?.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    agentChatPreviewSend?.click();
  }
});

agentChatContext?.addEventListener('click', (e) => {
  const aid = missionOpenAgentId;
  const agent = missionAgents.find(a => a.id === aid);
  if (!agent) return;

  if (e.target && e.target.closest && e.target.closest('[data-agent-save-context]')) {
    saveAgentContextFrom(agentChatContext, agent);
    renderAgentChatModal(agent.id);
    renderMissionProjects();
    showToast('Agent context saved.', 'success', 1600);
    return;
  }

  if (e.target && e.target.closest && e.target.closest('[data-agent-open-config]')) {
    openAgentConfigModal(agent.id, missionSelectedProjectId || '');
  }
});

chatAgentContextToggle?.addEventListener('click', openCurrentAgentContext);
chatAgentContextClose?.addEventListener('click', () => chatAgentContextModal?.classList.remove('open'));
chatAgentContextModal?.addEventListener('click', (e) => {
  if (e.target === chatAgentContextModal) chatAgentContextModal.classList.remove('open');
});
chatAgentContextBody?.addEventListener('click', (e) => {
  const agent = _agentForSession();
  if (!agent) return;
  if (e.target && e.target.closest && e.target.closest('[data-agent-save-context]')) {
    saveAgentContextFrom(chatAgentContextBody, agent);
    renderAgentContextPanel(agent, _sessionSummaryForAgent(agent), chatAgentContextBody);
    renderMissionProjects();
    showToast('Agent context saved.', 'success', 1600);
    return;
  }
  if (e.target && e.target.closest && e.target.closest('[data-agent-open-config]')) {
    openAgentConfigModal(agent.id, agent.project_id || missionSelectedProjectId || '');
  }
});

let agentContextAutoSaveTimer = null;
agentChatContext?.addEventListener('input', (e) => {
  if (e.target?.hasAttribute('data-agent-edit-sources') || e.target?.hasAttribute('data-agent-edit-instructions') || e.target?.hasAttribute('data-agent-edit-memory')) {
    clearTimeout(agentContextAutoSaveTimer);
    agentContextAutoSaveTimer = setTimeout(() => {
      const agent = missionAgents.find(a => a.id === missionOpenAgentId);
      if (!agent) return;
      const ins = agentChatContext.querySelector('[data-agent-edit-instructions]');
      const src = agentChatContext.querySelector('[data-agent-edit-sources]');
      const mem = agentChatContext.querySelector('[data-agent-edit-memory]');
      if (ins) agent.instructions = String(ins.value || '').slice(0, 1200);
      if (src) agent.sources = String(src.value || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 24);
      if (mem) agent.memory_notes = String(mem.value || '').slice(0, 12000);
      saveMissionAgents(missionAgents);
      // Don't call renderAgentChatModal here, or it will steal focus and reset the caret
    }, 750);
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
    mode: String(agentConfigMode?.value || 'conversational'),
    instructions: String(agentConfigInstructions?.value || ''),
    sources: String(agentConfigSources?.value || '').split('\n').map(x => x.trim()).filter(Boolean),
    memory_notes: String(agentConfigMemory?.value || ''),
    allow_web_search: !!document.getElementById('agent-config-web-search')?.checked,
  };

  if (editingAgentId) {
    const agent = missionAgents.find(a => a.id === editingAgentId);
    if (!agent) return;
    agent.name = payload.name.slice(0, 60);
    agent.project_id = payload.project_id;
    agent.mode = payload.mode;
    if (payload.mode === 'swarm') {
      agent.swarm_size = _clampSwarmSize(agent.swarm_size || 8);
    }
    agent.instructions = payload.instructions.slice(0, 1200);
    agent.sources = payload.sources.slice(0, 24);
    agent.memory_notes = payload.memory_notes.slice(0, 12000);
    agent.allow_web_search = payload.allow_web_search;
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
    store.currentId = created.chat_id;
    saveStore(store);
    localStorage.setItem('vibe_current_view', 'chat');
    window.location.reload();
  }
});

let configModalAutoSaveTimer = null;
[agentConfigSources, agentConfigInstructions, agentConfigMemory, agentConfigName, agentConfigProject, agentConfigMode].forEach(el => {
  el?.addEventListener('input', () => {
    if (!editingAgentId) return;
    clearTimeout(configModalAutoSaveTimer);
    configModalAutoSaveTimer = setTimeout(() => {
      const agent = missionAgents.find(a => a.id === editingAgentId);
      if (!agent) return;
      agent.name = String(agentConfigName?.value || '').trim().slice(0, 60) || agent.name;
      agent.project_id = String(agentConfigProject?.value || '').trim();
      agent.mode = String(agentConfigMode?.value || 'conversational');
      agent.instructions = String(agentConfigInstructions?.value || '').slice(0, 1200);
      agent.sources = String(agentConfigSources?.value || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 24);
      agent.memory_notes = String(agentConfigMemory?.value || '').slice(0, 12000);
      saveMissionAgents(missionAgents);
      _syncAgentProjectLink(agent);
      // Do not force render the whole page on every keystroke to keep focus intact
    }, 750);
  });
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

const closeMissionGridContextMenu = () => {
  missionGridContextMenu?.classList.remove('open');
  missionPendingNewTileCell = null;
  missionPendingNewTileType = '';
};

missionPage?.addEventListener('contextmenu', (e) => {
  if (!missionGridContextMenu || missionPage?.style.display === 'none') return;
  if (e.target && e.target.closest && e.target.closest('.mission-widget')) return;
  e.preventDefault();

  if (missionViewMode === 'project') {
    if (missionContextAddProject) missionContextAddProject.style.display = 'none';
    if (missionContextAddGroupChat) missionContextAddGroupChat.style.display = 'block';
    if (missionContextAddSwarm) missionContextAddSwarm.style.display = 'block';
    const pid = missionSelectedProjectId;
    const existingHead = missionAgents.find(a => a.project_id === pid && a.is_project_head);
    if (missionContextAddManager) {
      missionContextAddManager.style.display = existingHead ? 'none' : 'block';
      missionContextAddManager.style.opacity = '1';
    }
  } else {
    if (missionContextAddProject) missionContextAddProject.style.display = 'block';
    if (missionContextAddManager) {
      missionContextAddManager.style.display = 'block';
      missionContextAddManager.style.opacity = '0.5';
    }
    if (missionContextAddSwarm) missionContextAddSwarm.style.display = 'none';
    if (missionContextAddGroupChat) missionContextAddGroupChat.style.display = 'none';
  }

  const cell = _tileCellFromPoint(e.clientX, e.clientY);
  missionPendingNewTileCell = { col: cell.col, row: cell.row };
  missionPendingNewTileType = '';
  missionGridContextMenu.style.left = `${Math.max(8, e.clientX)}px`;
  missionGridContextMenu.style.top = `${Math.max(8, e.clientY)}px`;
  missionGridContextMenu.classList.add('open');
});

const missionAddTileBtn = document.getElementById('mission-page-add-tile');
if (missionAddTileBtn) {
  missionAddTileBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // prevent document click from immediately closing it
    if (!missionGridContextMenu) return;
    
    if (missionViewMode === 'project') {
      if (missionContextAddProject) missionContextAddProject.style.display = 'none';
      if (missionContextAddGroupChat) missionContextAddGroupChat.style.display = 'block';
      if (missionContextAddSwarm) missionContextAddSwarm.style.display = 'block';
      const pid = missionSelectedProjectId;
      const existingHead = missionAgents.find(a => a.project_id === pid && a.is_project_head);
      if (missionContextAddManager) {
        missionContextAddManager.style.display = existingHead ? 'none' : 'block';
        missionContextAddManager.style.opacity = '1';
      }
    } else {
      if (missionContextAddProject) missionContextAddProject.style.display = 'block';
      if (missionContextAddManager) {
        missionContextAddManager.style.display = 'block';
        missionContextAddManager.style.opacity = '0.5';
      }
      if (missionContextAddSwarm) missionContextAddSwarm.style.display = 'none';
      if (missionContextAddGroupChat) missionContextAddGroupChat.style.display = 'none';
    }

    const rect = missionAddTileBtn.getBoundingClientRect();
    missionGridContextMenu.style.left = `${rect.left}px`;
    missionGridContextMenu.style.top = `${rect.bottom + 8}px`;
    missionGridContextMenu.classList.add('open');
    missionPendingNewTileCell = null;
  });
}

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

missionContextAddSwarm?.addEventListener('click', async () => {
  missionGridContextMenu?.classList.remove('open');
  if (missionViewMode !== 'project' || !missionSelectedProjectId) {
    showToast('Open a project workspace to add a swarm agent.', 'error');
    return;
  }
  const rawCount = await showCustomPrompt('How many swarm workers? (1-100)', '8');
  if (rawCount == null) return;
  const swarmSize = _clampSwarmSize(rawCount);
  missionPendingNewTileType = 'agent';
  const swarm = createMissionAgent({
    name: `Swarm Coordinator (${swarmSize})`,
    project_id: missionSelectedProjectId,
    instructions: `You run a 3-stage swarm workflow: planner -> ${swarmSize} workers -> synthesizer. Keep outputs concise and ranked.`,
    mode: 'swarm',
    swarm_size: swarmSize,
    model: _swarmSmallModelDefault(),
  });
  if (swarm) {
    showToast(`Swarm agent created (${swarmSize} workers, max 100).`, 'success', 1800);
    openAgentChat(swarm.id, 'mission');
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

missionContextAddGroupChat?.addEventListener('click', () => {
  if (missionViewMode !== 'project' || !missionSelectedProjectId) {
    showToast('Open a project workspace, then right-click empty grid to add a group chat.', 'info', 2200);
    missionGridContextMenu?.classList.remove('open');
    return;
  }
  missionPendingNewTileType = 'misc';
  missionGridContextMenu?.classList.remove('open');
  createMissionMiscTile('groupchat', 'Group Chat', '');
});

missionContextAddEmail?.addEventListener('click', () => {
  missionPendingNewTileType = 'misc';
  missionGridContextMenu?.classList.remove('open');
  createMissionMiscTile('email', 'Email', '').then(tile => {
    if (tile) renderMissionProjects();
  });
});

document.addEventListener('click', (e) => {
  if (!(e.target && e.target.closest && e.target.closest('#mission-grid-context-menu'))) {
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

missionAddFileBtn?.addEventListener('click', async () => {
  if (!missionSelectedProjectId) return;
  const name = await showCustomPrompt('File name:', 'NOTES.md');
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
  renderMissionProjects();
  showToast('Project file saved.', 'success', 1800);
});

missionEventToggleBtn?.addEventListener('click', () => {
  if (!missionEventForm) return;
  const open = missionEventForm.style.display === 'flex';
  missionEventForm.style.display = open ? 'none' : 'flex';
});

document.getElementById('mission-calendar-prev')?.addEventListener('click', () => {
  _mCalMonth--;
  if (_mCalMonth < 0) { _mCalMonth = 11; _mCalYear--; }
  _mCalSelectedDay = null;
  const lbl = document.getElementById('mission-calendar-day-label');
  if (lbl) lbl.textContent = 'All Events';
  _renderMissionCalGrid();
  _renderMissionEventList();
});
document.getElementById('mission-calendar-next')?.addEventListener('click', () => {
  _mCalMonth++;
  if (_mCalMonth > 11) { _mCalMonth = 0; _mCalYear++; }
  _mCalSelectedDay = null;
  const lbl = document.getElementById('mission-calendar-day-label');
  if (lbl) lbl.textContent = 'All Events';
  _renderMissionCalGrid();
  _renderMissionEventList();
});

/* "Open Full" button opens the main calendar modal */
document.getElementById('mission-cal-open-full')?.addEventListener('click', () => {
  document.getElementById('calendar-btn')?.click();
});

/* "Add Event" button opens the main calendar modal */
document.getElementById('mission-cal-add-btn')?.addEventListener('click', () => {
  document.getElementById('calendar-btn')?.click();
});


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
    openai_api_key: getOpenAIApiKey(),
    anthropic_api_key: getAnthropicApiKey(),
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

/* Mission hub calendar — delegates to the shared mini-calendar renderer */
let _mCalYear = new Date().getFullYear();
let _mCalMonth = new Date().getMonth();
let _mCalSelectedDay = null; // "YYYY-MM-DD" or null
let _calAllItems = [];

function _renderMissionCalGrid() {
  const grid = document.getElementById('mission-calendar-grid');
  const label = document.getElementById('mission-calendar-month-label');
  const dayLbl = document.getElementById('mission-calendar-day-label');
  if (!grid || !label) return;

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  label.textContent = `${monthNames[_mCalMonth]} ${_mCalYear}`;

  const eventDays = new Set();
  _calAllItems.forEach(a => {
    if (!a.run_at) return;
    const dt = new Date(a.run_at);
    if (!isNaN(dt)) eventDays.add(_localDateStr(dt));
  });

  const todayStr = _localDateStr(new Date());
  const firstDay = new Date(_mCalYear, _mCalMonth, 1).getDay();
  const daysInMonth = new Date(_mCalYear, _mCalMonth + 1, 0).getDate();
  const prevDays = new Date(_mCalYear, _mCalMonth, 0).getDate();

  grid.innerHTML = '';

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = document.createElement('div');
    d.className = 'cal-day other-month';
    d.textContent = prevDays - i;
    grid.appendChild(d);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${_mCalYear}-${String(_mCalMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const el = document.createElement('div');
    let cls = 'cal-day clickable-day';
    if (dateStr === todayStr) cls += ' today';
    if (eventDays.has(dateStr)) cls += ' has-event';
    if (dateStr === _mCalSelectedDay) cls += ' selected';
    el.className = cls;
    el.textContent = day;
    el.addEventListener('click', () => {
      _mCalSelectedDay = _mCalSelectedDay === dateStr ? null : dateStr;
      if (dayLbl) dayLbl.textContent = _mCalSelectedDay
        ? `${monthNames[_mCalMonth]} ${day}` : 'All Events';
      _renderMissionCalGrid();
      _renderMissionEventList();
    });
    grid.appendChild(el);
  }

  const filled = firstDay + daysInMonth;
  const rem = filled % 7 === 0 ? 0 : 7 - (filled % 7);
  for (let i = 1; i <= rem; i++) {
    const d = document.createElement('div');
    d.className = 'cal-day other-month';
    d.textContent = i;
    grid.appendChild(d);
  }
}

function _renderMissionEventList() {
  const list = document.getElementById('mission-sched-list');
  if (!list) return;
  let items = _calAllItems.slice().sort((a, b) => (a.run_at || '').localeCompare(b.run_at || ''));

  if (_mCalSelectedDay) {
    items = items.filter(a => {
      if (!a.run_at) return false;
      const dt = new Date(a.run_at);
      return !isNaN(dt) && _localDateStr(dt) === _mCalSelectedDay;
    });
  }

  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = `<div class="cal-empty" style="padding:20px 10px;font-size:.7rem;">
        <div style="font-size:1.4rem;margin-bottom:6px;">📭</div>
        <div>${_mCalSelectedDay ? 'No events on this day.' : 'No scheduled events yet.'}</div>
      </div>`;
    return;
  }

  items.slice(0, 20).forEach(a => {
    const statusKey = _calStatusClass(a);
    const badgeClass = `cal-badge-${statusKey}`;
    const msg = String(a.message || a.instructions || '').slice(0, 120);
    const card = document.createElement('div');
    card.className = `cal-event-card status-${statusKey}`;
    card.innerHTML =
      `<div class="cal-card-title-row">` +
      `<span class="cal-card-title">${esc(a.event_title || 'Scheduled Event')}</span>` +
      `<span class="cal-badge ${badgeClass}">${statusKey}</span>` +
      `</div>` +
      `<div class="cal-card-when">🕐 ${esc(_fmtWhen(a.run_at))}</div>` +
      (msg ? `<div class="cal-card-msg">${esc(msg)}</div>` : '') +
      `<div class="cal-card-actions">` +
      `<button class="cal-action-btn" data-msched-run="${esc(a.id)}">▶ Run</button>` +
      `<button class="cal-action-btn danger" data-msched-del="${esc(a.id)}">🗑</button>` +
      `</div>`;
    list.appendChild(card);
  });

  list.querySelectorAll('[data-msched-run]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-msched-run');
      const res = await fetch(`/api/scheduled-actions/${encodeURIComponent(id)}/run-now`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) { showToast(d?.error || 'Failed', 'error'); return; }
      showToast('Action started.', 'success');
      setTimeout(loadScheduledActions, 500);
    });
  });

  list.querySelectorAll('[data-msched-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-msched-del');
      const res = await fetch(`/api/scheduled-actions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) { showToast('Delete failed', 'error'); return; }
      loadScheduledActions();
    });
  });
}

/* These are called by loadScheduledActions — keep the same signatures */
function renderMissionDailyCalendarView(items = []) { /* handled by _renderMissionEventList */ }
function renderMonthlyCalendar(items = []) {
  _renderMissionCalGrid();
  _renderMissionEventList();
}

/* ── Calendar UI state ──────────────────────────────────────────────────── */
let _calViewYear = new Date().getFullYear();
let _calViewMonth = new Date().getMonth();
let _calSelectedDay = null;   // "YYYY-MM-DD" or null = all
let _calFilter = 'all';
let _calSearch = '';


function _calStatusClass(a) {
  const s = (a.status || 'scheduled').toLowerCase();
  if (!a.enabled && s !== 'running') return 'disabled';
  if (s === 'completed') return 'completed';
  if (s === 'running') return 'running';
  if (a.last_error) return 'error';
  return 'scheduled';
}

function renderScheduledList(container, items) {
  /* For the mission-sched-list (compact mini-view) keep the old simple style */
  if (container && container.id !== 'sched-list') {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = '<div style="opacity:.5;font-size:.72rem;padding:8px;">No scheduled events.</div>';
      return;
    }
    container.innerHTML = '';
    items.slice(0, 8).forEach(a => {
      const d = document.createElement('div');
      d.style.cssText = 'border:1px solid var(--border);border-radius:8px;padding:7px 10px;background:var(--glass-1);font-size:.72rem;';
      d.innerHTML = `<div style="font-weight:700;margin-bottom:2px;">${esc(a.event_title || 'Event')}</div>` +
        `<div style="opacity:.7;">${esc(_fmtWhen(a.run_at))} · ${esc(a.status || 'scheduled')}</div>`;
      container.appendChild(d);
    });
    return;
  }
  /* Full calendar event list */
  _calAllItems = Array.isArray(items) ? items : [];
  _renderCalEventList();
  _renderCalMonthGrid();
  _renderCalStats();
}

function _renderCalStats() {
  const bar = document.getElementById('cal-stats-bar');
  if (!bar) return;
  const total = _calAllItems.length;
  const upcoming = _calAllItems.filter(a => a.enabled && (a.status || '') === 'scheduled').length;
  const running = _calAllItems.filter(a => (a.status || '') === 'running').length;
  const completed = _calAllItems.filter(a => (a.status || '') === 'completed').length;
  bar.innerHTML =
    `<span class="cal-stat-pill"><strong>${total}</strong> total</span>` +
    (upcoming ? `<span class="cal-stat-pill" style="border-color:var(--primary);color:var(--primary);"><strong>${upcoming}</strong> upcoming</span>` : '') +
    (running ? `<span class="cal-stat-pill" style="border-color:#34d399;color:#34d399;"><strong>${running}</strong> running</span>` : '') +
    (completed ? `<span class="cal-stat-pill"><strong>${completed}</strong> done</span>` : '');
}

function _renderCalEventList() {
  const list = document.getElementById('sched-list');
  if (!list) return;
  let items = _calAllItems;

  /* Day filter — compare using local date, not UTC slice */
  if (_calSelectedDay) {
    items = items.filter(a => {
      if (!a.run_at) return false;
      const dt = new Date(a.run_at);
      return !isNaN(dt) && _localDateStr(dt) === _calSelectedDay;
    });
  }

  /* Status filter */
  if (_calFilter === 'scheduled') {
    items = items.filter(a => a.enabled && (a.status || '') === 'scheduled');
  } else if (_calFilter === 'done') {
    items = items.filter(a => (a.status || '') === 'completed' || !a.enabled);
  }

  /* Search */
  if (_calSearch) {
    const q = _calSearch.toLowerCase();
    items = items.filter(a =>
      (a.event_title || '').toLowerCase().includes(q) ||
      (a.message || a.instructions || '').toLowerCase().includes(q) ||
      (a.agent_name || '').toLowerCase().includes(q)
    );
  }

  /* Sort: upcoming first */
  items = items.slice().sort((a, b) => (a.run_at || '').localeCompare(b.run_at || ''));

  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = `<div class="cal-empty">
        <div style="font-size:2rem;margin-bottom:8px;">📭</div>
        <div>No events${_calSelectedDay ? ' on this day' : ''} ${_calFilter !== 'all' ? 'with this filter' : ''}.</div>
      </div>`;
    return;
  }

  items.forEach(a => {
    const statusKey = _calStatusClass(a);
    const badgeClass = `cal-badge-${statusKey}`;
    const repeatBadge = (a.repeat && a.repeat !== 'none')
      ? `<span class="cal-badge cal-badge-repeat">↻ ${esc(a.repeat)}</span>` : '';
    const msg = String(a.message || a.instructions || '').slice(0, 260);
    const agentStr = a.agent_name || a.target_agent || '';
    const metaParts = [
      `Mode: ${esc(a.mode || 'reasoning')}`,
      agentStr ? `Agent: ${esc(agentStr)}` : '',
    ].filter(Boolean);

    const card = document.createElement('div');
    card.className = `cal-event-card status-${statusKey}`;
    card.innerHTML =
      `<div class="cal-card-title-row">` +
      `<span class="cal-card-title">${esc(a.event_title || 'Scheduled Event')}</span>` +
      `<span class="cal-badge ${badgeClass}">${statusKey}</span>` +
      repeatBadge +
      `</div>` +
      `<div class="cal-card-when">🕐 ${esc(_fmtWhen(a.run_at))}</div>` +
      (metaParts.length ? `<div class="cal-card-meta">${metaParts.map(p => `<span>${p}</span>`).join('')}</div>` : '') +
      (msg ? `<div class="cal-card-msg">${esc(msg)}</div>` : '') +
      (a.last_error ? `<div style="font-size:.66rem;color:#f87171;margin-top:2px;">⚠ ${esc(a.last_error)}</div>` : '') +
      `<div class="cal-card-actions">` +
      `<button class="cal-action-btn" data-sched-run="${esc(a.id)}">▶ Run now</button>` +
      `<button class="cal-action-btn" data-sched-toggle="${esc(a.id)}" data-enabled="${a.enabled ? '1' : '0'}">${a.enabled ? '⏸ Disable' : '▶ Enable'}</button>` +
      `<button class="cal-action-btn danger" data-sched-del="${esc(a.id)}">🗑 Delete</button>` +
      `</div>`;
    list.appendChild(card);
  });

  list.querySelectorAll('[data-sched-run]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-sched-run');
      const res = await fetch(`/api/scheduled-actions/${encodeURIComponent(id)}/run-now`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { showToast(data?.error || 'Run now failed', 'error'); return; }
      showToast('Scheduled action started.', 'success');
      setTimeout(loadScheduledActions, 500);
    });
  });

  list.querySelectorAll('[data-sched-toggle]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-sched-toggle');
      const enabled = btn.getAttribute('data-enabled') !== '1';
      const res = await fetch(`/api/scheduled-actions/${encodeURIComponent(id)}/toggle`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data?.error || 'Toggle failed', 'error'); return; }
      loadScheduledActions();
    });
  });

  list.querySelectorAll('[data-sched-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-sched-del');
      const res = await fetch(`/api/scheduled-actions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { showToast(data?.error || 'Delete failed', 'error'); return; }
      loadScheduledActions();
    });
  });
}

function _renderCalMonthGrid() {
  const grid = document.getElementById('cal-day-grid');
  const label = document.getElementById('cal-month-label');
  if (!grid || !label) return;

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  label.textContent = `${monthNames[_calViewMonth]} ${_calViewYear}`;

  /* Build set of local date strings for days that have events.
     Always convert run_at (UTC ISO) → local date to avoid midnight UTC drift. */
  const eventDays = new Set();
  _calAllItems.forEach(a => {
    if (!a.run_at) return;
    const dt = new Date(a.run_at);
    if (!isNaN(dt)) eventDays.add(_localDateStr(dt));
  });

  const todayStr = _localDateStr(new Date());
  const firstDay = new Date(_calViewYear, _calViewMonth, 1).getDay();
  const daysInMonth = new Date(_calViewYear, _calViewMonth + 1, 0).getDate();
  const prevDays = new Date(_calViewYear, _calViewMonth, 0).getDate();

  grid.innerHTML = '';

  /* Prev-month overflow */
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = document.createElement('div');
    d.className = 'cal-day other-month';
    d.textContent = prevDays - i;
    grid.appendChild(d);
  }

  /* Current month — every day is clickable to filter the event list */
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${_calViewYear}-${String(_calViewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const el = document.createElement('div');
    let cls = 'cal-day clickable-day';
    if (dateStr === todayStr) cls += ' today';
    if (eventDays.has(dateStr)) cls += ' has-event';
    if (dateStr === _calSelectedDay) cls += ' selected';
    el.className = cls;
    el.textContent = day;
    if (eventDays.has(dateStr)) {
      /* Event dot count badge */
      const count = _calAllItems.filter(a => {
        const dt = new Date(a.run_at);
        return !isNaN(dt) && _localDateStr(dt) === dateStr;
      }).length;
      if (count > 1) {
        const badge = document.createElement('span');
        badge.className = 'cal-day-count';
        badge.textContent = count;
        el.appendChild(badge);
      }
    }
    el.addEventListener('click', () => {
      _calSelectedDay = _calSelectedDay === dateStr ? null : dateStr;
      const label2 = document.getElementById('cal-list-day-label');
      if (label2) label2.textContent = _calSelectedDay
        ? `${monthNames[_calViewMonth]} ${day}` : 'All Events';
      _renderCalMonthGrid();
      _renderCalEventList();
    });
    grid.appendChild(el);
  }

  /* Next-month overflow */
  const filled = firstDay + daysInMonth;
  const remaining = filled % 7 === 0 ? 0 : 7 - (filled % 7);
  for (let i = 1; i <= remaining; i++) {
    const d = document.createElement('div');
    d.className = 'cal-day other-month';
    d.textContent = i;
    grid.appendChild(d);
  }
}

async function loadScheduledActions() {
  try {
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
  } catch (err) {
    console.error(err);
    showToast(`Failed to load calendar: ${err?.message || err}`, 'error');
  }
}

async function createScheduledActionFrom(opts) {
  try {
    const whenLocal = (opts?.runAt?.value || '').trim();
    const message = (opts?.message?.value || '').trim();
    if (!whenLocal || !message) {
      showToast('Pick date/time and message first.', 'error');
      return;
    }

    const runAt = new Date(whenLocal);
    if (Number.isNaN(runAt.getTime())) {
      showToast('Pick a valid calendar date/time.', 'error');
      return;
    }

    const payload = {
      run_at: runAt.toISOString(),
      message,
      instructions: message,
      event_title: (opts?.title?.value || '').trim() || 'Scheduled Event',
      agent_name: (opts?.targetAgent?.value || '').trim() || 'Agent',
      mode: opts?.mode?.value || 'conversational',
      model: modelSelect?.value || '',
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
    await loadScheduledActions();
  } catch (err) {
    console.error(err);
    showToast(`Calendar create failed: ${err?.message || err}`, 'error');
  }
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
    const pad = n => String(n).padStart(2, '0');
    schedRunAt.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  _calViewYear = new Date().getFullYear();
  _calViewMonth = new Date().getMonth();
  _calSelectedDay = null;
  _calFilter = 'all';
  _calSearch = '';
  _renderCalMonthGrid();
  await loadScheduledActions();
});
calendarClose?.addEventListener('click', () => calendarModal?.classList.remove('open'));
calendarModal?.addEventListener('click', (e) => {
  if (e.target === calendarModal) calendarModal.classList.remove('open');
});

/* Fullscreen toggle */
document.getElementById('cal-fullscreen-btn')?.addEventListener('click', () => {
  const card = calendarModal?.querySelector('.cal-modal-card');
  if (!card) return;
  const isFs = card.classList.toggle('fullscreen');
  document.getElementById('cal-fullscreen-btn').textContent = isFs ? '⊡' : '⛶';
});

/* Month nav */
document.getElementById('cal-prev-month')?.addEventListener('click', () => {
  _calViewMonth--;
  if (_calViewMonth < 0) { _calViewMonth = 11; _calViewYear--; }
  _calSelectedDay = null;
  const lbl = document.getElementById('cal-list-day-label');
  if (lbl) lbl.textContent = 'All Events';
  _renderCalMonthGrid();
  _renderCalEventList();
});
document.getElementById('cal-next-month')?.addEventListener('click', () => {
  _calViewMonth++;
  if (_calViewMonth > 11) { _calViewMonth = 0; _calViewYear++; }
  _calSelectedDay = null;
  const lbl = document.getElementById('cal-list-day-label');
  if (lbl) lbl.textContent = 'All Events';
  _renderCalMonthGrid();
  _renderCalEventList();
});

/* Filter buttons */
document.querySelectorAll('.cal-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    _calFilter = btn.dataset.filter || 'all';
    document.querySelectorAll('.cal-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _renderCalEventList();
  });
});

/* Search */
document.getElementById('cal-search')?.addEventListener('input', (e) => {
  _calSearch = e.target.value.trim();
  _renderCalEventList();
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

async function callChatApi({ message, mode, history, customMode, sharedUrl, modelOverride, runId }) {
  if (isKillSwitchEngaged) {
    showToast('API Blocked: Kill Switch Engaged', 'error');
    return { res: { ok: false }, data: { error: 'Kill switch active.' } };
  }
  const controller = new AbortController();
  activeFetchControllers.add(controller);
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
      message,
      history,
      run_id: runId,
      model: modelOverride || modelSelect?.value,
      mode: customMode ? 'custom' : mode,
      mode_config: customMode || null,
      include_trace_prompts: getIncludeTracePrompts(),
      api_key: getApiKey(),
      hf_api_key: getHfApiKey(),
      hf_router: getHfRouter(),
      hf_routing: (localStorage.getItem('vibe_hf_routing_val') === '2') ? 'fastest' : 'cheapest',
      openai_api_key: getOpenAIApiKey(),
      anthropic_api_key: getAnthropicApiKey(),
      web_urls: sharedUrl ? [sharedUrl] : [],
      web_auto_search: getWebAutoSearch(),
      auto_skip: getAutoSkip(),
    }),
  });
  const raw = await res.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_) {
    data = {
      error: `Server returned non-JSON response (HTTP ${res?.status || 'unknown'}). ${String(raw || '').slice(0, 240)}`,
    };
  }
  return { res, data };
  } finally {
    activeFetchControllers.delete(controller);
  }
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
  } catch (_) { }

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
    modelOverride,
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
      modelOverride,
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
    modelOverride,
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
    } catch (_) { }
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

  const linkedAgent = _agentForSession();
  if (linkedAgent) {
    addUserMsg(msg);
    input.value = '';
    setDisabled(true);
    showTyping();
    startStageTicker();

    try {
      const sources = Array.isArray(linkedAgent.sources) ? linkedAgent.sources.filter(Boolean).slice(0, 12) : [];
      const pFiles = _projectFiles(linkedAgent.project_id || missionSelectedProjectId)
        .slice(0, 10)
        .map(f => `FILE: ${f.name}\n${String(f.content || '').slice(0, 2400)}`)
        .join('\n\n');
      const profileBlock =
        `[AGENT_PROFILE]\n` +
        `name=${linkedAgent.name || 'Agent'}\n` +
        `instructions=${(linkedAgent.instructions || '').slice(0, 1200)}\n` +
        `memory_notes=${(linkedAgent.memory_notes || '').slice(0, 2400)}\n` +
        `${sources.length ? `sources=\n- ${sources.join('\n- ')}` : ''}\n` +
        `[/AGENT_PROFILE]`;

      const isManager = linkedAgent.is_project_head || linkedAgent.mode === 'project_manager';
      const subagents = (linkedAgent.project_id && missionAgents) ? missionAgents.filter(a => a.project_id === linkedAgent.project_id && a.id !== linkedAgent.id).map(a => a.name) : [];

      let sysRules = '';
      if (linkedAgent.project_id || missionSelectedProjectId) {
        sysRules += `\n\n[FILE SYSTEM CAPABILITY]\nYou can create and edit project files. To do so, output a markdown codeblock starting exactly with \`\`\`file:filename.ext\n[content]\n\`\`\`.\nThe system will automatically save it. Use this to update VISION.md, SHARED_CONTEXT.md, or SCOPE.md.\n`;
      }
      if (isManager && subagents.length > 0) {
        sysRules += `[TEAM MANAGER CAPABILITY]\nYou lead this project. Your available subagents are: ${subagents.join(', ')}.\nTo delegate a task, output a codeblock starting exactly with \`\`\`agent:AgentName\n[task commands]\n\`\`\`. The system will automatically forward your command to them.\n`;
      } else if (!isManager && linkedAgent.project_id) {
        sysRules += `[TEAM SYNC]\nYou are a focused subagent. Perform your assignment, update relevant logic via files, and explain changes to your manager in your reply.\n`;
      }

      const projectBlock = pFiles
        ? `\n\n[PROJECT_INFO_FILES]\n${pFiles}\n[/PROJECT_INFO_FILES]`
        : '';

      const agentOutboundMsg = `${outboundMsg}\n\n${profileBlock}${projectBlock}${sysRules}`.trim();

      const sess = store.sessions[store.currentId];
      if (sess) {
        sess.messages = sessionMessages;
        sess.timestamp = Date.now();
        saveStore(store);
        renderHistory();
      }

      const history = (sessionMessages || []).map(m => ({ role: m.role, content: m.content }));
      const mode = linkedAgent.mode || 'reasoning_fast';

      const { res, data } = await callChatApi({
        message: agentOutboundMsg,
        mode,
        history,
        customMode: null,
        sharedUrl,
      });

      removeTyping();
      updateMissionStateFromResponse(data);

      if (res.ok && data?.reply) {
        let replyText = data.reply;
        let filesEdited = 0;
        let projId = linkedAgent.project_id || missionSelectedProjectId;
        let files = projId ? _projectFiles(projId) : null;

        const fileRegex = /```(?:file|write|update):\s*([^\n]+)\n([\s\S]*?)```/gi;
        let match;
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

        sessionMessages.push({ role: 'assistant', content: data.reply, classification: data.classification, traces: data.traces || [] });
        if (sess) {
          sess.messages = sessionMessages;
          sess.timestamp = Date.now();
          saveStore(store);
          renderHistory();
        }

        addAssistantMsg(data.reply, data.classification, data.traces);

        linkedAgent.last_status = 'active';
        linkedAgent.last_command_at = Date.now();
        saveMissionAgents(missionAgents);
        renderMissionProjects();
        notifyFinish('Agent Finished', `${linkedAgent.name || 'Agent'} completed the task.`);

        const agentRegex = /```agent:\s*([^\n]+)\n([\s\S]*?)```/gi;
        let agentMatch;
        while ((agentMatch = agentRegex.exec(replyText)) !== null) {
          let subName = String(agentMatch[1]).trim().toLowerCase();
          let subTask = agentMatch[2].trim();
          let targetAgent = (missionAgents || []).find(a => (a.project_id === linkedAgent.project_id || !linkedAgent.project_id) && String(a.name || '').toLowerCase() === subName && a.id !== linkedAgent.id);
          if (targetAgent) {
            showToast(`Delegating task to ${targetAgent.name}...`, 'info');
            sendCommandToAgent(targetAgent, subTask).catch(e => console.error('Subagent failed', e));
          } else {
            showToast(`Could not find subagent: ${agentMatch[1]}`, 'error');
          }
        }
      } else {
        linkedAgent.last_status = 'error';
        saveMissionAgents(missionAgents);
        addAssistantMsg(`⚠️ Error: ${data?.error || 'Agent command failed.'}`, null, []);
      }
    } catch (err) {
      removeTyping();
      addAssistantMsg(`⚠️ Network error: ${err.message}`, null, []);
    } finally {
      stopStageTicker();
      setDisabled(false);
      if (webUrlInput) webUrlInput.value = '';
      webUrlWrap?.classList.remove('open');
      renderWelcomeState();
      input.focus();
    }
    return;
  }

  const runId = 'run_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  window.__activeRunId = runId;
  window.__pendingExtremeResponse = null;
  addUserMsg(msg);

  // Auto-maximize viewport real-estate for the upcoming agent canvas
  if (chatBox) {
    setTimeout(() => {
      const lastMsg = chatBox.lastElementChild;
      if (lastMsg) {
        lastMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });
      }
    }, 50);
  }

  input.value = '';
  setDisabled(true);
  showTyping();
  startStageTicker();

  const _initialChatId = store.currentId;

  try {
    // getActiveMode() returns extreme-mode-select value or 'conversational'
    const activeMode = getActiveMode();
    const customMode = getCustomModeById(activeMode);
    setMode(activeMode);

    if (activeMode !== 'direct' && activeMode !== 'conversational' && activeMode !== 'reasoning_loop') {
      startPollingRun(runId, activeMode, customMode);
    }

    if (activeMode === 'reasoning_loop') {
      removeTyping();
      await runLoopingAgentMode(outboundMsg, sharedUrl);
      stopStageTicker();
      if (webUrlInput) webUrlInput.value = '';
      webUrlWrap?.classList.remove('open');
      setDisabled(false);
      renderWelcomeState();
      input.focus();
    } else {
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
        runId,
      });

      if (store.currentId !== _initialChatId) {
        // User switched chats while we were waiting
        return;
      }

      if (isAgentExtremeMode() && res.status !== 401 && !(data.error && !data.reply)) {
        window.__pendingExtremeResponse = data;
        const extremeContainer = document.getElementById('live-extreme-canvas');
        if (extremeContainer) {
          extremeContainer.__backendTraces = data.traces || [];
        }
      } else {
        removeTyping();
        updateMissionStateFromResponse(data);

        if (res.status === 401) {
          // API Key missing or invalid
          openSettings();
          addAssistantMsg(`⚠️ **Auth Error:** ${data.error}`, null, []);
        } else if (data.error && !data.reply) {
          addAssistantMsg(`⚠️ Error: ${data.error}`, null, data.traces);
        } else {
          addAssistantMsg(data.reply, data.classification, data.traces, true, data.web_sources, data.resolved_model || data.model);
          notifyFinish('Agent Finished', 'Main chat agent completed the task.');
        }
        stopStageTicker();

        if (webUrlInput) webUrlInput.value = '';
        webUrlWrap?.classList.remove('open');
        setDisabled(false);
        renderWelcomeState();
        input.focus();
      }
    }

  } catch (err) {
    removeTyping();
    if (err.name === 'AbortError') {
      addAssistantMsg(`⚠️ Agent canceled by kill switch.`, null, []);
    } else {
      addAssistantMsg(`⚠️ Network error: ${err.message}`, null, []);
    }
    stopStageTicker();
    if (webUrlInput) webUrlInput.value = '';
    webUrlWrap?.classList.remove('open');
    setDisabled(false);
    renderWelcomeState();
    input.focus();
  }
});

killSwitchBtn?.addEventListener('click', (e) => {
  isKillSwitchEngaged = !isKillSwitchEngaged;
  if (isKillSwitchEngaged) {
    for (const controller of activeFetchControllers) {
      controller.abort();
    }
    activeFetchControllers.clear();
    e.target.style.background = 'var(--danger)';
    e.target.style.color = '#fff';
    e.target.textContent = 'API STOPPED';
    showToast('Global kill switch engaged. All active calls aborted.', 'error', 3000);
  } else {
    e.target.style.background = 'transparent';
    e.target.style.color = 'var(--msg-user)';
    e.target.textContent = 'Kill Switch';
    showToast('Kill switch disengaged. API restored.', 'success');
  }
});

/* ── Reset ─────────────────────────────────────────────────────── */
resetBtn?.addEventListener('click', async () => {
  if (modeSelect) {
    modeSelect.value = 'conversational';
    setMode('conversational');
    modeSelect.dispatchEvent(new Event('change'));
  }
  closeMissionPage();
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

// -- Active Agents Modal Logic --
const activeAgentsBtn = document.getElementById('active-agents-btn');
const activeAgentsModal = document.getElementById('active-agents-modal');
if (activeAgentsBtn && activeAgentsModal) {
  activeAgentsBtn.addEventListener('click', () => {
    activeAgentsModal.style.display = activeAgentsModal.style.display === 'none' ? 'block' : 'none';
  });
}

// ── Group Chat shared helpers ─────────────────────────────────────────────

function _gcRenderRichText(text) {
  const raw = String(text || '').replace(/<think>([\s\S]*?)<\/think>/gi, '').trim();
  const fenceRe = /```([^\n`]*)\n([\s\S]*?)```/g;
  const parts = [];
  let last = 0;
  let match;
  let idx = 0;
  while ((match = fenceRe.exec(raw))) {
    if (match.index > last) {
      parts.push({ type: 'text', value: raw.slice(last, match.index) });
    }
    parts.push({
      type: 'code',
      lang: String(match[1] || '').trim().toLowerCase(),
      value: String(match[2] || ''),
      index: idx++,
    });
    last = fenceRe.lastIndex;
  }
  if (last < raw.length) {
    parts.push({ type: 'text', value: raw.slice(last) });
  }
  if (!parts.length) parts.push({ type: 'text', value: raw });

  const html = parts.map((p) => {
    if (p.type === 'code') {
      const lang = p.lang || 'code';
      const lineCount = p.value ? p.value.split('\n').length : 0;
      const title = `${lang} (${lineCount} lines)`;
      return `<details class="gchat-code"><summary>${esc(title)}</summary><pre><code>${esc(p.value)}</code></pre></details>`;
    }
    return p.value ? `<div class="gchat-text">${esc(p.value)}</div>` : '';
  }).join('');
  return `<div class="gchat-rich">${html}</div>`;
}

/** Render one message object into a container el. Returns the created element. */
function _gcRenderMsg(container, msg) {
  if (!container) return null;
  // Remove empty-state placeholder
  container.querySelector('.gchat-empty')?.remove();
  const el = document.createElement('div');
  const role = msg.role === 'user' ? 'user' : msg.role === 'system' ? 'system' : 'assistant';
  el.className = `gchat-msg gchat-${role}`;
  const time = msg.ts ? new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  el.innerHTML =
    (role !== 'user' ? `<span class="gchat-sender">${esc(msg.sender || (role === 'system' ? 'System' : 'Agent'))}</span>` : '') +
    `<div class="gchat-bubble">${_gcRenderRichText(msg.text)}</div>` +
    (time ? `<span class="gchat-time">${time}</span>` : '');
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

/** Show a typing-dots indicator for an agent; returns a remove() function. */
function _gcShowTyping(container, agentName) {
  if (!container) return () => { };
  const el = document.createElement('div');
  el.className = 'gchat-typing-row';
  el.innerHTML =
    `<span class="gchat-sender">${esc(agentName)}</span>` +
    `<div class="gchat-dots"><span></span><span></span><span></span></div>`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return () => el.remove();
}

/** Build a [GROUP_CHAT_CONTEXT] block from saved messages for injection into agent prompts. */
function _gcBuildTranscript(msgs) {
  if (!msgs || !msgs.length) return '';
  const lines = msgs.slice(-40).map(m => {
    const who = m.sender || (m.role === 'user' ? 'User' : 'Agent');
    return `${who}: ${m.text}`;
  });
  return `[GROUP_CHAT_CONTEXT]\nThis is the shared group conversation visible to all agents.\n${lines.join('\n')}\n[/GROUP_CHAT_CONTEXT]`;
}

/**
 * Parse @mentions from a message. Returns { targets: Agent[], cleanText: string }.
 * Supports @all (exact word) and @AgentName anywhere in text.
 * projectId scopes the agent list when provided.
 */
function _gcParseMentions(rawText, projectId) {
  const text = rawText.trim();
  const pool = projectId
    ? (missionAgents || []).filter(a => a.project_id === projectId)
    : (missionAgents || []);

  // @all (must be @all as a whole word)
  if (/(?:^|\s)@all\b/i.test(text)) {
    const cleanText = text.replace(/(?:^|\s)@all\b/gi, '').trim() || text;
    return { targets: pool, cleanText };
  }

  // Collect all distinct @Name mentions anywhere in text
  const matches = [...text.matchAll(/@([\w-]+)/g)].map(m => m[1].toLowerCase());
  const seen = new Set();
  const targets = [];
  for (const name of matches) {
    const found = pool.find(a => (a.name || '').toLowerCase() === name);
    if (found && !seen.has(found.id)) { targets.push(found); seen.add(found.id); }
  }
  return { targets, cleanText: text };
}

/**
 * Core send function used by both the hardcoded and dynamic group chat tiles.
 * container  = the messages div
 * msgs       = the mutable array of message objects (modified in place)
 * projectId  = for scoping agent lookups
 * onSave     = callback(msgs) to persist
 */
async function _gcSend(rawText, container, msgs, projectId, onSave) {
  rawText = rawText.trim();
  if (!rawText) return;

  const userMsg = { role: 'user', sender: 'You', text: rawText, ts: Date.now() };
  msgs.push(userMsg);
  _gcRenderMsg(container, userMsg);
  onSave(msgs);

  const { targets, cleanText } = _gcParseMentions(rawText, projectId);

  if (!targets.length) {
    const sysMsg = {
      role: 'system', sender: 'System',
      text: '⚠️ No agent found. Use @AgentName to mention someone, or @all for everyone.',
      ts: Date.now()
    };
    msgs.push(sysMsg);
    _gcRenderMsg(container, sysMsg);
    onSave(msgs);
    return;
  }

  // Build transcript from messages BEFORE the new user message
  const transcript = _gcBuildTranscript(msgs.slice(0, -1));

  for (const agent of targets) {
    const removeTyping = _gcShowTyping(container, agent.name || 'Agent');
    try {
      // Give the agent full group transcript + the current message
      const contextMsg = transcript
        ? `${transcript}\n\n[You (@${agent.name}) were just mentioned in the group chat]\n${cleanText}`
        : `[Group Chat] ${cleanText}`;

      const resolvedReply = await sendCommandToAgent(agent, contextMsg);
      const replyText = resolvedReply ? resolvedReply : "(no response)";

      removeTyping();
      const replyMsg = { role: 'assistant', sender: agent.name || 'Agent', text: replyText, ts: Date.now() };
      msgs.push(replyMsg);
      _gcRenderMsg(container, replyMsg);
      onSave(msgs);
    } catch (e) {
      removeTyping();
      const errMsg = {
        role: 'system', sender: 'System',
        text: `⚠️ ${agent.name} failed: ${e?.message || e}`, ts: Date.now()
      };
      msgs.push(errMsg);
      _gcRenderMsg(container, errMsg);
      onSave(msgs);
    }
  }
}

/**
 * Wire up keyboard/send-button + @ autocomplete for a group chat composer.
 * inputEl    = the textarea
 * sendBtn    = the send button
 * mentionList = the dropdown container
 * container  = messages div
 * msgs / projectId / onSave — same as _gcSend
 */
function _gcSetupComposer(inputEl, sendBtn, mentionList, container, msgs, projectId, onSave) {
  if (!inputEl) return;

  let mentionHlIdx = -1;

  function _updateMentionList() {
    if (!mentionList) return;
    const val = inputEl.value;
    const m = val.match(/@([\w-]*)$/);
    if (!m) { mentionList.classList.remove('open'); return; }
    const partial = m[1].toLowerCase();
    const pool = projectId
      ? (missionAgents || []).filter(a => a.project_id === projectId)
      : (missionAgents || []);
    const matched = pool.filter(a => (a.name || '').toLowerCase().startsWith(partial)).slice(0, 8);
    if (!matched.length) { mentionList.classList.remove('open'); return; }
    mentionHlIdx = -1;
    mentionList.innerHTML = '';
    // @all shortcut
    if ('all'.startsWith(partial)) {
      const allItem = document.createElement('div');
      allItem.className = 'gchat-mention-item';
      allItem.innerHTML = `<span style="color:var(--primary);font-weight:700;">@all</span><span style="opacity:.7;font-size:.65rem;">— all agents</span>`;
      allItem.addEventListener('mousedown', e => { e.preventDefault(); inputEl.value = val.replace(/@[\w-]*$/, '@all '); mentionList.classList.remove('open'); inputEl.focus(); });
      mentionList.appendChild(allItem);
    }
    matched.forEach(a => {
      const item = document.createElement('div');
      item.className = 'gchat-mention-item';
      item.innerHTML = `<span style="color:var(--primary);font-weight:700;">@${esc(a.name)}</span><span style="opacity:.7;font-size:.65rem;">${esc(a.instructions?.slice(0, 40) || '')}</span>`;
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        inputEl.value = val.replace(/@[\w-]*$/, `@${a.name} `);
        mentionList.classList.remove('open');
        inputEl.focus();
      });
      mentionList.appendChild(item);
    });
    mentionList.classList.add('open');
  }

  inputEl.addEventListener('input', _updateMentionList);
  inputEl.addEventListener('keydown', async (e) => {
    // Navigate mention list
    if (mentionList?.classList.contains('open')) {
      const items = mentionList.querySelectorAll('.gchat-mention-item');
      if (e.key === 'ArrowDown') { e.preventDefault(); mentionHlIdx = Math.min(mentionHlIdx + 1, items.length - 1); items.forEach((el, i) => el.classList.toggle('hl', i === mentionHlIdx)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); mentionHlIdx = Math.max(mentionHlIdx - 1, 0); items.forEach((el, i) => el.classList.toggle('hl', i === mentionHlIdx)); return; }
      if (e.key === 'Tab' || e.key === 'Enter') {
        const hl = mentionList.querySelector('.gchat-mention-item.hl') || mentionList.querySelector('.gchat-mention-item');
        if (hl) { e.preventDefault(); hl.dispatchEvent(new MouseEvent('mousedown')); return; }
      }
      if (e.key === 'Escape') { mentionList.classList.remove('open'); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      inputEl.style.height = '';
      mentionList?.classList.remove('open');
      await _gcSend(text, container, msgs, projectId, onSave);
    }
  });
  // Auto-grow textarea
  inputEl.addEventListener('input', () => { inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px'; });
  inputEl.addEventListener('blur', () => { setTimeout(() => mentionList?.classList.remove('open'), 150); });
  sendBtn?.addEventListener('click', async () => {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    inputEl.style.height = '';
    mentionList?.classList.remove('open');
    await _gcSend(text, container, msgs, projectId, onSave);
  });
}

// ── Hardcoded global Group Chat tile setup ────────────────────────────────

(function _initHardcodedGroupChat() {
  const container = document.getElementById('mission-groupchat-messages');
  const inputEl = document.getElementById('mission-groupchat-input');
  const sendBtn = document.getElementById('mission-groupchat-send');
  const mlEl = document.getElementById('gchat-mention-list');
  if (!container || !inputEl) return;

  const STORAGE_KEY = 'gchat_global_msgs';
  const msgs = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } })();

  // Render persisted history
  msgs.forEach(m => _gcRenderMsg(container, m));

  const onSave = (arr) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(-200))); } catch { }
  };

  _gcSetupComposer(inputEl, sendBtn, mlEl, container, msgs, null /* global scope */, onSave);
})();

// ── Floating Sandbox Preview Modal ──────────────────────────────────────────
(function _initSandboxFloatModal() {
  const modal = document.getElementById('sandbox-float-modal');
  const card = document.getElementById('sandbox-float-card');
  const closeBtn = document.getElementById('sandbox-float-close');
  const maxBtn = document.getElementById('sandbox-float-maximize');
  const frame = document.getElementById('sandbox-float-frame');
  if (!modal) return;

  closeBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
    if (frame) frame.srcdoc = '';
  });

  let isMax = false;
  maxBtn?.addEventListener('click', () => {
    isMax = !isMax;
    if (card) {
      card.style.width = isMax ? '100vw' : '88vw';
      card.style.height = isMax ? '100vh' : '86vh';
      card.style.borderRadius = isMax ? '0' : '14px';
    }
    if (maxBtn) maxBtn.textContent = isMax ? '⛶ Restore' : '⛶ Fullscreen';
  });

  // Click backdrop to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
      if (frame) frame.srcdoc = '';
    }
  });

  // Esc to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display !== 'none') {
      modal.style.display = 'none';
      if (frame) frame.srcdoc = '';
    }
  });
})();
// Electron Titlebar Integration
document.addEventListener('DOMContentLoaded', () => {
  if (navigator.userAgent.toLowerCase().includes('electron')) {
    const titlebar = document.getElementById('electron-titlebar');
    if (titlebar) {
      titlebar.style.display = 'flex';
      
      try {
        const { ipcRenderer } = require('electron');
        
        document.getElementById('fa-close-btn')?.addEventListener('click', () => {
          ipcRenderer.send('full-app-close');
        });
        
        document.getElementById('fa-min-btn')?.addEventListener('click', () => {
          ipcRenderer.send('full-app-minimize');
        });
        
        document.getElementById('fa-max-btn')?.addEventListener('click', () => {
          ipcRenderer.send('full-app-maximize');
        });
      } catch (err) {
        console.warn('Electron IPC not available:', err);
      }
    }
  }
});

// --- Widget Behavior Settings Logic ---
const KEY_WIDGET_BEHAVIOR = 'vibe_widget_behavior';
const KEY_WIDGET_AGENT = 'vibe_widget_agent';

function initWidgetSettings() {
  const behaviorSelect = document.getElementById('widget-behavior-select');
  const agentContainer = document.getElementById('widget-agent-container');
  const agentSelect = document.getElementById('widget-agent-select');
  const modelSelect = document.getElementById('settings-default-model');

  if (!behaviorSelect) return; // Not on main page

  // Load models into settings dropdown
  if (modelSelect) {
    const defaultModel = getSelectedModel();
    fetch('/api/models').then(r => r.json()).then(models => {
      modelSelect.innerHTML = '';
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        if (m.id === defaultModel) opt.selected = true;
        modelSelect.appendChild(opt);
      });
    }).catch(e => console.error("Could not load models for settings", e));

    modelSelect.addEventListener('change', (e) => {
      localStorage.setItem(KEY_MODEL, e.target.value);
      // Update the main UI dropdown if it exists
      const mainModelSelect = document.getElementById('model-select');
      if (mainModelSelect) mainModelSelect.value = e.target.value;
    });
  }

  // Load agents
  const agents = JSON.parse(localStorage.getItem(KEY_MISSION_AGENTS) || '[]');
  agentSelect.innerHTML = '';
  agents.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id || a.name; // agents usually have name, maybe id
    opt.textContent = a.name;
    agentSelect.appendChild(opt);
  });

  const savedBehavior = localStorage.getItem(KEY_WIDGET_BEHAVIOR) || 'new_chat';
  behaviorSelect.value = savedBehavior;
  
  const savedAgent = localStorage.getItem(KEY_WIDGET_AGENT) || '';
  if (savedAgent) agentSelect.value = savedAgent;

  if (savedBehavior === 'specific_agent') {
    agentContainer.style.display = 'block';
  } else {
    agentContainer.style.display = 'none';
  }

  behaviorSelect.addEventListener('change', (e) => {
    localStorage.setItem(KEY_WIDGET_BEHAVIOR, e.target.value);
    if (e.target.value === 'specific_agent') {
      agentContainer.style.display = 'block';
    } else {
      agentContainer.style.display = 'none';
    }
  });

  agentSelect.addEventListener('change', (e) => {
    localStorage.setItem(KEY_WIDGET_AGENT, e.target.value);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initWidgetSettings();
});

/* ── Modal Dragging ── */
let _modalZIndex = 3000;
document.addEventListener('mousedown', (e) => {
  const header = e.target.closest('.modal-header');
  if (!header) return;
  const card = header.closest('.modal-card, .cal-modal-card');
  if (!card) return;
  if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;

  _modalZIndex++;
  const modal = card.closest('.modal');
  if (modal) modal.style.zIndex = _modalZIndex;

  let startX = e.clientX;
  let startY = e.clientY;
  const rect = card.getBoundingClientRect();
  
  if (!card.style.left || !card.style.top) {
    card.style.left = rect.left + 'px';
    card.style.top = rect.top + 'px';
    card.style.bottom = 'auto';
    card.style.right = 'auto';
    card.style.margin = '0';
    card.style.transform = 'none';
  }

  function onMouseMove(moveEvent) {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    startX = moveEvent.clientX;
    startY = moveEvent.clientY;
    
    const currentLeft = parseFloat(card.style.left) || 0;
    const currentTop = parseFloat(card.style.top) || 0;
    
    card.style.left = (currentLeft + dx) + 'px';
    card.style.top = (currentTop + dy) + 'px';
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
});

/* ── System Notifications ── */
function notifyFinish(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/static/icon.png' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, { body, icon: '/static/icon.png' });
      }
    });
  }
}
