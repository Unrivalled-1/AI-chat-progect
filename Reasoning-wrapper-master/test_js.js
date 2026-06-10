const modeConfig = {
  agents: [
    {"name": "Planner", "inputs": []},
    {"name": "Subagent 1", "inputs": [0]},
    {"name": "Subagent 2", "inputs": [0]},
    {"name": "Subagent 3", "inputs": [0]},
    {"name": "Subagent 4", "inputs": [0]},
    {"name": "Writer", "inputs": []}
  ]
};

const originalBlueprint = modeConfig.agents.map((a, idx) => ({
  name: a.name,
  inputs: a.inputs
}));

const activeNames = new Set(originalBlueprint.map(b => b.name));

function getTransitiveInputs(nodeName, visited = new Set()) {
  if (visited.has(nodeName)) return [];
  visited.add(nodeName);

  const node = originalBlueprint.find(n => n.name === nodeName);
  if (!node) return [];

  let inputs = [];
  let rawInputs = [];
  const nodeIdx = originalBlueprint.findIndex(n => n.name === nodeName);

  let parentIndices = node.inputs || [];
  if (parentIndices.length === 0 && nodeIdx > 0) {
    parentIndices = [nodeIdx - 1];
  }
  parentIndices.forEach(parentIdx => {
    if (parentIdx >= 0 && parentIdx < modeConfig.agents.length) {
      rawInputs.push(modeConfig.agents[parentIdx].name || `Agent ${parentIdx + 1}`);
    }
  });

  rawInputs.forEach(parentName => {
    if (activeNames.has(parentName)) {
      inputs.push(parentName);
    } else {
      inputs.push(...getTransitiveInputs(parentName, visited));
    }
  });
  return Array.from(new Set(inputs));
}

const agents = originalBlueprint.map(node => {
    return {
        name: node.name,
        inputs: getTransitiveInputs(node.name)
    }
});
console.log(agents);
