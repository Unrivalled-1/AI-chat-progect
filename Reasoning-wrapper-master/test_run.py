import re

agents = [
    {"name": "Planner", "inputs": []},
    {"name": "Subagent 1", "inputs": [0]},
    {"name": "Subagent 2", "inputs": [0]},
    {"name": "Subagent 3", "inputs": [0]},
    {"name": "Subagent 4", "inputs": [0]},
]

explicit_skips = set()
actual_skipped = set()
prior_outputs = []

for i, agent_cfg in enumerate(agents):
    name = agent_cfg["name"]
    inputs = agent_cfg.get("inputs") or []

    is_skipped = False
    if i in explicit_skips:
        is_skipped = True
    elif inputs and all(idx in actual_skipped for idx in inputs if 0 <= idx < len(agents)):
        is_skipped = True

    if is_skipped:
        actual_skipped.add(i)
        print(f"[{name}] SKIPPED")
        prior_outputs.append(f"[{name}] Skipped")
        continue

    print(f"[{name}] RUNNING")
    
    # Simulate Planner outputting a skip
    if name == "Planner":
        output = "I have assigned tasks... /skip agent 3/" # Note: agent 3 means index 2 (Subagent 2) in the regex! 
        # Wait, the regex:
        for match in re.finditer(r'(?i)/skip\s+([^/]+)/', output):
            target = match.group(1).strip().lower()
            for j, a_cfg in enumerate(agents):
                a_name = str(a_cfg.get("name") or f"Agent {j+1}").strip().lower()
                if target == a_name or target == f"agent {j+1}" or target == str(j+1):
                    if j > i:
                        explicit_skips.add(j)
                        print(f"  -> Added {j} ({a_cfg['name']}) to explicit_skips")
                        
