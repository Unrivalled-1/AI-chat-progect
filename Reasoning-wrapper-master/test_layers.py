blueprint = [
  {"name": "Planner", "inputs": []},
  {"name": "Subagent 1", "inputs": [0]},
  {"name": "Subagent 2", "inputs": [0]},
  {"name": "Subagent 3", "inputs": [0]},
  {"name": "Subagent 4", "inputs": [0]},
  {"name": "Writer", "inputs": []}
]

blueprintLayers = {node["name"]: 0 for node in blueprint}

changed = True
while changed:
    changed = False
    for i, node in enumerate(blueprint):
        maxParentLayer = -1
        parentIndices = node.get("inputs") or []
        if len(parentIndices) == 0 and i > 0:
            parentIndices = [i - 1]
            
        for parentIdx in parentIndices:
            if 0 <= parentIdx < len(blueprint):
                parentName = blueprint[parentIdx]["name"]
                if parentName in blueprintLayers:
                    maxParentLayer = max(maxParentLayer, blueprintLayers.get(parentName, -1))
        
        if maxParentLayer != -1 and blueprintLayers[node["name"]] != maxParentLayer + 1:
            blueprintLayers[node["name"]] = maxParentLayer + 1
            changed = True

print(blueprintLayers)
