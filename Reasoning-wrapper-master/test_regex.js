function esc(s) { return s.replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function formatChatText(text) {
  let noThink = text.replace(/<think>([\s\S]*?)<\/think>/gi, '').trim();
  let escaped = esc(noThink);
  return escaped.replace(/```([\w-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<div lang="${lang}"><code>${code}</code></div>`;
  });
}

console.log(formatChatText("Some <think>reasoning</think> then ```html\n<div>hello</div>\n```"));
