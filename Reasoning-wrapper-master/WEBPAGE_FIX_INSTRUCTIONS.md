# Webpage Recovery & Fix Instructions

## What was happening
The homepage UI loaded, but buttons/themes were not working consistently.

## Immediate fix applied
The root route (`/`) now serves the stable backup template:
- `templates/index_old_backup.html`

This was changed in:
- `app.py` (`index()` route)

## How to verify
1. Stop the running server.
2. Start it again with:
   - `python3 app.py`
3. Open:
   - `http://localhost:5000`
4. Confirm:
   - Sidebar/menu buttons respond
   - Settings opens
   - Theme switching applies correctly

## If it breaks again
1. Confirm root route still points to backup template in `app.py`:
   - `return render_template("index_old_backup.html", model=DEFAULT_MODEL, models=MODELS_CONFIG)`
2. Hard refresh browser cache:
   - `Ctrl + Shift + R`
3. Clear site data/local storage for `localhost:5000` if needed.
4. Check server logs for route/template errors.

## Long-term cleanup plan
When ready to restore the newer UI (`templates/index.html`):
1. Compare it with `templates/index_old_backup.html`.
2. Fix JS/runtime issues in the new file.
3. Switch route back to:
   - `render_template("index.html", model=DEFAULT_MODEL, models=MODELS_CONFIG)`
4. Re-test all controls and theme persistence.
