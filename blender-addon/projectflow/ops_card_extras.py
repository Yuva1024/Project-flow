"""Checklists, library attachments and the activity feed.

These three round out the card panel. Each was already implemented in
``api.py`` and had no caller — this module is the wiring.

Checklists earn their place in a pipeline board: the stages an asset passes
through have expected outputs (LOD1, collision mesh, UVs unwrapped) and ticking
those off next to the model beats alt-tabbing to a browser to do it.
"""

from __future__ import annotations

from typing import Any, Dict, List

import bpy
from bpy.props import BoolProperty, StringProperty
from bpy.types import Operator

from . import api, properties, session, tasks
from .ops_auth import check_online_access, make_client, report_api_error


def _props(context=None):
    context = context or bpy.context
    return getattr(context.window_manager, "projectflow", None)


#: Fetched per card on demand. The board payload carries counts only, so
#: pulling these for every card up front would be a request each and would run
#: into the server's 300-per-minute limit on a busy board.
checklists: Dict[str, List[Dict[str, Any]]] = {}
activity: Dict[str, List[Dict[str, Any]]] = {}
library_assets: List[Dict[str, Any]] = []


def clear_caches() -> None:
    checklists.clear()
    activity.clear()
    library_assets.clear()


class PROJECTFLOW_OT_load_checklists(Operator):
    bl_idname = "projectflow.load_checklists"
    bl_label = "Load Checklists"
    bl_description = "Fetch this card's checklists"
    bl_options = {"REGISTER", "INTERNAL"}

    @classmethod
    def poll(cls, context):
        props = _props(context)
        return props is not None and props.active_card() is not None

    def execute(self, context):
        if not check_online_access(self):
            return {"CANCELLED"}

        props = _props(context)
        card = props.active_card()
        client = make_client(context)
        workspace_id, board_id, card_id = props.workspace_id, props.board_id, card.card_id

        def work():
            return client.card_checklists(workspace_id, board_id, card_id)

        def done(result):
            checklists[card_id] = result or []
            tasks.redraw_ui()

        def failed(exc):
            live = _props()
            if live:
                live.last_error = report_api_error(None, exc)
            tasks.redraw_ui()

        tasks.run("checklists", "Loading checklists", work, done, failed, replace=True)
        return {"FINISHED"}


class PROJECTFLOW_OT_toggle_checklist_item(Operator):
    bl_idname = "projectflow.toggle_checklist_item"
    bl_label = "Toggle Checklist Item"
    bl_description = "Tick or untick this item"
    bl_options = {"REGISTER", "INTERNAL"}

    checklist_id: StringProperty(options={"SKIP_SAVE"})
    item_id: StringProperty(options={"SKIP_SAVE"})
    is_checked: BoolProperty(options={"SKIP_SAVE"})

    def execute(self, context):
        props = _props(context)
        card = props.active_card()
        if card is None:
            return {"CANCELLED"}

        client = make_client(context)
        workspace_id, board_id, card_id = props.workspace_id, props.board_id, card.card_id
        checklist_id, item_id = self.checklist_id, self.item_id
        new_state = not self.is_checked

        # Flip locally first so the checkbox responds immediately; the reload
        # below replaces this with whatever the server actually stored.
        for checklist in checklists.get(card_id, []):
            if checklist.get("id") != checklist_id:
                continue
            for item in checklist.get("items", []):
                if item.get("id") == item_id:
                    item["isChecked"] = new_state
        tasks.redraw_ui()

        def work():
            return client.set_checklist_item(
                workspace_id, board_id, card_id, checklist_id, item_id, new_state
            )

        def done(_result):
            bpy.ops.projectflow.load_checklists()

        def failed(exc):
            # Put the optimistic change back.
            for checklist in checklists.get(card_id, []):
                for item in checklist.get("items", []):
                    if item.get("id") == item_id:
                        item["isChecked"] = not new_state
            live = _props()
            if live:
                live.last_error = report_api_error(None, exc)
            tasks.redraw_ui()

        tasks.run("checklist-item", "Updating item", work, done, failed, replace=True)
        return {"FINISHED"}


class PROJECTFLOW_OT_load_activity(Operator):
    bl_idname = "projectflow.load_activity"
    bl_label = "Load Activity"
    bl_description = "Fetch this card's history"
    bl_options = {"REGISTER", "INTERNAL"}

    @classmethod
    def poll(cls, context):
        props = _props(context)
        return props is not None and props.active_card() is not None

    def execute(self, context):
        if not check_online_access(self):
            return {"CANCELLED"}

        props = _props(context)
        card = props.active_card()
        client = make_client(context)
        workspace_id, board_id, card_id = props.workspace_id, props.board_id, card.card_id

        def work():
            return client.card_activity(workspace_id, board_id, card_id)

        def done(result):
            activity[card_id] = (result or [])[:12]
            tasks.redraw_ui()

        def failed(exc):
            live = _props()
            if live:
                live.last_error = report_api_error(None, exc)
            tasks.redraw_ui()

        tasks.run("activity", "Loading activity", work, done, failed, replace=True)
        return {"FINISHED"}


class PROJECTFLOW_OT_load_library_for_card(Operator):
    bl_idname = "projectflow.load_library_for_card"
    bl_label = "Load Library"
    bl_description = "Fetch workspace assets that can be attached to this card"
    bl_options = {"REGISTER", "INTERNAL"}

    @classmethod
    def poll(cls, context):
        props = _props(context)
        return (
            session.state.signed_in
            and props is not None
            and props.workspace_id not in {"", "NONE"}
        )

    def execute(self, context):
        if not check_online_access(self):
            return {"CANCELLED"}

        props = _props(context)
        client = make_client(context)
        workspace_id = props.workspace_id

        def work():
            return list(client.iter_assets(workspace_id, mime_type="3d"))

        def done(result):
            library_assets.clear()
            library_assets.extend(result or [])
            tasks.redraw_ui()

        def failed(exc):
            live = _props()
            if live:
                live.last_error = report_api_error(None, exc)
            tasks.redraw_ui()

        tasks.run("card-library", "Loading library", work, done, failed, replace=True)
        return {"FINISHED"}


class PROJECTFLOW_OT_attach_library_asset(Operator):
    """Links an existing library asset to the card.

    No upload: the bytes are already in storage, and the server deduplicates on
    content hash anyway, so this is instant regardless of file size.
    """

    bl_idname = "projectflow.attach_library_asset"
    bl_label = "Attach Library Asset"
    bl_description = "Link an asset that is already in the workspace library"
    bl_options = {"REGISTER", "INTERNAL"}

    asset_id: StringProperty(options={"SKIP_SAVE"})

    def execute(self, context):
        props = _props(context)
        card = props.active_card()
        if card is None or not self.asset_id:
            return {"CANCELLED"}

        client = make_client(context)
        workspace_id, board_id, card_id = props.workspace_id, props.board_id, card.card_id
        asset_id = self.asset_id
        name = next(
            (a.get("fileName", "asset") for a in library_assets if a.get("id") == asset_id),
            "asset",
        )

        props.status = f"Attaching {name}…"

        def work():
            return client.link_asset_to_card(workspace_id, board_id, card_id, asset_id)

        def done(_result):
            live = _props()
            if live:
                live.status = ""
            self.report({"INFO"}, f"Attached {name} from the library.")
            bpy.ops.projectflow.load_board()

        def failed(exc):
            live = _props()
            if live:
                live.status = ""
                live.last_error = report_api_error(None, exc)
            tasks.redraw_ui()

        tasks.run("attach-library", "Attaching asset", work, done, failed, replace=True)
        return {"FINISHED"}


class PROJECTFLOW_OT_pick_library_asset(Operator):
    bl_idname = "projectflow.pick_library_asset"
    bl_label = "Attach from Library"
    bl_description = "Pick an asset already in the workspace library and link it to this card"
    bl_options = {"REGISTER", "INTERNAL"}

    search: StringProperty(name="Search", options={"SKIP_SAVE"})

    @classmethod
    def poll(cls, context):
        props = _props(context)
        return props is not None and props.active_card() is not None

    def invoke(self, context, event):
        if not check_online_access(self):
            return {"CANCELLED"}
        if not library_assets:
            bpy.ops.projectflow.load_library_for_card()
        return context.window_manager.invoke_props_dialog(self, width=420)

    def draw(self, context):
        layout = self.layout
        layout.prop(self, "search", text="", icon="VIEWZOOM")

        if not library_assets:
            layout.label(text="Loading library…", icon="SORTTIME")
            return

        needle = (self.search or "").strip().lower()
        matches = [
            asset for asset in library_assets
            if not needle or needle in (asset.get("fileName", "").lower())
        ]

        if not matches:
            layout.label(text="Nothing matches that search", icon="INFO")
            return

        box = layout.box()
        column = box.column(align=True)
        # Capped: a props dialog has no scrolling, so a long list would run off
        # the bottom of the screen with no way to reach the rest.
        for asset in matches[:15]:
            size_mb = (asset.get("fileSize") or 0) / (1024 * 1024)
            row = column.row(align=True)
            op = row.operator(
                "projectflow.attach_library_asset",
                text=f"{asset.get('fileName', 'asset')}  ({size_mb:.1f} MB)",
                icon="LINKED",
            )
            op.asset_id = asset.get("id", "")

        if len(matches) > 15:
            layout.label(text=f"{len(matches) - 15} more — narrow the search", icon="INFO")

    def execute(self, context):
        # Attaching happens from the per-row buttons in draw(); closing the
        # dialog with OK is just dismissal.
        return {"FINISHED"}


classes = (
    PROJECTFLOW_OT_load_checklists,
    PROJECTFLOW_OT_toggle_checklist_item,
    PROJECTFLOW_OT_load_activity,
    PROJECTFLOW_OT_load_library_for_card,
    PROJECTFLOW_OT_attach_library_asset,
    PROJECTFLOW_OT_pick_library_asset,
)


def register() -> None:
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister() -> None:
    clear_caches()
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
