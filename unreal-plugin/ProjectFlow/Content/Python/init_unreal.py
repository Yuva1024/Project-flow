"""Runs automatically when the plugin loads.

Unreal executes any init_unreal.py found on the Python path at editor startup,
which is the supported hook for a script-only plugin.

Deliberately does no network work. Building the menu must not depend on a
server that may be asleep — the menu appears immediately, and Refresh (or any
action) wakes the backend when the user actually asks for something.
"""

import traceback

import unreal

try:
    import projectflow

    projectflow.startup()
    unreal.log(f"[ProjectFlow] Plugin {projectflow.__version__} loaded.")
except Exception:
    unreal.log_error("[ProjectFlow] Failed to start:")
    unreal.log_error(traceback.format_exc())
