const fs = require('fs');
let html = fs.readFileSync('templates/index.html', 'utf8');

// Replace openMissionPage() call on load to prevent crash if that's what's happening.
html = html.replace(/openMissionPage\(\);\s*}\);\s*const sendBtn/g, '/* openMissionPage(); */\n  });\n  const sendBtn');
fs.writeFileSync('templates/index.html', html);
