# 🧠 Vibe Coding — Reasoning Engine

A multi-agent AI chat application that routes user messages through a sophisticated reasoning pipeline, featuring multiple LLM backends (Gemini & Hugging Face), real-time WebSocket chat, user authentication, and a visual agent workshop.

## ✨ Features

### 🤖 Multi-Agent Reasoning Pipeline
- **Classifier** → Intent detection & routing
- **Introspector** → Self-questioning for deeper understanding  
- **Architect** → Strategy planning
- **Skeptic** → Critical review & challenge
- **Synthesizer** → Final answer composition
- **Bug Checker** → Code quality verification
- **Historian** → Cross-referencing past conversations

### 💬 Chat Modes
| Mode | Description |
|------|-------------|
| 🧠 **Reasoning** | Full multi-agent pipeline (7 agents) |
| 🎭 **Conversational** | Muse + Guide dual-agent personality |
| ⚡ **Direct** | Single model, fastest response |
| 🧪 **Custom** | Build your own agent chains in Workshop (with Feed-Forward execution) |

### 🛠 Agentic Capabilities
- **Agent Workshop**: Visual builder for Custom Modes with interconnected node pipelines.
- **Feed-Forward Tools**: Agents can be assigned specific abilities (Web Search, Read Calendar, Read Email, Skip Route). When an agent requests data, the system automatically fetches it and seamlessly feeds it forward to the *next* agent in the chain for analysis.
- **Agentic Web Search**: The system uses a ReAct-style search planner to automatically determine if a user's query requires fresh web context, fetches live data via DuckDuckGo, and seamlessly integrates it.
- **Per-Step Model Locking**: In Custom Mode, you can assign different LLMs (e.g. Gemini 2.0 Flash vs Llama 3.3 70B) to specific nodes in the same pipeline to optimize cost and capability.

### 🔐 User Authentication
- Register / login with username + password
- Session-based auth with Flask-Login
- API key per user for external integrations
- Guest mode available

### 💾 Persistent Chat History
- SQLite database for reliable storage
- Per-user chat sessions with auto-titling
- Server-side + client-side (localStorage) history
- Create, load, and delete past conversations

### 🌐 REST API (v1)
External API access with API-key authentication:

```bash
# Health check
curl http://localhost:5000/api/v1/health

# List models
curl http://localhost:5000/api/v1/models

# Send a message (requires API key)
curl -X POST http://localhost:5000/api/v1/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: vibe_your_api_key_here" \
  -d '{"message": "Explain recursion", "model": "gemini-2.5-flash", "gemini_api_key": "YOUR_KEY"}'
```

### ⚡ WebSocket Real-Time Chat
- Flask-SocketIO for instant message delivery
- Live thinking-stage updates during reasoning
- Connection: `ws://localhost:5000`

### 🎨 UI/UX
- **9 themes**: Midnight Red, Deep Purple, Clean Light, Matrix Green, Forest Mint, Crimson Black, Aurora Glass, Sunset Neon, plus enhanced active-theme glowing effects.
- **Code Sandbox**: Run HTML/JS directly in-browser
- **Agent Workshop**: Build custom agent chains with file attachments, Pulse Loops, and explicit agent abilities.
- **Floating Widget**: A persistent, minimalist Electron-based widget mode for quick access alongside other apps.
- **Projects & Memory**: Save generated code, branch conversations, and slice history.
- **Scheduled Actions**: Define actions to run asynchronously in the background.
- **Keyboard shortcuts** (see below)
- **Responsive design** for mobile & desktop

### ⌨️ Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Send message |
| `Ctrl+Shift+N` | New chat |
| `Ctrl+K` | Focus input |
| `Ctrl+B` | Toggle sidebar |
| `Escape` | Close modals |

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- A Gemini API key and/or Hugging Face API token

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd "Ai chat progect"

# Install dependencies
pip install -r requirements.txt

# Set environment variables (optional — can also set in UI)
export GEMINI_API_KEY="your-gemini-key"
export HF_API_TOKEN="your-hf-token"

# Start the server
python app.py
```

Open **http://localhost:5000** in your browser.

### First-Time Setup
1. Open the app → you'll see the Settings modal
2. Enter your **Gemini API Key** and/or **Hugging Face API Key**
3. (Optional) Click **Login / Register** to create an account for persistent history
4. Start chatting!

---

## 📁 Project Structure

```
├── app.py                  # Main Flask server (routes, chat logic, WebSocket)
├── auth.py                 # User authentication & chat history DB
├── chat.py                 # Simple standalone CLI chat
├── requirements.txt        # Python dependencies
├── templates/
│   ├── index.html          # Main chat UI (single-page app)
│   └── login.html          # Login/register page
├── reasoning/              # Multi-agent reasoning engine
│   ├── __init__.py
│   ├── pipeline.py         # Orchestrator (runs the agent chain)
│   ├── classifier.py       # Intent classification
│   ├── introspector.py     # Self-questioning
│   ├── strategists.py      # Architect & Skeptic agents
│   ├── synthesizer.py      # Final answer composition
│   ├── slicer.py           # Context windowing
│   ├── memory.py           # Persistent memory (manifesto, heuristics)
│   ├── constitution.py     # System prompts & guardrails
│   └── learning.py         # Adaptive learning from past interactions
├── tests/                  # Unit test suite
│   ├── test_auth.py        # Auth & DB tests
│   ├── test_app.py         # Route & API tests
│   └── test_helpers.py     # Utility function tests
├── data/                   # SQLite database (auto-created)
└── logs/                   # Application logs (auto-created)
```

---

## 🧪 Running Tests

```bash
# Install test dependencies
pip install pytest

# Run all tests
python -m pytest tests/ -v

# Run specific test file
python -m pytest tests/test_auth.py -v

# Run with coverage (if pytest-cov installed)
python -m pytest tests/ -v --cov=. --cov-report=term-missing
```

---

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Optional | Default Gemini API key (users can also set in UI) |
| `HF_API_TOKEN` | Optional | Default Hugging Face token |
| `SECRET_KEY` | Optional | Flask session secret (auto-generated if not set) |

### Available Models

| Model | Provider | Speed | Quality |
|-------|----------|-------|---------|
| Gemini 3 Flash | Google | ⚡⚡ | ⭐⭐⭐ |
| Gemini 3 Pro | Google | ⚡ | ⭐⭐⭐⭐⭐ |
| Gemini 2.5 Flash | Google | ⚡⚡ | ⭐⭐⭐⭐ |
| Gemini 2.0 Flash | Google | ⚡⚡⚡ | ⭐⭐⭐ |
| Gemini 2.0 Flash Lite | Google | ⚡⚡⚡⚡ | ⭐⭐ |
| Multi Preset | Mixed | ⚡ | ⭐⭐⭐⭐ |
| Qwen 2.5 Coder 7B | HuggingFace | ⚡⚡⚡ | ⭐⭐⭐ |
| Qwen 2.5 Coder 32B | HuggingFace | ⚡⚡ | ⭐⭐⭐⭐ |
| Llama 3.1 8B | HuggingFace | ⚡⚡⚡ | ⭐⭐⭐ |
| Llama 3.3 70B | HuggingFace | ⚡ | ⭐⭐⭐⭐⭐ |

---

## 🔒 Security

- Password hashing with salt (SHA-256)
- API key authentication for external access
- Rate limiting (40 requests/minute per IP)
- Input sanitization & length limits
- Secret redaction in file contexts
- Path traversal protection for file attachments

---

## 📝 API Reference

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Main chat UI |
| `GET` | `/login` | Login/register page |
| `GET` | `/api/v1/health` | Health check |
| `GET` | `/api/v1/models` | List available models |

### Authenticated Endpoints (API Key via `X-API-Key` header)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/chat` | Send message & get AI response |

### Session Endpoints (Cookie auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Login |
| `POST` | `/auth/logout` | Logout |
| `GET` | `/auth/me` | Current user info |
| `GET` | `/api/sessions` | List chat sessions |
| `POST` | `/api/sessions` | Create new session |
| `GET` | `/api/sessions/:id/messages` | Get session messages |
| `DELETE` | `/api/sessions/:id` | Delete session |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `connect` | ← Server | Connection established |
| `chat_message` | → Server | Send a chat message |
| `chat_thinking` | ← Client | Thinking stage update |
| `chat_response` | ← Client | AI response |
| `chat_error` | ← Client | Error occurred |

---

## 📄 License

This project is for educational and personal use.
