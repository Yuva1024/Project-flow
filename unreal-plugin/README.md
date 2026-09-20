# ProjectFlow for Unreal Engine

Browse your ProjectFlow asset library and boards from inside the editor, and
import assets straight into the Content Browser.

A **Python plugin**, not C++ — nothing to compile, nothing to rebuild per
engine version, and installing it is copying a folder.

---

## Install

1. Copy the `ProjectFlow` folder into your project's `Plugins/` directory:
   `YourProject/Plugins/ProjectFlow/`
2. Restart the editor.
3. **Edit → Plugins** → confirm **Python Editor Script Plugin** and
   **Editor Scripting Utilities** are enabled (this plugin declares both as
   dependencies, so they usually enable themselves).
4. A **ProjectFlow** menu appears in the main menu bar.

## Sign in

**ProjectFlow → Sign In…** and paste a personal access token. Create one on the
website under Account → Access Tokens.

A token rather than a password: it can be revoked from the website without
touching your account, and the plugin never handles a credential you use
elsewhere. It is stored in `Saved/ProjectFlow/credentials.json`, deliberately
outside `Content/` so it can never be cooked into a build or committed.

If your engine build has no text-input dialog, use the Python console instead:

```python
import projectflow
projectflow.actions.set_token('pf_your_token')
```

---

## Using it

**ProjectFlow → Refresh** loads everything in one pass. The menus are built
from that cached data, so browsing costs nothing — a submenu that fetched on
expand would be slow and would burn the server's rate limit while you looked
around.

### Asset library

**ProjectFlow → Asset Library** lists every 3D asset, grouped by the same
folders as the website. Click one to download and import it. **Import All…**
does the lot, skipping anything already imported at the same version.

Assets land in `/Game/ProjectFlow/<folder path>`, mirroring the library's own
structure. Change the root or turn mirroring off in settings.

### Boards and cards

**ProjectFlow → Boards → ‹board› → ‹section› → ‹card›**, then **Load
Attachments…** and click a file to import it.

Cards show their attachment count in brackets. Attachments are fetched per card
rather than up front, because the board payload carries counts only and pulling
files for every card would be a request each.

Importing a card attachment always uses the real file, never the preview — an
FBX attachment may carry a small GLB so the website can render something, but
that stand-in is not what belongs in the engine.

---

## Update detection

This is what the plugin is actually for.

Files are stored server-side at `files/<sha256>.<ext>` — the content hash *is*
the URL. Every asset this plugin imports gets that hash written onto it as a
metadata tag, so the plugin always knows which source produced which UAsset.

**ProjectFlow → Check for Updates…** compares stored hashes against the current
ones and offers to reimport anything that has moved on.

Because the reimport goes through the *same* UAsset, **material assignments,
Blueprint references and level placements all survive**. That is the difference
between updating an asset and re-hooking it up everywhere.

It also means nothing downloads twice: same hash, already imported, skipped.

---

## Settings

**ProjectFlow → Settings…** shows the current configuration. Change values from
the Python console:

```python
import projectflow
projectflow.config.set_value('build_nanite', True)
```

| Key | Default | Notes |
|---|---|---|
| `server_url` | Render URL | Your backend |
| `destination_root` | `/Game/ProjectFlow` | Where imports land |
| `mirror_library_folders` | `True` | Recreate the library's folder tree |
| `combine_meshes` | `False` | One asset from a multi-object FBX |
| `generate_lightmap_uvs` | `True` | Needed unless you are fully Lumen |
| `auto_generate_collision` | `True` | Or import `UCX_` meshes from the FBX |
| `build_nanite` | `False` | Static environment meshes benefit |
| `import_as_skeletal` | `False` | Skeletal meshes and animation |
| `import_materials` / `import_textures` | `True` | Or assign your own |

Settings live in `Saved/ProjectFlow/settings.json`.

---

## Notes for whoever edits this

**Only the main thread may touch `unreal`.** The engine's Python API is not
thread-safe, and a background thread using it takes the editor down rather than
raising. Long operations use `ScopedSlowTask` — which also makes them
cancellable — instead of being moved off-thread. `api.py` is the one module
that imports no engine API at all, which is what makes it safe to reuse and
testable outside the editor.

**Menu entry objects must stay referenced from Python.** Unreal holds only a
weak reference to a `ToolMenuEntryScript`, so an entry that goes out of scope
is collected and its callback silently stops firing. Everything built in
`menus.py` is parked in a module-level list.

**Import options move between engine releases.** Every option is set through a
helper that catches a missing property and logs it rather than aborting the
import, so an engine upgrade degrades to "that option was ignored" instead of
breaking.

### Tests

```bash
cd unreal-plugin
python -m unittest discover -s tests -v
```

Fifteen cases covering hash parsing, cache keying, asset-name sanitisation,
destination mapping and config storage. They stub `unreal`, so they run
anywhere — and one of them asserts that `api.py` imports with no engine module
present at all.

### Engine versions

Written against the UE 5.x Python API and the `FbxImportUI` option classes.
Newer releases route FBX through the Interchange framework instead; the
defensive option setting above means imports still work, but if Interchange
ignores these settings entirely, `importer.py` is the single file to update.

---

## Relationship to the Blender add-on

Same server, same tokens, same content hashes. An artist exports from Blender
with the **Unreal Engine (FBX)** preset and attaches it to a card; this plugin
sees the new hash and offers the reimport. The two clients are deliberately
shaped alike so a fix to one is obvious to apply to the other.
