"""Settings and credential storage for the Unreal plugin.

Lives in the project's ``Saved/ProjectFlow/`` directory rather than anywhere
under ``Content``, so nothing here is ever cooked into a build or committed by
accident — the token especially.
"""

from __future__ import annotations

import json
import os
import stat
from typing import Any, Dict, Optional

import unreal

CONFIG_FILENAME = "settings.json"
CREDENTIALS_FILENAME = "credentials.json"

DEFAULT_SERVER = "https://projectflow-api.onrender.com"

DEFAULTS: Dict[str, Any] = {
    "server_url": DEFAULT_SERVER,
    "workspace_id": "",
    "workspace_name": "",
    # Where imported assets land. The library folder path is appended, so
    # "Environment/Props" becomes /Game/ProjectFlow/Environment/Props.
    "destination_root": "/Game/ProjectFlow",
    "mirror_library_folders": True,
    # Import behaviour
    "combine_meshes": False,
    "generate_lightmap_uvs": True,
    "auto_generate_collision": True,
    "import_materials": True,
    "import_textures": True,
    "build_nanite": False,
    "import_as_skeletal": False,
}


def _plugin_dir() -> str:
    saved = unreal.Paths.project_saved_dir()
    path = os.path.join(unreal.Paths.convert_relative_path_to_full(saved), "ProjectFlow")
    os.makedirs(path, exist_ok=True)
    return path


def cache_dir() -> str:
    """Where downloaded source files are kept before import.

    Content-addressed, mirroring the bucket: the SHA-256 in each asset URL is
    the filename, so a file already here is never fetched again and changed
    content simply has a different name. Nothing to invalidate.
    """
    path = os.path.join(_plugin_dir(), "Cache")
    os.makedirs(path, exist_ok=True)
    return path


# -- settings --------------------------------------------------------------


def _settings_path() -> str:
    return os.path.join(_plugin_dir(), CONFIG_FILENAME)


def load_settings() -> Dict[str, Any]:
    settings = dict(DEFAULTS)
    path = _settings_path()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as handle:
                stored = json.load(handle)
            if isinstance(stored, dict):
                settings.update(stored)
        except (OSError, ValueError):
            unreal.log_warning("[ProjectFlow] Settings file unreadable; using defaults.")
    return settings


def save_settings(settings: Dict[str, Any]) -> None:
    try:
        with open(_settings_path(), "w", encoding="utf-8") as handle:
            json.dump(settings, handle, indent=2)
    except OSError as exc:
        unreal.log_error(f"[ProjectFlow] Could not save settings: {exc}")


def get(key: str, default: Any = None) -> Any:
    return load_settings().get(key, DEFAULTS.get(key, default))


def set_value(key: str, value: Any) -> None:
    settings = load_settings()
    settings[key] = value
    save_settings(settings)


# -- credentials -----------------------------------------------------------


def _credentials_path() -> str:
    return os.path.join(_plugin_dir(), CREDENTIALS_FILENAME)


def load_token() -> Optional[str]:
    path = _credentials_path()
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        token = data.get("token") if isinstance(data, dict) else None
        return token or None
    except (OSError, ValueError):
        return None


def save_token(token: str) -> None:
    path = _credentials_path()
    try:
        with open(path, "w", encoding="utf-8") as handle:
            json.dump({"token": token}, handle)
        # Owner-only. Meaningful on macOS and Linux, largely symbolic on Windows,
        # but it costs nothing and keeps the file out of casual reach.
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    except OSError as exc:
        unreal.log_error(f"[ProjectFlow] Could not save the access token: {exc}")


def clear_token() -> None:
    try:
        os.remove(_credentials_path())
    except OSError:
        pass
