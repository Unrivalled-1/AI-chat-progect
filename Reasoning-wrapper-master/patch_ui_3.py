import re
with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

patch_gc = r'''`<div class="mission-widget-header"><span>Group Chat</span><div class="spacer"></div><button class="hdr-btn" data-misc-delete="${esc(item.id)}">✕</button></div>` +'''
html = html.replace('`<div class="mission-widget-header"><span>Group Chat</span><div class="spacer"></div></div>` +', patch_gc)

patch_note = r'''`<div class="mission-widget-header"><span>${esc(item.title || 'Misc Tile')}</span><div class="spacer"></div><button class="hdr-btn" data-misc-delete="${esc(item.id)}">✕</button></div>` +'''
html = html.replace('`<div class="mission-widget-header"><span>${esc(item.title || \'Misc Tile\')}</span><div class="spacer"></div></div>` +', patch_note)
html = html.replace('`<button class="hdr-btn" data-misc-delete="${esc(item.id)}">Delete</button>` +', '')

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
