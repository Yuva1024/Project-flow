"""Downloads a ProjectFlow file and imports it into the Content Browser.

The spine of this module is the **content hash**. Files are stored server-side
at ``files/<sha256>.<ext>`` — the hash is the URL. Stamping that hash onto the
imported UAsset as a metadata tag buys three things for nearly nothing:

* **Skip work.** Same hash already imported, nothing to do.
* **Detect updates.** A different hash for the same asset id means someone
  attached a new version, so the plugin can offer a reimport.
* **Reimport in place.** Because it is the same UAsset, material assignments,
  Blueprint references and level placements all survive. That is the part
  people normally pay for.
"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, Optional, Tuple

import unreal

from . import api, config

# Metadata tags written onto every asset this plugin imports.
TAG_HASH = "ProjectFlow.SourceHash"
TAG_ASSET_ID = "ProjectFlow.AssetId"
TAG_SOURCE_NAME = "ProjectFlow.SourceFile"
TAG_CARD_ID = "ProjectFlow.CardId"

#: ``files/<64 hex>.<ext>`` as written by the server's content-addressed uploader.
_CAS_PATTERN = re.compile(r"/files/([0-9a-f]{64})(\.[A-Za-z0-9]+)?$")

SUPPORTED = {".fbx", ".obj", ".glb", ".gltf"}


def parse_hash(file_url: str) -> Optional[Tuple[str, str]]:
    """Returns ``(sha256, extension)`` for a content-addressed URL, else None."""
    match = _CAS_PATTERN.search(file_url or "")
    if not match:
        return None
    return match.group(1), (match.group(2) or "").lower()


def cache_path(file_url: str, file_name: str) -> str:
    """Local path for a source file, keyed on content hash where available."""
    parsed = parse_hash(file_url)
    if parsed:
        digest, ext = parsed
        if not ext:
            ext = os.path.splitext(file_name)[1].lower()
        return os.path.join(config.cache_dir(), f"{digest}{ext}")

    basename = os.path.basename((file_url or "").split("?", 1)[0]) or file_name
    return os.path.join(config.cache_dir(), basename)


def sanitize_name(name: str) -> str:
    """Turns a filename into something valid as a UAsset name.

    Unreal rejects most punctuation in object names and silently mangles the
    rest, so this is done explicitly rather than left to the importer.
    """
    stem = os.path.splitext(os.path.basename(name))[0]
    cleaned = re.sub(r"[^A-Za-z0-9_]", "_", stem).strip("_")
    if not cleaned:
        cleaned = "Asset"
    # An object name cannot begin with a digit.
    if cleaned[0].isdigit():
        cleaned = f"A_{cleaned}"
    return cleaned


def sanitize_path_segment(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_]", "_", name or "").strip("_")
    return cleaned or "Unfiled"


def destination_for(folder_path: str = "") -> str:
    """Builds the Content Browser path an asset should land in."""
    root = (config.get("destination_root") or "/Game/ProjectFlow").rstrip("/")

    if folder_path and config.get("mirror_library_folders", True):
        segments = [sanitize_path_segment(p) for p in folder_path.split("/") if p]
        if segments:
            return f"{root}/{'/'.join(segments)}"
    return root


# -- metadata --------------------------------------------------------------


def read_tag(asset_path: str, tag: str) -> str:
    try:
        asset = unreal.EditorAssetLibrary.load_asset(asset_path)
        if asset is None:
            return ""
        return unreal.EditorAssetLibrary.get_metadata_tag(asset, tag) or ""
    except Exception as exc:  # noqa: BLE001 - a missing tag must never break a browse
        unreal.log_warning(f"[ProjectFlow] Could not read {tag} on {asset_path}: {exc}")
        return ""


def write_tags(asset_path: str, tags: Dict[str, str]) -> None:
    try:
        asset = unreal.EditorAssetLibrary.load_asset(asset_path)
        if asset is None:
            return
        for key, value in tags.items():
            if value:
                unreal.EditorAssetLibrary.set_metadata_tag(asset, key, value)
        unreal.EditorAssetLibrary.save_loaded_asset(asset, only_if_is_dirty=False)
    except Exception as exc:  # noqa: BLE001
        unreal.log_warning(f"[ProjectFlow] Could not tag {asset_path}: {exc}")


def find_existing(asset_id: str, destination: str, asset_name: str) -> Optional[str]:
    """Returns the package path of a previous import of this asset, if any."""
    candidate = f"{destination}/{asset_name}"
    if unreal.EditorAssetLibrary.does_asset_exist(candidate):
        if not asset_id or read_tag(candidate, TAG_ASSET_ID) == asset_id:
            return candidate
    return None


def needs_update(asset_path: str, file_url: str) -> bool:
    """True when the stored hash differs from the one in the current URL."""
    parsed = parse_hash(file_url)
    if not parsed:
        # Legacy non-hashed URL: cannot tell, so do not nag.
        return False
    return read_tag(asset_path, TAG_HASH) != parsed[0]


# -- import options --------------------------------------------------------


def _static_mesh_options() -> unreal.FbxImportUI:
    """Builds FBX import settings from the plugin's saved preferences.

    Written defensively: import option classes have been reorganised across UE
    releases (Interchange in particular), so each setter is attempted
    individually and a missing property is logged rather than aborting the
    import.
    """
    options = unreal.FbxImportUI()

    def _set(target, name, value):
        try:
            target.set_editor_property(name, value)
        except Exception:  # noqa: BLE001
            unreal.log_warning(
                f"[ProjectFlow] This engine build has no import option '{name}'; skipped."
            )

    as_skeletal = bool(config.get("import_as_skeletal", False))

    _set(options, "import_mesh", True)
    _set(options, "import_as_skeletal", as_skeletal)
    _set(options, "import_materials", bool(config.get("import_materials", True)))
    _set(options, "import_textures", bool(config.get("import_textures", True)))
    _set(options, "import_animations", as_skeletal)
    _set(
        options,
        "mesh_type_to_import",
        unreal.FBXImportType.FBXIT_SKELETAL_MESH if as_skeletal else unreal.FBXImportType.FBXIT_STATIC_MESH,
    )

    if not as_skeletal:
        data = options.static_mesh_import_data
        _set(data, "combine_meshes", bool(config.get("combine_meshes", False)))
        _set(data, "generate_lightmap_u_vs", bool(config.get("generate_lightmap_uvs", True)))
        _set(
            data,
            "auto_generate_collision",
            bool(config.get("auto_generate_collision", True)),
        )
        _set(data, "build_nanite", bool(config.get("build_nanite", False)))
    else:
        data = options.skeletal_mesh_import_data
        _set(data, "import_morph_targets", True)
        _set(data, "update_skeleton_reference_pose", False)
        # Unreal treats Blender's leaf bones as real bones; the Blender add-on
        # already strips them on export, and this keeps parity if it did not.
        _set(data, "use_t0_as_ref_pose", False)

    return options


# -- the import itself -----------------------------------------------------


class ImportResult:
    def __init__(self) -> None:
        self.asset_path: str = ""
        self.downloaded: bool = False
        self.skipped: bool = False
        self.reimported: bool = False
        self.error: str = ""

    @property
    def ok(self) -> bool:
        return bool(self.asset_path) and not self.error


def import_file(
    file_url: str,
    file_name: str,
    asset_id: str = "",
    folder_path: str = "",
    card_id: str = "",
    force: bool = False,
    slow_task: Optional[Any] = None,
) -> ImportResult:
    """Downloads and imports one file, or reimports it when the hash moved on."""
    result = ImportResult()

    extension = os.path.splitext(file_name)[1].lower()
    if extension not in SUPPORTED:
        result.error = f"{file_name}: {extension or 'no extension'} is not importable"
        return result

    destination = destination_for(folder_path)
    asset_name = sanitize_name(file_name)
    parsed = parse_hash(file_url)
    digest = parsed[0] if parsed else ""

    existing = find_existing(asset_id, destination, asset_name)
    if existing and not force:
        if not digest or read_tag(existing, TAG_HASH) == digest:
            result.asset_path = existing
            result.skipped = True
            return result

    # -- fetch ------------------------------------------------------------

    local_path = cache_path(file_url, file_name)
    if not (os.path.exists(local_path) and os.path.getsize(local_path) > 0):
        if slow_task:
            slow_task.enter_progress_frame(0.0, f"Downloading {file_name}")
        try:
            api.download_file(file_url, local_path)
            result.downloaded = True
        except api.ApiError as exc:
            result.error = f"{file_name}: {exc.message}"
            return result

    # -- import -----------------------------------------------------------

    if slow_task:
        slow_task.enter_progress_frame(0.0, f"Importing {asset_name}")

    task = unreal.AssetImportTask()
    task.set_editor_property("filename", local_path)
    task.set_editor_property("destination_path", destination)
    task.set_editor_property("destination_name", asset_name)
    task.set_editor_property("automated", True)   # never prompt; we supply options
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("save", True)

    if extension == ".fbx":
        task.set_editor_property("options", _static_mesh_options())
    # glTF and OBJ have their own pipelines and sensible defaults; passing FBX
    # options to them would be rejected.

    try:
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    except Exception as exc:  # noqa: BLE001 - one bad file must not stop a batch
        result.error = f"{file_name}: import failed ({exc})"
        return result

    imported = list(task.get_editor_property("imported_object_paths") or [])
    if not imported:
        result.error = f"{file_name}: the importer produced no assets"
        return result

    # Paths come back as Object paths (/Game/X/Y.Y); the package path is the
    # part before the dot, which is what EditorAssetLibrary expects.
    result.asset_path = imported[0].split(".")[0]
    result.reimported = bool(existing)

    write_tags(
        result.asset_path,
        {
            TAG_HASH: digest,
            TAG_ASSET_ID: asset_id,
            TAG_SOURCE_NAME: file_name,
            TAG_CARD_ID: card_id,
        },
    )

    return result
