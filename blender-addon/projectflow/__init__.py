"""ProjectFlow for Blender.

Brings a ProjectFlow workspace into Blender: 3D assets land in the Asset
Browser, and board cards appear in the 3D viewport sidebar so an artist can
attach what they just made and hand the card to the next stage without leaving
the program.

Metadata lives in ``blender_manifest.toml`` (Blender 4.2+ extension format), so
there is deliberately no ``bl_info`` dict here.
"""

from __future__ import annotations

import bpy

from . import (
    export_settings,
    ops_assets,
    ops_auth,
    ops_boards,
    ops_presets,
    preferences,
    properties,
    session,
    tasks,
    ui,
)

# Order matters: properties define the types panels reference, preferences are
# read by operators, and the UI must come last because it references everything.
_modules = (
    properties,
    export_settings,
    preferences,
    ops_auth,
    ops_assets,
    ops_presets,
    ops_boards,
    ui,
)


def _auto_connect() -> None:
    """Validates the stored token shortly after load, and wakes the server.

    Deferred by a timer because ``register()`` runs before the window manager is
    fully available, and operators cannot be called from it.

    Doing this at startup rather than on first click is what hides the free-tier
    cold start: by the time someone has opened the sidebar and picked a
    workspace, the instance is already awake.
    """
    if not bpy.app.online_access:
        return None

    if session.load_token() is None:
        return None

    try:
        bpy.ops.projectflow.refresh_session()
    except RuntimeError as exc:
        print(f"[ProjectFlow] Could not start the session check: {exc}")

    return None  # run once


def register() -> None:
    for module in _modules:
        module.register()

    bpy.app.timers.register(_auto_connect, first_interval=1.0)


def unregister() -> None:
    # Stop background work before tearing classes down: a result arriving
    # mid-unregister would call into handlers that no longer exist.
    tasks.shutdown()

    if bpy.app.timers.is_registered(_auto_connect):
        bpy.app.timers.unregister(_auto_connect)

    for module in reversed(_modules):
        try:
            module.unregister()
        except Exception as exc:  # noqa: BLE001 - keep unregistering the rest
            print(f"[ProjectFlow] Error unregistering {module.__name__}: {exc}")
