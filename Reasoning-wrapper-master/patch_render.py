with open("templates/index.html", "r") as f:
    text = f.read()

bad_str = """  function renderMissionMiscTiles() {
    if (!missionWidgetGrid) return;
    document.querySelectorAll('.misc-tile-dynamic').forEach(el => el.remove());
    function renderMissionMiscTiles() {
    if (!missionWidgetGrid) return;
    document.querySelectorAll('.misc-tile-dynamic').forEach(el => el.remove());"""

good_str = """  function renderMissionMiscTiles() {
    if (!missionWidgetGrid) return;
    document.querySelectorAll('.misc-tile-dynamic').forEach(el => el.remove());"""

text = text.replace(bad_str, good_str)
with open("templates/index.html", "w") as f:
    f.write(text)
