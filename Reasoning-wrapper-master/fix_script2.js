const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

// There's a bug where the script tag gets closed locally and there's a reference to the main chat that makes it render incorrectly or crash due to DOM loading state.
// We disabled the immediate openMissionPage. Let's make sure it doesn't try to fetch /api/scheduled-actions immediately.

html = html.replace(/const res = await fetch\('\/api\/scheduled-actions'\);/g, '/* const res = null; */');
fs.writeFileSync('templates/index.html', html);
