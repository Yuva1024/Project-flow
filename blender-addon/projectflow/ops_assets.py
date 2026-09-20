"""Asset library operators: sync, library registration, and cache maintenance."""

from __future__ import annotations

import os

import bpy
from bpy.types import Operator

from . import api, cache, properties, session, sync, tasks
from .ops_auth import check_online_access, make_client, report_api_error
from .preferences import get_preferences

LIBRARY_NAME = "ProjectFlow"


def ensure_library_registered(context, library_path: str) -> bool:
    """Registers the cache folder as a Blender asset library.

    Blender only indexes directories listed in Preferences > File Paths, so
    without this the synced .blend files exist but never appear in the browser.
    Idempotent, and repoints the entry if the cache folder moved.
    """
    asset_libraries = context.preferences.filepaths.asset_libraries
    normalized = os.path.normpath(library_path)

    for library in asset_libraries:
        if library.name == LIBRARY_NAME:
            if os.path.normpath(bpy.path.abspath(library.path)) != normalized:
                library.path = library_path
            return False
        if os.path.normpath(bpy.path.abspath(library.path)) == normalized:
            return False  # already registered under a different name

    bpy.ops.preferences.asset_library_add(directory=library_path)
    # The operator appends, so the new entry is last.
    asset_libraries[-1].name = LIBRARY_NAME
    return True


class PROJECTFLOW_OT_sync_assets(Operator):
    bl_idname = "projectflow.sync_assets"
    bl_label = "Sync Asset Library"
    bl_description = (
        "Download new 3D assets from your workspace and build them into the "
        "Blender Asset Browser"
    )
    bl_options = {"REGISTER", "INTERNAL"}

    @classmethod
    def poll(cls, context):
        props = getattr(context.window_manager, "projectflow", None)
        return (
            session.state.signed_in
            and props is not None
            and props.workspace_id not in {"", "NONE"}
            and not tasks.is_running("sync-assets")
        )

    def execute(self, context):
        if not check_online_access(self):
            return {"CANCELLED"}

        props = context.window_manager.projectflow
        prefs = get_preferences(context)

        workspace_id = props.workspace_id
        asset_cache = prefs.get_cache()
        generate_previews = prefs.generate_previews
        client = make_client(context)

        if prefs.auto_register_library:
            asset_cache.ensure_dirs()
            ensure_library_registered(context, asset_cache.library_dir)

        props.busy = True
        props.progress = 0
        props.status = "Starting sync…"
        props.last_error = ""

        # Progress arrives from the worker thread. Writing to a Blender property
        # from there is not safe, so it is buffered in a plain dict that the
        # main-thread timer reads.
        progress_state = {"message": "", "fraction": 0.0}

        def on_progress(message: str, fraction: float) -> None:
            progress_state["message"] = message
            progress_state["fraction"] = fraction

        def pump():
            """Main-thread timer that mirrors worker progress into the UI."""
            if not tasks.is_running("sync-assets"):
                return None
            wm = bpy.context.window_manager
            live = getattr(wm, "projectflow", None)
            if live:
                live.status = progress_state["message"]
                live.progress = int(progress_state["fraction"] * 100)
                tasks.redraw_ui()
            return 0.25

        def work():
            return sync.run_sync(
                client,
                workspace_id,
                asset_cache,
                progress=on_progress,
                generate_previews=generate_previews,
            )

        def done(result: sync.SyncResult):
            live = bpy.context.window_manager.projectflow
            live.busy = False
            live.progress = 100
            live.status = result.summary()

            if result.errors:
                live.last_error = result.errors[0]
                for message in result.errors[:5]:
                    print(f"[ProjectFlow] sync: {message}")

            # Blender caches its asset index; without this the browser keeps
            # showing the pre-sync contents until something else invalidates it.
            try:
                bpy.ops.asset.library_refresh()
            except RuntimeError:
                pass  # no Asset Browser open, nothing to refresh

            self.report({"INFO"}, f"ProjectFlow: {result.summary()}")
            tasks.redraw_ui()

        def failed(exc):
            live = bpy.context.window_manager.projectflow
            live.busy = False
            live.progress = 0
            live.status = ""
            live.last_error = report_api_error(None, exc)
            print(f"[ProjectFlow] Sync failed: {exc}")
            tasks.redraw_ui()

        started = tasks.run("sync-assets", "Syncing assets", work, done, failed)
        if not started:
            props.busy = False
            self.report({"WARNING"}, "A sync is already running.")
            return {"CANCELLED"}

        bpy.app.timers.register(pump, first_interval=0.25)
        return {"FINISHED"}


class PROJECTFLOW_OT_register_library(Operator):
    bl_idname = "projectflow.register_library"
    bl_label = "Register Asset Library"
    bl_description = "Add the ProjectFlow cache folder to Blender's asset libraries"
    bl_options = {"REGISTER", "INTERNAL"}

    def execute(self, context):
        prefs = get_preferences(context)
        asset_cache = prefs.get_cache()
        asset_cache.ensure_dirs()

        added = ensure_library_registered(context, asset_cache.library_dir)
        if added:
            self.report({"INFO"}, f"Registered '{LIBRARY_NAME}' asset library.")
        else:
            self.report({"INFO"}, "Asset library was already registered.")
        return {"FINISHED"}


class PROJECTFLOW_OT_clear_cache(Operator):
    bl_idname = "projectflow.clear_cache"
    bl_label = "Clear ProjectFlow Cache"
    bl_description = "Delete every downloaded file and generated .blend"
    bl_options = {"REGISTER", "INTERNAL"}

    def invoke(self, context, event):
        # Destructive and potentially many gigabytes to re-download, so confirm.
        return context.window_manager.invoke_confirm(self, event)

    def execute(self, context):
        prefs = get_preferences(context)
        asset_cache = prefs.get_cache()
        freed = asset_cache.size_bytes()
        asset_cache.clear()

        try:
            bpy.ops.asset.library_refresh()
        except RuntimeError:
            pass

        self.report({"INFO"}, f"Cleared {cache.format_size(freed)} from the cache.")
        return {"FINISHED"}


class PROJECTFLOW_OT_open_cache_folder(Operator):
    bl_idname = "projectflow.open_cache_folder"
    bl_label = "Open Cache Folder"
    bl_description = "Show the ProjectFlow cache folder in your file browser"
    bl_options = {"REGISTER", "INTERNAL"}

    def execute(self, context):
        prefs = get_preferences(context)
        asset_cache = prefs.get_cache()
        asset_cache.ensure_dirs()
        bpy.ops.wm.path_open(filepath=asset_cache.root)
        return {"FINISHED"}


class PROJECTFLOW_OT_open_asset_browser(Operator):
    """Turns an editor into an Asset Browser showing the ProjectFlow library.

    Drag-and-drop into the viewport is a feature of the Asset Browser
    specifically — Blender does not support dragging out of a custom sidebar
    panel — so getting there quickly is the difference between the library
    feeling built-in and feeling hidden.
    """

    bl_idname = "projectflow.open_asset_browser"
    bl_label = "Open Asset Browser"
    bl_description = "Show the ProjectFlow library in an Asset Browser, ready to drag from"
    bl_options = {"REGISTER", "INTERNAL"}

    def execute(self, context):
        screen = context.window.screen

        # Prefer an Asset Browser that is already open.
        target = next((area for area in screen.areas if area.ui_type == "ASSETS"), None)

        if target is None:
            # Otherwise take over the largest area that is not the 3D viewport
            # the user is working in — usually the timeline or an outliner.
            candidates = [
                area
                for area in screen.areas
                if area.type not in {"VIEW_3D", "PROPERTIES", "OUTLINER"}
            ]
            if not candidates:
                candidates = [area for area in screen.areas if area.type != "VIEW_3D"]
            if not candidates:
                self.report(
                    {"WARNING"},
                    "No area to convert. Split the window and set an editor to Asset Browser.",
                )
                return {"CANCELLED"}

            target = max(candidates, key=lambda a: a.width * a.height)
            target.ui_type = "ASSETS"

        space = target.spaces.active
        try:
            space.params.asset_library_reference = LIBRARY_NAME
        except (AttributeError, TypeError):
            # The library is only selectable once it is registered and Blender
            # has indexed it; a sync will make it appear.
            self.report(
                {"INFO"},
                "Asset Browser opened. Choose the ProjectFlow library from its header.",
            )
            return {"FINISHED"}

        self.report({"INFO"}, "Drag assets from here into the viewport.")
        return {"FINISHED"}


class PROJECTFLOW_OT_load_workspaces(Operator):
    bl_idname = "projectflow.load_workspaces"
    bl_label = "Load Workspaces"
    bl_description = "Fetch the workspaces you belong to"
    bl_options = {"REGISTER", "INTERNAL"}

    @classmethod
    def poll(cls, context):
        return session.state.signed_in and not tasks.is_running("workspaces")

    def execute(self, context):
        if not check_online_access(self):
            return {"CANCELLED"}

        client = make_client(context)
        props = context.window_manager.projectflow
        props.status = "Loading workspaces…"

        def work():
            return client.workspaces()

        def done(workspaces):
            properties.set_workspaces(workspaces)
            live = bpy.context.window_manager.projectflow
            live.status = ""

            # Re-select the previous workspace if it still exists, otherwise
            # fall back to the first so the panel is never left blank.
            existing = {ws.get("id") for ws in workspaces}
            if live.workspace_id not in existing and workspaces:
                try:
                    live.workspace_id = workspaces[0]["id"]
                except TypeError:
                    pass

            tasks.redraw_ui()

        def failed(exc):
            live = bpy.context.window_manager.projectflow
            live.status = ""
            live.last_error = report_api_error(None, exc)
            tasks.redraw_ui()

        tasks.run("workspaces", "Loading workspaces", work, done, failed)
        return {"FINISHED"}


classes = (
    PROJECTFLOW_OT_sync_assets,
    PROJECTFLOW_OT_open_asset_browser,
    PROJECTFLOW_OT_register_library,
    PROJECTFLOW_OT_clear_cache,
    PROJECTFLOW_OT_open_cache_folder,
    PROJECTFLOW_OT_load_workspaces,
)


def register() -> None:
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister() -> None:
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
