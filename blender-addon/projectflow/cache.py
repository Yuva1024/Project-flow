"""Local file cache, keyed on the content hash already present in each asset URL.

The server stores every upload at ``files/<sha256>.<ext>`` — the hash *is* the
URL. Three useful properties fall out of that for free:

* A file already on disk never needs downloading again, for any asset, in any
  workspace, by any name.
* Changed content produces a different URL, so there is nothing to invalidate.
  A stale entry cannot exist.
* Two assets with identical bytes share one local copy, matching the
  deduplication the server already does.

So the cache is flat and content-addressed, mirroring the bucket, with the
human-readable filename living only in the generated .blend.
"""

from __future__ import annotations

import os
import re
import shutil
from typing import Iterable, List, Optional, Tuple

#: ``files/<64 hex chars><.ext>`` as written by the server's CAS uploader.
_CAS_PATTERN = re.compile(r"/files/([0-9a-f]{64})(\.[A-Za-z0-9]+)?$")

#: Model formats the add-on knows how to import into a .blend.
SUPPORTED_MODEL_EXTENSIONS = {".glb", ".gltf", ".obj", ".fbx"}


def parse_cas_url(file_url: str) -> Optional[Tuple[str, str]]:
    """Extracts ``(hash, extension)`` from a CAS URL, or None if it is not one.

    Assets uploaded before the move to content-addressed storage still carry
    older ``attachments/`` or ``assets/`` URLs. Those are handled by falling
    back to the URL basename, which is stable enough to cache on.
    """
    match = _CAS_PATTERN.search(file_url)
    if not match:
        return None
    return match.group(1), (match.group(2) or "").lower()


def cache_key(file_url: str, file_name: str) -> str:
    """Returns the cache filename for an asset.

    Content-addressed URLs give a hash. Anything else falls back to the URL's
    own basename, which at least stays stable for a given uploaded file.
    """
    parsed = parse_cas_url(file_url)
    if parsed:
        digest, ext = parsed
        if not ext:
            ext = os.path.splitext(file_name)[1].lower()
        return f"{digest}{ext}"

    basename = os.path.basename(file_url.split("?", 1)[0])
    return basename or file_name


class AssetCache:
    """Owns the on-disk cache directory."""

    def __init__(self, root: str):
        self.root = os.path.abspath(os.path.expanduser(root))

    # -- layout ------------------------------------------------------------

    @property
    def files_dir(self) -> str:
        """Downloaded source files, named by content hash."""
        return os.path.join(self.root, "files")

    @property
    def library_dir(self) -> str:
        """The directory registered with Blender as an asset library."""
        return os.path.join(self.root, "library")

    @property
    def blends_dir(self) -> str:
        """Generated .blend wrappers, one per asset, inside the library."""
        return os.path.join(self.library_dir, "assets")

    @property
    def catalog_file(self) -> str:
        return os.path.join(self.library_dir, "blender_assets.cats.txt")

    def ensure_dirs(self) -> None:
        for path in (self.root, self.files_dir, self.library_dir, self.blends_dir):
            os.makedirs(path, exist_ok=True)

    # -- source files ------------------------------------------------------

    def file_path(self, file_url: str, file_name: str) -> str:
        return os.path.join(self.files_dir, cache_key(file_url, file_name))

    def has_file(self, file_url: str, file_name: str) -> bool:
        path = self.file_path(file_url, file_name)
        # A zero-byte file means an interrupted write; treat it as absent so the
        # next sync replaces it rather than handing an empty file to an importer.
        return os.path.exists(path) and os.path.getsize(path) > 0

    # -- generated blends --------------------------------------------------

    def blend_path(self, asset_id: str) -> str:
        """One .blend per asset.

        Per-asset files mean a changed asset rewrites one small file instead of
        forcing a rebuild of a shared one, and a removed asset is a single
        delete. The cost is a lot of small files, which is the cheaper problem.
        """
        return os.path.join(self.blends_dir, f"{asset_id}.blend")

    def has_blend(self, asset_id: str) -> bool:
        path = self.blend_path(asset_id)
        return os.path.exists(path) and os.path.getsize(path) > 0

    # -- housekeeping ------------------------------------------------------

    def prune_blends(self, keep_asset_ids: Iterable[str]) -> int:
        """Deletes .blend wrappers for assets that no longer exist server-side."""
        keep = {f"{asset_id}.blend" for asset_id in keep_asset_ids}
        removed = 0

        if not os.path.isdir(self.blends_dir):
            return 0

        for name in os.listdir(self.blends_dir):
            if not name.endswith(".blend") or name in keep:
                continue
            try:
                os.remove(os.path.join(self.blends_dir, name))
                removed += 1
            except OSError:
                pass

        return removed

    def orphaned_files(self, referenced_keys: Iterable[str]) -> List[str]:
        """Cached source files nothing in the library points at any more.

        Not deleted automatically. The same bytes may back an asset in another
        workspace that this sync did not look at, and re-downloading gigabytes
        because of an over-eager cleanup is worse than holding a stale file.
        """
        referenced = set(referenced_keys)
        if not os.path.isdir(self.files_dir):
            return []
        return [
            os.path.join(self.files_dir, name)
            for name in os.listdir(self.files_dir)
            if name not in referenced
        ]

    def size_bytes(self) -> int:
        total = 0
        for directory in (self.files_dir, self.blends_dir):
            if not os.path.isdir(directory):
                continue
            for name in os.listdir(directory):
                try:
                    total += os.path.getsize(os.path.join(directory, name))
                except OSError:
                    pass
        return total

    def clear(self) -> None:
        for directory in (self.files_dir, self.blends_dir):
            shutil.rmtree(directory, ignore_errors=True)
        self.ensure_dirs()


def format_size(num_bytes: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:.0f} {unit}" if unit == "B" else f"{num_bytes:.1f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} TB"
