# ProjectFlow for Blender

Brings a ProjectFlow workspace into Blender. Workspace 3D assets appear in the
Asset Browser; board cards appear in the 3D viewport sidebar, so an artist can
attach what they just made and hand the card to the next stage without leaving
the program.

Requires **Blender 4.2 or newer** (it is an extension, not a legacy add-on).

---

## Install

1. Download `projectflow-0.1.0.zip` (or build it — see below).
2. In Blender: **Edit → Preferences → Get Extensions → ▾ → Install from Disk…**
3. Pick the zip.
4. Open **Preferences → Add-ons → ProjectFlow** and set your **Server URL**.

### Allow online access

Blender 4.2+ blocks all extension networking behind a global switch. If it is
off, the add-on cannot reach your server and will say so rather than failing
silently.

**Preferences → System → Network → Allow Online Access**

---

## Sign in

Two ways, both ending with a long-lived **personal access token** stored on this
machine. Your password is never stored.

**From Blender** — click *Sign In*, enter your email and password. The add-on
exchanges them for a session token, immediately mints a named access token, then
discards both the password and the session token. The device name you choose is
how this machine appears in your token list on the website.

**From the website** — create a token under **profile icon → My Settings → Access Tokens**, then use
*Paste an Access Token* in Blender.

Tokens do not expire and can be revoked individually from the website, so a lost
laptop is one click rather than a password reset.

### Where the token is kept

In the OS credential store (Keychain, Windows Credential Manager, Secret
Service) when `keyring` is available, otherwise in an owner-only file under
Blender's config directory. Preferences shows which is in use.

To enable the credential store, drop the wheels into `wheels/` and uncomment the
`wheels` list in `blender_manifest.toml`:

```bash
pip download keyring --only-binary=:all: --python-version 3.11 -d wheels/
```

---

## Asset library

**Sidebar (N) → ProjectFlow → Asset Library → Sync Asset Library**

What a sync does:

1. Fetches folders, tags and every 3D asset in the workspace.
2. Writes `blender_assets.cats.txt`, mapping your folder tree onto Blender
   catalogs.
3. Downloads any file not already cached.
4. Builds a `.blend` wrapper per asset in a background Blender process.
5. Removes wrappers for assets deleted server-side.

### Browsing and dragging assets in

Thumbnails and drag-and-drop are the **Asset Browser**, Blender's own editor —
the add-on's job is to fill it. Click **Browse Assets** in the sidebar and it
converts an editor for you, or set one up by hand:

1. Split the window, or change an existing editor's type (the icon at the far
   left of its header).
2. Choose **Asset Browser**.
3. In its header, pick the **ProjectFlow** library.

Then **drag any thumbnail straight into the 3D viewport** to place it.

Dragging is only supported *from the Asset Browser* — Blender has no API for
dragging out of a custom sidebar panel — which is why the add-on routes you
there rather than reimplementing a grid that could not drop anywhere.

### Why it is fast on repeat runs

Files are stored server-side at `files/<sha256>.<ext>` — the content hash *is*
the URL. The local cache keys on that hash, so a file already on disk is never
downloaded again, for any asset, in any workspace. Changed content produces a
different URL, so there is nothing to invalidate.

Asset bytes come straight from R2 and never touch the API server. Only metadata
does.

### Thumbnails

Each asset is rendered to a 256×256 thumbnail while it is built, and the image
is baked into the `.blend` so it shows up the moment the browser indexes it.

The render uses the **Workbench** engine with a camera framed automatically to
the asset's bounding box. Workbench needs no scene lighting, renders in
milliseconds, and matches the solid-shaded look Blender's own asset previews
have. It was chosen over `ed.lib_id_generate_preview`, which depends on a draw
context a background Blender does not reliably provide — that call is kept only
as a fallback.

Turn previews off in Preferences if you want faster syncs and don't mind
generic icons.

---

## Boards and cards

**Sidebar (N) → ProjectFlow → Boards**

Pick a workspace and board, then *Refresh Cards*. Everything on the board
arrives in one request.

Cards move forward through sections as a pipeline, so the primary action is:

**Attach & Move to \<next section\>** — exports your selection to glTF, uploads
it to the card, and advances the card. One click for the loop you repeat all
day.

Also available: attach without advancing, move to any section (including
backwards, for rework), and post a comment.

### Export presets

The attach dialog carries the export options, with presets for the common
destinations:

| Preset | Format | For |
|---|---|---|
| **Unreal Engine (FBX)** | FBX | Importing into UE. Best fidelity |
| **Unreal Engine (glTF)** | GLB | UE5 Interchange, and previews on the card |
| **Preview / Review (GLB)** | GLB | Small file for someone to look at |
| **Source Hand-off (FBX)** | FBX | Modifiers left unapplied, for another artist |

Adjust anything and hit **+** to save your own named preset. They live as JSON
in Blender's config directory, so they survive reinstalling the extension.

#### The options

The dialog carries Blender's full export option set, grouped the way its own
exporter groups them. Sections are collapsed by default and remember what you
left open.

| Group | Options |
|---|---|
| **Include** | Selected only, visible only, active collection, object types (mesh / armature / empty / camera / light / other), custom properties |
| **Transform** | Scale, apply scalings, unit scale, space transform, apply transform, forward and up axis |
| **Geometry** | Apply modifiers, smoothing, triangulate, tangent space, subdivision, loose edges, vertex colours and colour space, materials, embed textures, path mode |
| **Armature** | Primary and secondary bone axis, armature node type, deform bones only, leaf bones |
| **Animation** | Bake animation, key all bones, NLA strips, all actions, force start/end keying, sampling rate, simplify |

For glTF the equivalents appear instead: cameras, punctual lights, extras,
skinning, shape keys, UVs, normals, image format and Draco compression.

That covers 34 of the 39 FBX exporter parameters. The five left out are the
batch-export settings — `batch_mode`, `collection`, `use_batch_own_dir` — which
have no meaning when exporting a single file to upload, plus
`use_mesh_modifiers_render` and `use_metadata`.

Note that **lights and cameras are off by default**. Unreal imports stray lights
as actors you then have to delete, so they are opt-in rather than opt-out.

#### Why the Unreal preset is set up the way it is

Each value fixes a specific, well-known failure importing Blender output into UE:

- **Smoothing = Face** — with smoothing off, Unreal warns on every import and
  falls back to flat shading.
- **Tangent Space on** — without baked tangents, normal maps light incorrectly.
- **Leaf Bones off** — Unreal imports Blender's leaf bones as real bones and
  they clutter the skeleton.
- **Forward −Z, Up Y** — the FBX standard axes Unreal expects. Changing these
  is what produces the classic 90° rotation on the imported root.
- **Embed Textures** — makes the FBX self-contained rather than dependent on
  paths from whoever exported it.
- **Scale 1.0** — leave it. FBX carries unit information and Unreal converts
  metres to centimetres itself; scaling here double-converts.

#### FBX does not preview on the card

The website previews with `<model-viewer>`, which reads glTF only — your own
stability guard deliberately blocks FBX from the parser. So an FBX attachment
imports perfectly into Unreal and shows no preview on the card.

**Also Attach GLB Preview** handles that: it uploads a second, lightweight GLB
alongside the real file, so the card still shows a 3D preview. On by default for
the FBX presets, off for the glTF ones where it would just be a duplicate.

Descriptions are read-only here — Blender's multi-line text editing is poor
enough that *Edit in Browser* is the better answer.

There is no live channel, so the panel shows a snapshot. Hit *Refresh Cards*
after someone else has been working.

---

## The free tier

The backend runs on Render's free plan, which stops the service after ~15
minutes of inactivity. The first request after a quiet period takes 30–60
seconds to wake it.

The add-on handles this: it pings `/api/health` when it loads, budgets a long
timeout for the first call, and shows a "waking server" state rather than a
generic failure. In practice the wake happens while you are still reading the
panel.

Asset downloads are unaffected — they come from R2, which never sleeps.

---

## Development

```
projectflow/
  blender_manifest.toml   Extension metadata (4.2+ format)
  __init__.py             Registration
  api.py                  HTTP client (stdlib urllib — no requests in Blender)
  session.py              Token storage and signed-in state
  tasks.py                Worker threads + main-thread result queue
  cache.py                Content-addressed local cache
  catalogs.py             Folder tree -> blender_assets.cats.txt
  sync.py                 Sync orchestration
  builder.py              Runs in background Blender; writes .blend wrappers
  properties.py           Property groups and enum caches
  preferences.py          Add-on preferences
  ops_auth.py             Sign in / out
  ops_assets.py           Sync, library registration, cache
  ops_boards.py           Boards, cards, attach & advance
  ui.py                   Sidebar panels
```

### Two rules worth knowing before editing

**Only the main thread may touch `bpy`.** Reading or writing Blender data from
a worker thread segfaults the process rather than raising, and the crash usually
surfaces somewhere unrelated. `api.py`, `cache.py` and `catalogs.py` are
deliberately Blender-free; the tests load them by file path partly to enforce
that. Background work goes through `tasks.run()`, whose callbacks fire on the
main thread.

**Dynamic `EnumProperty` items must be cached.** Blender does not keep a
reference to the list a callback returns, so freshly-built strings get garbage
collected while the dropdown still points at them — garbled labels, or a crash.
Every enum callback in `properties.py` returns a module-level list.

### Tests

```bash
cd blender-addon
python -m unittest discover -s tests -v
```

These cover the parts that do not need Blender — CAS parsing, cache behaviour,
catalog generation, URL handling. The catalog UUID test is the important one:
UUIDs are derived from folder IDs with `uuid5`, and if they ever stopped being
deterministic, every sync would silently reset everyone's asset organisation.

### Build the zip

```bash
cd blender-addon
blender --command extension build --source-dir projectflow --output-dir .
```

### Distribution

Extension repositories are static files. Host `index.json` plus the zips
anywhere — Netlify alongside the frontend works — and point Blender at the URL
under **Preferences → Get Extensions → Repositories**. Updates then flow to the
team automatically.
