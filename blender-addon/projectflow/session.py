"""Storage for the personal access token, and the signed-in state derived from it.

The token is long-lived and revocable, so the thing that matters most is where
it sits at rest. Preference order:

1. The OS credential store via ``keyring`` (Keychain, Credential Manager,
   Secret Service). Encrypted at rest and outside Blender's own files.
2. A file under Blender's config directory with owner-only permissions.

``keyring`` is not bundled with Blender. Adding its wheels to
``blender_manifest.toml`` enables the first option; without them the add-on
falls back to the second and says so in Preferences, rather than failing.

Storing the token in ``AddonPreferences`` was rejected outright: those serialise
into ``userpref.blend``, a file people copy between machines and occasionally
commit to dotfile repositories. ``subtype='PASSWORD'`` only masks the characters
in the UI and does nothing to the stored value.
"""

from __future__ import annotations

import json
import os
import stat
from typing import Any, Dict, Optional

_SERVICE_NAME = "ProjectFlow-Blender"
_ACCOUNT_NAME = "access-token"
_FALLBACK_FILENAME = "projectflow_credentials.json"

# Resolved once on first use: True if keyring imported and actually works.
_keyring_module: Optional[Any] = None
_keyring_checked = False


def _keyring() -> Optional[Any]:
    """Returns a working keyring module, or None.

    An import success is not enough. On Linux without a Secret Service provider
    the import works but every call raises, so this probes it once.
    """
    global _keyring_module, _keyring_checked

    if _keyring_checked:
        return _keyring_module

    _keyring_checked = True
    try:
        import keyring  # type: ignore
        from keyring.errors import KeyringError  # type: ignore

        try:
            keyring.get_password(_SERVICE_NAME, "__probe__")
        except KeyringError:
            _keyring_module = None
            return None

        _keyring_module = keyring
    except Exception:  # noqa: BLE001 - any failure means we use the fallback
        _keyring_module = None

    return _keyring_module


def storage_backend() -> str:
    """Human-readable description of where the token is being kept."""
    return "OS credential store" if _keyring() else "config file (owner-only)"


def _fallback_path() -> str:
    import bpy

    config_dir = bpy.utils.user_resource("CONFIG", create=True)
    return os.path.join(config_dir, _FALLBACK_FILENAME)


def _write_fallback(data: Dict[str, str]) -> None:
    path = _fallback_path()
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle)

    # Owner read/write only. Meaningful on macOS and Linux; on Windows the ACL
    # model makes this largely symbolic, which is part of why keyring is preferred.
    try:
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass


def _read_fallback() -> Dict[str, str]:
    path = _fallback_path()
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_token(token: str) -> None:
    ring = _keyring()
    if ring is not None:
        try:
            ring.set_password(_SERVICE_NAME, _ACCOUNT_NAME, token)
            return
        except Exception:  # noqa: BLE001 - fall through to the file backend
            pass
    _write_fallback({"token": token})


def load_token() -> Optional[str]:
    ring = _keyring()
    if ring is not None:
        try:
            token = ring.get_password(_SERVICE_NAME, _ACCOUNT_NAME)
            if token:
                return token
        except Exception:  # noqa: BLE001
            pass

    token = _read_fallback().get("token")
    return token or None


def clear_token() -> None:
    """Removes the token from both backends, so signing out is unambiguous."""
    ring = _keyring()
    if ring is not None:
        try:
            ring.delete_password(_SERVICE_NAME, _ACCOUNT_NAME)
        except Exception:  # noqa: BLE001 - nothing stored is a fine outcome
            pass

    try:
        os.remove(_fallback_path())
    except OSError:
        pass


class SessionState:
    """In-memory signed-in state for the running Blender session.

    Deliberately not a Blender property group: none of this should persist into
    a .blend file or into user preferences.
    """

    def __init__(self) -> None:
        self.user: Optional[Dict[str, Any]] = None
        self.status: str = ""
        self.error: str = ""
        self.checking: bool = False
        self.server_warm: bool = False

    @property
    def signed_in(self) -> bool:
        return self.user is not None

    @property
    def display_name(self) -> str:
        if not self.user:
            return ""
        return self.user.get("name") or self.user.get("email") or "Unknown"

    def sign_out(self) -> None:
        clear_token()
        self.user = None
        self.status = ""
        self.error = ""


#: Module-level singleton. Only ever touched from the main thread.
state = SessionState()
