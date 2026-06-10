import re

with open("static/css/main.css", "r") as f:
    content = f.read()

# Replace the forest theme with a new neomorphic forest theme.
old_forest = """    [data-theme="forest"] {
      --orb-a: rgba(52,211,153,0.18); --orb-b: rgba(52,211,153,0.10); --orb-c: rgba(52,211,153,0.07); --orb-d: rgba(52,211,153,0.05);
      --bg: #0c1510; --bg-grad-1: #182a20; --bg-grad-2: #0d1b12;
      --primary: #34d399; --primary-hover: #10b981; --primary-glow: rgba(52,211,153,0.25);
      --text: #ecfdf5; --text-muted: #6ee7b7; --border: rgba(52,211,153,0.2);
      --msg-user: rgba(16,78,47,0.45); --msg-user-border: rgba(52,211,153,0.3);
      --msg-assistant: rgba(12,28,20,0.6); --msg-assistant-border: rgba(52,211,153,0.15);
      --thinking-step: #6ee7b7; --header-bg: rgba(12,24,18,0.6);
      --prism: linear-gradient(90deg, #34d399, #6ee7b7, #10b981, #6ee7b7, #34d399);
    }"""

new_forest = """    /* NEOMORPHIC FOREST THEME */
    [data-theme="forest"] {
      --orb-a: transparent; --orb-b: transparent; --orb-c: transparent; --orb-d: transparent;
      
      /* Base earthy pale green */
      --bg-base: #e0e5dd;
      --bg: var(--bg-base); --bg-grad-1: var(--bg-base); --bg-grad-2: var(--bg-base);
      
      /* Neomorphic specific colors */
      --neo-light: #f1f7ee;
      --neo-dark: #bfc4bc;
      
      /* Override glass styles to use solid neomorphic styles */
      --glass-1: var(--bg-base); --glass-2: var(--bg-base); --glass-3: var(--bg-base);
      --glass-border: transparent; --glass-hi: transparent;
      --glass-shadow:  6px 6px 14px var(--neo-dark), -6px -6px 14px var(--neo-light);
      --shadow-inset: inset 4px 4px 8px var(--neo-dark), inset -4px -4px 8px var(--neo-light);
      --glass-blur: 0px;
      
      --primary: #52795c; --primary-hover: #405e48; --primary-glow: transparent;
      --text: #2f4034; --text-muted: #667c6e; --border: transparent;
      
      --msg-user: var(--bg-base); --msg-user-border: transparent;
      --msg-assistant: var(--bg-base); --msg-assistant-border: transparent;
      
      /* Slightly recessed code block */
      --code-bg: #d1d6ce; --code-header: #c5cac2;
      
      --thinking-step: #52795c;
      --header-bg: var(--bg-base);
      --panel-bg: var(--bg-base);
      --overlay-bg: rgba(47,64,52,0.3);
      --modal-bg: var(--bg-base);
      --menu-bg: var(--bg-base);
      
      --prism: none;
    }
    body[data-theme="forest"]::before, body[data-theme="forest"]::after { background: var(--bg-base); animation: none; display:block; z-index:-1; content:''; position:fixed; inset:0; }
    [data-theme="forest"] .bg-orbs { display: none; }
    
    /* Apply Neomorphism to UI Elements */
    [data-theme="forest"] .hdr-btn,
    [data-theme="forest"] .custom-select-btn,
    [data-theme="forest"] .sb-view-toggle,
    [data-theme="forest"] .theme-opt,
    [data-theme="forest"] .cal-day:not(.empty) {
      box-shadow: 4px 4px 10px var(--neo-dark), -4px -4px 10px var(--neo-light) !important;
      border: none !important;
      background: var(--bg-base) !important;
    }
    
    [data-theme="forest"] .hdr-btn:active,
    [data-theme="forest"] .custom-select-btn:active,
    [data-theme="forest"] .theme-opt:active,
    [data-theme="forest"] .msg {
      box-shadow: inset 4px 4px 8px var(--neo-dark), inset -4px -4px 8px var(--neo-light) !important;
      border: none !important;
      background: var(--bg-base) !important;
    }

    [data-theme="forest"] header,
    [data-theme="forest"] #sidebar,
    [data-theme="forest"] .modal-card,
    [data-theme="forest"] #chat-container {
      box-shadow: 8px 8px 16px var(--neo-dark), -8px -8px 16px var(--neo-light) !important;
      border: none !important;
      background: var(--bg-base) !important;
    }

    /* Recessed Inputs */
    [data-theme="forest"] #user-input,
    [data-theme="forest"] input[type="text"],
    [data-theme="forest"] input[type="password"],
    [data-theme="forest"] select,
    [data-theme="forest"] textarea,
    [data-theme="forest"] .history-item {
      box-shadow: inset 4px 4px 8px var(--neo-dark), inset -4px -4px 8px var(--neo-light) !important;
      border: none !important;
      background: var(--bg-base) !important;
    }
    
    /* Pop out buttons */
    [data-theme="forest"] #send-btn {
      box-shadow: 4px 4px 10px var(--neo-dark), -4px -4px 10px var(--neo-light) !important;
      background: var(--bg-base) !important;
      color: var(--primary) !important;
    }
    [data-theme="forest"] #send-btn:active {
      box-shadow: inset 4px 4px 8px var(--neo-dark), inset -4px -4px 8px var(--neo-light) !important;
    }"""

if old_forest in content:
    content = content.replace(old_forest, new_forest)
    with open("static/css/main.css", "w") as f:
        f.write(content)
    print("Replaced forest theme successfully")
else:
    print("Could not find the exact old forest string to replace. I will do a regex replacement.")
    content = re.sub(r'\[data-theme="forest"\] \{[^}]+\}', new_forest, content, count=1)
    with open("static/css/main.css", "w") as f:
        f.write(content)
    print("Regex replacement completed.")
