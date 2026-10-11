"""Exports the selection into the workspace asset library.

Attaching puts work on one card. Publishing puts it in the shared library,
filed in a folder and tagged, where anyone can find it — on the website, in
Blender's Asset Browser after a sync, and in the Unreal plugin.

It reuses the attach dialog's export presets and options, so a model published
here is exported exactly as it would be for a card, and the same streamed
upload with progress and cancel.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import threading
from typing import Any, Dict, List

import bpy
from bpy.props import EnumProperty, StringProperty
from bpy.types import Operator

from . import api, catalogs, ops_boards, session, tasks
from .ops_auth import check_online_access, make_client, report_api_error

# -- folder and tag choices ---------------------------------------------------
# Dynamic enum items must stay referenced from Python for as long as a dropdown
# can show them, or Blender reads freed strings. Hence module-level lists.

_ROOT = ("ROOT", "Workspace root", "Not inside any folder", 0)
_folder_items: List[tuple] = [_ROOT]
_tag_items: List[tuple] = []
_loaded_for: Dict[str, str] = {"workspace": ""}

#: ENUM_FLAG values are bit flags, so a multi-select tops out at 32 entries.
MAX_TAGS = 30


def folder_items(self, context):
    return _folder_items


def tag_items(self, context):
    return _tag_items


def _set_choices(folders: List[Dict[str, Any]], tags: List[Dict[str, Any]]) -> None:
    global _folder_items, _tag_items
    tree = catalogs.CatalogTree(folders)
    # Full paths ("Environment/Props/Crates"), sorted, so nested folders with
    # the same name stay distinguishable in the dropdown.
    rows = sorted(
        ((f["id"], tree.path_for(f["id"])) for f in folders if f.get("id")),
        key=lambda row: row[1].lower(),
    )
    _folder_items = [_ROOT] + [
        (folder_id, path, f"Publish into {path}", index + 1)
        for index, (folder_id, path) in enumerate(rows)
    ]
    _tag_items = [
        (tag["id"], tag.get("name", "tag"), "", 1 << index)
        for index, tag in enumerate(tags[:MAX_TAGS])
        if tag.get("id")
    ]


def request_choices(workspace_id: str, force: bool = False) -> None:
    """Loads the workspace's folders and tags in the background."""
    if not workspace_id or workspace_id == "NONE" or not session.state.signed_in:
        return
    if not force and _loaded_for["workspace"] == workspace_id:
        return
    if tasks.is_running("library-choices"):
        return

    client = make_client()

    def work():
        return client.asset_folders(workspace_id), client.asset_tags(workspace_id)

    def done(result):
        folders, tags = result
        _set_choices(folders or [], tags or [])
        _loaded_for["workspace"] = workspace_id
        tasks.redraw_ui()

    tasks.run("library-choices", "Loading folders", work, done, lambda exc: None)


def clear_caches() -> None:
    global _folder_items, _tag_items
    _folder_items = [_ROOT]
    _tag_items = []
    _loaded_for["workspace"] = ""


class PROJECTFLOW_OT_refresh_library_choices(Operator):
    bl_idname = "projectflow.refresh_library_choices"
    bl_label = "Refresh Folders"
    bl_description = "Reload the library's folders and tags"
    bl_options = {"REGISTER", "INTERNAL"}

    def execute(self, context):
        request_choices(context.window_manager.projectflow.workspace_id, force=True)
        return {"FINISHED"}


# -- the publish operator -------------------------------------------------------


class PROJECTFLOW_OT_publish_to_library(Operator):
    bl_idname = "projectflow.publish_to_library"
    bl_label = "Add Selection to Asset Library"
    bl_description = (
        "Export the selected objects and add them to the workspace asset library, "
        "in a folder and with tags of your choice"
    )
    bl_options = {"REGISTER", "INTERNAL"}

    file_name: StringProperty(name="Name", description="File name in the library")
    folder_id: EnumProperty(name="Folder", items=folder_items)
    tag_ids: EnumProperty(name="Tags", items=tag_items, options={"ENUM_FLAG"})

    @classmethod
    def poll(cls, context):
        props = getattr(context.window_manager, "projectflow", None)
        return (
            session.state.signed_in
            and props is not None
            and props.workspace_id not in {"", "NONE"}
            and len(context.selected_objects) > 0
            and not tasks.is_running("publish")
        )

    def invoke(self, context, event):
        if not check_online_access(self):
            return {"CANCELLED"}
        request_choices(context.window_manager.projectflow.workspace_id)
        settings = context.window_manager.projectflow_export
        if not self.file_name:
            active = context.active_object
            self.file_name = f"{(active.name if active else 'asset')}{settings.extension}"
        return context.window_manager.invoke_props_dialog(self, width=420)

    def draw(self, context):
        settings = context.window_manager.projectflow_export
        layout = self.layout

        box = layout.box()
        box.scale_y = 0.85
        box.label(text=f"{len(context.selected_objects)} object(s) selected", icon="OBJECT_DATA")

        col = layout.column()
        col.use_property_split = True
        col.prop(self, "file_name")

        row = col.row(align=True)
        row.prop(self, "folder_id")
        row.operator("projectflow.refresh_library_choices", text="", icon="FILE_REFRESH")
        if tasks.is_running("library-choices"):
            col.label(text="Loading folders and tags…", icon="SORTTIME")

        if _tag_items:
            layout.label(text="Tags")
            grid = layout.grid_flow(row_major=True, columns=3, align=True)
            grid.prop(self, "tag_ids", expand=True)

        # The same presets and option groups as attaching to a card.
        preset_row = layout.row(align=True)
        preset_row.prop(settings, "preset", text="")
        preset_row.operator("projectflow.save_export_preset", text="", icon="ADD")
        preset_row.operator("projectflow.delete_export_preset", text="", icon="REMOVE")

        col = layout.column()
        col.use_property_split = True
        col.prop(settings, "file_format")

        is_fbx = settings.file_format == "FBX"
        is_gltf = settings.file_format in {"GLB", "GLTF_SEPARATE"}
        is_obj = settings.file_format == "OBJ"
        attach = ops_boards.PROJECTFLOW_OT_attach_selection
        args = (context, settings, is_fbx, is_gltf, is_obj)
        ops_boards._section(layout, settings, "show_include", "Include", lambda b, *a: attach._draw_include(self, b, *a), *args)
        ops_boards._section(layout, settings, "show_transform", "Transform", lambda b, *a: attach._draw_transform(self, b, *a), *args)
        ops_boards._section(layout, settings, "show_geometry", "Geometry", lambda b, *a: attach._draw_geometry(self, b, *a), *args)
        if not is_obj:
            ops_boards._section(layout, settings, "show_armature", "Armature", lambda b, *a: attach._draw_armature(self, b, *a), *args)
            ops_boards._section(layout, settings, "show_animation", "Animation", lambda b, *a: attach._draw_animation(self, b, *a), *args)

        if not settings.previews_on_web:
            note = layout.box()
            note.scale_y = 0.85
            note.label(text="The website shows a 3D preview for glTF only;", icon="INFO")
            note.label(text="this format appears there as a file card.")

    def execute(self, context):
        props = context.window_manager.projectflow
        settings = context.window_manager.projectflow_export
        extension = settings.extension

        file_name = (self.file_name or f"asset{extension}").strip()
        if not file_name.lower().endswith(extension):
            file_name = f"{os.path.splitext(file_name)[0]}{extension}"

        temp_dir = tempfile.mkdtemp(prefix="projectflow-publish-")
        export_path = os.path.join(temp_dir, file_name)

        # Exporting reads scene data, so it stays on the main thread.
        try:
            count = ops_boards.export_selection(export_path, settings)
        except Exception as exc:  # noqa: BLE001
            shutil.rmtree(temp_dir, ignore_errors=True)
            self.report({"ERROR"}, f"Export failed: {exc}")
            return {"CANCELLED"}

        folder_id = None if self.folder_id in {"", "ROOT"} else self.folder_id
        folder_label = next((item[1] for item in _folder_items if item[0] == self.folder_id), "Workspace root")
        tag_ids = sorted(self.tag_ids)
        client = make_client(context)
        workspace_id = props.workspace_id

        props.busy = True
        props.progress = 0
        props.status = f"Publishing {file_name}…"
        props.last_error = ""

        upload_state = {"sent": 0, "total": 1}
        cancel = threading.Event()
        ops_boards._upload_cancel["event"] = cancel

        def on_progress(sent: int, total: int) -> None:
            upload_state["sent"] = sent
            upload_state["total"] = max(total, 1)

        def pump():
            if not tasks.is_running("publish"):
                return None
            live = getattr(bpy.context.window_manager, "projectflow", None)
            if live:
                live.progress = int(100 * upload_state["sent"] / upload_state["total"])
                live.status = (
                    f"Publishing {file_name}: {upload_state['sent'] / 1048576:.1f}"
                    f" / {upload_state['total'] / 1048576:.1f} MB"
                )
                tasks.redraw_ui()
            return 0.2

        def finish():
            live = bpy.context.window_manager.projectflow
            live.busy = False
            live.progress = 0
            ops_boards._upload_cancel["event"] = None
            shutil.rmtree(temp_dir, ignore_errors=True)
            return live

        def work():
            return client.upload_library_asset(
                workspace_id, export_path, folder_id=folder_id, tag_ids=tag_ids,
                progress=on_progress, cancel=cancel,
            )

        def done(_result):
            live = finish()
            live.status = f"Added {file_name} to {folder_label}. Sync to see it in the Asset Browser."
            # Lists of library assets cached elsewhere (Attach from Library) are
            # now out of date.
            from . import ops_card_extras

            ops_card_extras.library_assets.clear()
            print(f"[ProjectFlow] Published {file_name} ({count} object(s)) to {folder_label}")
            tasks.redraw_ui()

        def failed(exc):
            live = finish()
            if isinstance(exc, api.UploadCancelled):
                live.status = "Publish cancelled"
            else:
                live.status = ""
                live.last_error = report_api_error(None, exc)
            tasks.redraw_ui()

        tasks.run("publish", "Publishing to library", work, done, failed)
        bpy.app.timers.register(pump, first_interval=0.2)
        return {"FINISHED"}


classes = (
    PROJECTFLOW_OT_refresh_library_choices,
    PROJECTFLOW_OT_publish_to_library,
)


def register() -> None:
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister() -> None:
    clear_caches()
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
