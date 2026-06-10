const blueprint = [
  {name: "Planner", inputs: []},
  {name: "Subagent 1", inputs: [0]},
  {name: "Subagent 2", inputs: [0]},
  {name: "Subagent 3", inputs: [0]},
  {name: "Subagent 4", inputs: [0]},
  {name: "Writer", inputs: []}
];

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

console.log(blueprintLayers);
