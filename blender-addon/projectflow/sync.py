"""Orchestrates one asset-library sync.

Runs entirely on a worker thread, so nothing here may touch ``bpy`` — with one
deliberate exception noted at ``run_builder``, which only reads
``bpy.app.binary_path``, a constant string safe to read from anywhere.

The sequence:

1. Fetch folders, tags and the 3D asset list from the API.
2. Write the catalog file from the folder tree.
3. Download any source file whose content hash is not already cached.
4. Build a .blend wrapper for every asset that lacks one.
5. Prune wrappers for assets that no longer exist server-side.

Steps 3 and 4 both skip work that is already done, so a repeat sync with no
changes costs a handful of API calls and nothing else.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from typing import Any, Callable, Dict, List, Optional

from . import api, cache, catalogs

ProgressFn = Callable[[str, float], None]


class SyncResult:
    """Summary of one sync, reported back to the UI."""

    def __init__(self) -> None:
        self.assets_seen = 0
        self.downloaded = 0
        self.downloaded_bytes = 0
        self.built = 0
        self.build_failed = 0
        self.pruned = 0
        self.skipped_unsupported = 0
        self.errors: List[str] = []

    def summary(self) -> str:
        bits = [f"{self.assets_seen} asset(s)"]
        if self.downloaded:
            bits.append(f"{self.downloaded} downloaded ({cache.format_size(self.downloaded_bytes)})")
        if self.built:
            bits.append(f"{self.built} built")
        if self.build_failed:
            bits.append(f"{self.build_failed} failed")
        if self.pruned:
            bits.append(f"{self.pruned} removed")
        if self.skipped_unsupported:
            bits.append(f"{self.skipped_unsupported} unsupported")
        return ", ".join(bits)


def _asset_extension(asset: Dict[str, Any]) -> str:
    """Extension from the stored filename, falling back to the URL."""
    ext = os.path.splitext(asset.get("fileName") or "")[1].lower()
    if ext:
        return ext
    parsed = cache.parse_cas_url(asset.get("fileUrl") or "")
    return parsed[1] if parsed else ""


def run_sync(
    client: api.ApiClient,
    workspace_id: str,
    asset_cache: cache.AssetCache,
    progress: Optional[ProgressFn] = None,
    generate_previews: bool = True,
    folder_id: Optional[str] = None,
) -> SyncResult:
    """Performs a full sync. Call from a worker thread only."""
    result = SyncResult()

    def report(message: str, fraction: float) -> None:
        if progress:
            progress(message, fraction)

    asset_cache.ensure_dirs()

    # -- 1. metadata -------------------------------------------------------

    report("Fetching folders…", 0.02)
    folders = client.asset_folders(workspace_id)
    tree = catalogs.CatalogTree(folders)

    report("Writing catalogs…", 0.05)
    catalogs.write_catalog_file(asset_cache.catalog_file, tree)

    report("Listing assets…", 0.08)
    assets = list(
        client.iter_assets(workspace_id, mime_type="3d", folder_id=folder_id)
    )
    result.assets_seen = len(assets)

    if not assets:
        report("No 3D assets found", 1.0)
        return result

    # -- 2. downloads ------------------------------------------------------

    # Several assets can share one file thanks to server-side deduplication, so
    # work out the distinct files first and fetch each exactly once.
    pending: Dict[str, Dict[str, Any]] = {}
    for asset in assets:
        file_url = asset.get("fileUrl") or ""
        file_name = asset.get("fileName") or ""
        ext = _asset_extension(asset)

        if ext not in cache.SUPPORTED_MODEL_EXTENSIONS:
            result.skipped_unsupported += 1
            continue

        if asset_cache.has_file(file_url, file_name):
            continue

        key = cache.cache_key(file_url, file_name)
        pending.setdefault(key, {"url": file_url, "name": file_name})

    for index, (key, info) in enumerate(pending.items(), start=1):
        fraction = 0.1 + 0.5 * (index / max(len(pending), 1))
        report(f"Downloading {info['name']} ({index}/{len(pending)})", fraction)
        destination = os.path.join(asset_cache.files_dir, key)
        try:
            written = api.download_file(info["url"], destination)
            result.downloaded += 1
            result.downloaded_bytes += written
        except api.ApiError as exc:
            result.errors.append(f"{info['name']}: {exc.message}")

    # -- 3. build .blend wrappers -----------------------------------------

    jobs: List[Dict[str, Any]] = []
    for asset in assets:
        asset_id = asset.get("id")
        file_url = asset.get("fileUrl") or ""
        file_name = asset.get("fileName") or ""

        if not asset_id or _asset_extension(asset) not in cache.SUPPORTED_MODEL_EXTENSIONS:
            continue
        if not asset_cache.has_file(file_url, file_name):
            continue  # its download failed above; already recorded
        if asset_cache.has_blend(asset_id):
            continue

        uploader = asset.get("uploadedBy") or {}
        tag_names = [
            (entry.get("tag") or {}).get("name")
            for entry in (asset.get("tags") or [])
        ]

        jobs.append(
            {
                "asset_id": asset_id,
                "source": asset_cache.file_path(file_url, file_name),
                "blend_path": asset_cache.blend_path(asset_id),
                "name": os.path.splitext(file_name)[0] or "Asset",
                "catalog_id": tree.uuid_for(asset.get("folderId")),
                "author": uploader.get("name") or "",
                "description": f"{file_name} — from ProjectFlow",
                "tags": [name for name in tag_names if name],
                "previews": generate_previews,
            }
        )

    if jobs:
        report(f"Building {len(jobs)} asset(s) in Blender…", 0.65)
        built, failed, errors = run_builder(jobs, progress=report)
        result.built = built
        result.build_failed = failed
        result.errors.extend(errors)

    # -- 4. prune ----------------------------------------------------------

    report("Cleaning up…", 0.96)
    result.pruned = asset_cache.prune_blends(
        asset.get("id") for asset in assets if asset.get("id")
    )

    report("Sync complete", 1.0)
    return result


def run_builder(
    jobs: List[Dict[str, Any]],
    progress: Optional[ProgressFn] = None,
) -> tuple:
    """Runs the background Blender that writes .blend wrappers.

    Reads ``bpy.app.binary_path`` — a constant string, which is the one bpy
    access that is safe off the main thread. Nothing else here touches Blender.
    """
    import bpy

    binary = bpy.app.binary_path
    if not binary or not os.path.exists(binary):
        return 0, len(jobs), ["Could not locate the Blender executable"]

    builder_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "builder.py")

    handle, job_path = tempfile.mkstemp(suffix=".json", prefix="projectflow-jobs-")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as fh:
            json.dump(jobs, fh)

        command = [
            binary,
            "--background",
            # Ignore the user's own add-ons and startup file: a third-party
            # importer override or a heavy startup scene would change what gets
            # written into the asset, or slow every batch down.
            "--factory-startup",
            "--python",
            builder_script,
            "--",
            job_path,
        ]

        built = 0
        failed = 0
        errors: List[str] = []
        total = len(jobs)

        creationflags = 0
        if os.name == "nt":
            # Stops a console window flashing up on Windows for each batch.
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=creationflags,
        )

        assert process.stdout is not None
        for line in process.stdout:
            line = line.strip()
            if not line.startswith("@PF@"):
                continue  # Blender's own banner and importer chatter

            try:
                record = json.loads(line[len("@PF@"):])
            except ValueError:
                continue

            kind = record.get("kind")
            if kind == "progress" and progress:
                index = record.get("index", 0)
                fraction = 0.65 + 0.3 * (index / max(total, 1))
                progress(f"Building {record.get('name', '')} ({index}/{total})", fraction)
            elif kind == "built":
                built += 1
            elif kind == "failed":
                failed += 1
                errors.append(f"{record.get('name', 'asset')}: {record.get('error', 'unknown error')}")
            elif kind == "fatal":
                errors.append(record.get("error", "The asset builder failed to start"))

        process.wait()

        if process.returncode != 0 and not errors:
            errors.append(f"The asset builder exited with code {process.returncode}")

        return built, failed, errors

    finally:
        try:
            os.remove(job_path)
        except OSError:
            pass
