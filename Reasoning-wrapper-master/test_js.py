modeConfig = {
  "agents": [
    {"name": "Planner", "inputs": []},
    {"name": "Subagent 1", "inputs": [0]},
    {"name": "Subagent 2", "inputs": [0]},
    {"name": "Subagent 3", "inputs": [0]},
    {"name": "Subagent 4", "inputs": [0]},
    {"name": "Writer", "inputs": []}
  ]
}

originalBlueprint = []
for idx, a in enumerate(modeConfig["agents"]):
    originalBlueprint.append({
        "name": a["name"],
        "inputs": a.get("inputs", [])
    })

activeNames = set([b["name"] for b in originalBlueprint])

def getTransitiveInputs(nodeName, visited=None):
    if visited is None:
        visited = set()
    if nodeName in visited:
        return []
    visited.add(nodeName)

    node = next((n for n in originalBlueprint if n["name"] == nodeName), None)
    if not node:
        return []

    inputs = []
    rawInputs = []
    nodeIdx = next(i for i, n in enumerate(originalBlueprint) if n["name"] == nodeName)

    parentIndices = node.get("inputs", [])
    if len(parentIndices) == 0 and nodeIdx > 0:
        parentIndices = [nodeIdx - 1]

    for parentIdx in parentIndices:
        if 0 <= parentIdx < len(modeConfig["agents"]):
            rawInputs.append(modeConfig["agents"][parentIdx]["name"])

    for parentName in rawInputs:
        if parentName in activeNames:
            inputs.append(parentName)
        else:
            inputs.extend(getTransitiveInputs(parentName, visited))

    return list(set(inputs))

agents = []
for node in originalBlueprint:
    agents.append({
        "name": node["name"],
        "inputs": getTransitiveInputs(node["name"])
    })

print(agents)
