"""Panels in the 3D viewport sidebar (N-panel, "ProjectFlow" tab)."""

from __future__ import annotations

import bpy
from bpy.types import Panel, UIList

from . import properties, session, tasks
from .preferences import get_preferences

CATEGORY = "ProjectFlow"

PRIORITY_ICONS = {
    "URGENT": "ERROR",
    "HIGH": "SEQUENCE_COLOR_01",
    "MEDIUM": "SEQUENCE_COLOR_03",
    "LOW": "SEQUENCE_COLOR_04",
}


class PROJECTFLOW_UL_cards(UIList):
    """Card rows. Section is shown per row because the list spans every stage."""

    def draw_item(self, context, layout, data, item, icon, active_data, active_prop, index):
        if self.layout_type in {"DEFAULT", "COMPACT"}:
            row = layout.row(align=True)

            if item.priority and item.priority in PRIORITY_ICONS:
                row.label(text="", icon=PRIORITY_ICONS[item.priority])
            else:
                row.label(text="", icon="DOT")

            row.label(text=item.title)

            sub = row.row(align=True)
            sub.alignment = "RIGHT"

            if item.assigned_to_me:
                sub.label(text="", icon="USER")
            if item.attachment_count:
                sub.label(text=str(item.attachment_count), icon="FILE_BLANK")

            # Only useful when the list is not already filtered to one stage.
            props = context.window_manager.projectflow
            if props.section_filter == "ALL":
                sub.label(text=item.section_title)

        elif self.layout_type == "GRID":
            layout.alignment = "CENTER"
            layout.label(text="", icon="BOOKMARKS")


class ProjectFlowPanelBase:
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = CATEGORY


class PROJECTFLOW_PT_main(ProjectFlowPanelBase, Panel):
    bl_label = "ProjectFlow"
    bl_idname = "PROJECTFLOW_PT_main"

    def draw(self, context):
        layout = self.layout
        props = context.window_manager.projectflow
        state = session.state

        if not bpy.app.online_access:
            box = layout.box()
            box.alert = True
            box.label(text="Online access is disabled", icon="ERROR")
            box.operator(
                "screen.userpref_show", text="Open Preferences", icon="PREFERENCES"
            ).section = "SYSTEM"
            return

        if not state.signed_in:
            box = layout.box()
            if state.checking:
                box.label(text="Connecting…", icon="SORTTIME")
            else:
                box.label(text="Not signed in", icon="USER")
                col = box.column(align=True)
                col.scale_y = 1.2
                col.operator("projectflow.sign_in", icon="KEYINGSET")
                col.operator("projectflow.paste_token", text="Paste Token", icon="PASTEDOWN")

            if state.error:
                err = layout.box()
                err.alert = True
                _wrapped_label(err, state.error)
                err.operator("projectflow.refresh_session", text="Retry", icon="FILE_REFRESH")
            return

        row = layout.row(align=True)
        row.label(text=state.display_name, icon="USER")
        row.operator("projectflow.refresh_session", text="", icon="FILE_REFRESH")

        col = layout.column(align=True)
        ws_row = col.row(align=True)
        ws_row.prop(props, "workspace_id", text="")
        ws_row.operator("projectflow.load_workspaces", text="", icon="FILE_REFRESH")

        if tasks.any_running():
            info = layout.row()
            info.label(text=", ".join(tasks.active_labels()) + "…", icon="SORTTIME")

        if props.busy and props.progress:
            layout.prop(props, "progress", text=props.status or "Working")
        elif props.status:
            layout.label(text=props.status, icon="INFO")

        if props.last_error:
            err = layout.box()
            err.alert = True
            _wrapped_label(err, props.last_error)


class PROJECTFLOW_PT_assets(ProjectFlowPanelBase, Panel):
    bl_label = "Asset Library"
    bl_idname = "PROJECTFLOW_PT_assets"
    bl_parent_id = "PROJECTFLOW_PT_main"

    @classmethod
    def poll(cls, context):
        return session.state.signed_in and bpy.app.online_access

    def draw(self, context):
        layout = self.layout
        props = context.window_manager.projectflow
        prefs = get_preferences(context)

        if props.workspace_id in {"", "NONE"}:
            layout.label(text="Choose a workspace first", icon="INFO")
            return

        col = layout.column(align=True)
        col.scale_y = 1.3
        col.enabled = not props.busy
        col.operator("projectflow.sync_assets", icon="IMPORT")

        row = layout.row(align=True)
        row.operator("projectflow.register_library", text="Register Library", icon="ASSET_MANAGER")
        row.operator("projectflow.open_cache_folder", text="", icon="FILE_FOLDER")

        from . import cache as cache_mod

        asset_cache = prefs.get_cache()
        box = layout.box()
        box.scale_y = 0.85
        box.label(
            text=f"Cache: {cache_mod.format_size(asset_cache.size_bytes())}",
            icon="DISK_DRIVE",
        )
        box.label(text="Assets appear in the Asset Browser", icon="INFO")


class PROJECTFLOW_PT_boards(ProjectFlowPanelBase, Panel):
    bl_label = "Boards"
    bl_idname = "PROJECTFLOW_PT_boards"
    bl_parent_id = "PROJECTFLOW_PT_main"

    @classmethod
    def poll(cls, context):
        return session.state.signed_in and bpy.app.online_access

    def draw(self, context):
        layout = self.layout
        props = context.window_manager.projectflow

        if props.workspace_id in {"", "NONE"}:
            layout.label(text="Choose a workspace first", icon="INFO")
            return

        row = layout.row(align=True)
        row.prop(props, "board_id", text="")
        row.operator("projectflow.load_boards", text="", icon="FILE_REFRESH")

        if props.board_id in {"", "NONE"}:
            layout.operator("projectflow.load_boards", text="Load Boards", icon="IMPORT")
            return

        row = layout.row(align=True)
        row.operator("projectflow.load_board", text="Refresh Cards", icon="FILE_REFRESH")
        row.operator("projectflow.open_card_in_browser", text="", icon="URL")

        if not properties.sections():
            layout.label(text="Refresh to load this board's cards", icon="INFO")
            return

        filters = layout.column(align=True)
        filters.prop(props, "section_filter", text="")
        sub = filters.row(align=True)
        sub.prop(props, "card_search", text="", icon="VIEWZOOM")
        sub.prop(props, "only_my_cards", text="", icon="USER", toggle=True)

        layout.template_list(
            "PROJECTFLOW_UL_cards",
            "",
            props,
            "cards",
            props,
            "active_card_index",
            rows=6,
        )

        if not len(props.cards):
            layout.label(text="No cards match the current filter", icon="INFO")


class PROJECTFLOW_PT_card(ProjectFlowPanelBase, Panel):
    bl_label = "Card"
    bl_idname = "PROJECTFLOW_PT_card"
    bl_parent_id = "PROJECTFLOW_PT_boards"

    @classmethod
    def poll(cls, context):
        props = getattr(context.window_manager, "projectflow", None)
        return props is not None and props.active_card() is not None

    def draw(self, context):
        layout = self.layout
        props = context.window_manager.projectflow
        item = props.active_card()
        card = properties.find_card(item.card_id) or {}

        header = layout.box()
        header.label(text=item.title, icon="BOOKMARKS")

        meta = header.column(align=True)
        meta.scale_y = 0.85
        meta.label(text=f"Section: {item.section_title}")
        if item.priority:
            meta.label(text=f"Priority: {item.priority.title()}")
        if item.label_summary:
            meta.label(text=f"Labels: {item.label_summary}")

        description = (card.get("description") or "").strip()
        if description:
            box = layout.box()
            box.scale_y = 0.85
            _wrapped_label(box, description, limit=240)
            # Blender's multi-line text editing is too poor to offer here; the
            # website is a better place to write a description.
            box.operator(
                "projectflow.open_card_in_browser", text="Edit in Browser", icon="URL"
            )

        # -- the pipeline actions -----------------------------------------

        layout.separator()

        next_stage = properties.next_section(item.section_id)
        has_selection = len(context.selected_objects) > 0

        actions = layout.column(align=True)
        actions.scale_y = 1.3

        primary = actions.row(align=True)
        primary.enabled = has_selection and not props.busy
        if next_stage:
            primary.operator(
                "projectflow.attach_and_advance",
                text=f"Attach & Move to {next_stage.get('title', 'Next')}",
                icon="EXPORT",
            )
        else:
            primary.operator(
                "projectflow.attach_selection", text="Attach Selection", icon="EXPORT"
            ).advance = False

        secondary = actions.row(align=True)
        secondary.enabled = has_selection and not props.busy
        secondary.operator(
            "projectflow.attach_selection", text="Attach Only", icon="FILE_NEW"
        ).advance = False

        if not has_selection:
            note = layout.row()
            note.scale_y = 0.8
            note.label(text="Select objects to attach them", icon="INFO")

        # -- moving --------------------------------------------------------

        move = layout.column(align=True)
        if next_stage:
            move.operator(
                "projectflow.advance_card",
                text=f"Move to {next_stage.get('title')}",
                icon="FORWARD",
            )
        else:
            row = move.row()
            row.enabled = False
            row.label(text="Final section", icon="CHECKMARK")

        row = move.row(align=True)
        row.prop(props, "move_target", text="")
        row.operator("projectflow.move_card", text="", icon="PLAY").target_section_id = ""

        # -- comment -------------------------------------------------------

        layout.separator()
        comment = layout.column(align=True)
        comment.prop(props, "comment_draft", text="", icon="TEXT")
        row = comment.row()
        row.enabled = bool((props.comment_draft or "").strip())
        row.operator("projectflow.add_comment", icon="GREASEPENCIL")


class PROJECTFLOW_PT_card_attachments(ProjectFlowPanelBase, Panel):
    bl_label = "Attachments"
    bl_idname = "PROJECTFLOW_PT_card_attachments"
    bl_parent_id = "PROJECTFLOW_PT_card"
    bl_options = {"DEFAULT_CLOSED"}

    @classmethod
    def poll(cls, context):
        props = getattr(context.window_manager, "projectflow", None)
        return props is not None and props.active_card() is not None

    def draw(self, context):
        layout = self.layout
        props = context.window_manager.projectflow
        item = props.active_card()

        if not item.attachment_count:
            layout.label(text="No attachments yet", icon="FILE_BLANK")
            return

        # The board payload carries counts but not the file list, so the detail
        # is one click away rather than costing a request per card up front.
        layout.label(text=f"{item.attachment_count} file(s) on this card", icon="FILE_BLANK")
        layout.operator("projectflow.open_card_in_browser", text="View in Browser", icon="URL")


def _wrapped_label(layout, text: str, limit: int = 400, width: int = 38) -> None:
    """Crude word wrapping.

    Blender has no multi-line label, so long strings would otherwise run off the
    edge of the sidebar and simply be unreadable.
    """
    text = " ".join(text.split())
    if len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"

    col = layout.column(align=True)
    col.scale_y = 0.8

    line = ""
    for word in text.split(" "):
        candidate = f"{line} {word}".strip()
        if len(candidate) > width and line:
            col.label(text=line)
            line = word
        else:
            line = candidate
    if line:
        col.label(text=line)


classes = (
    PROJECTFLOW_UL_cards,
    PROJECTFLOW_PT_main,
    PROJECTFLOW_PT_assets,
    PROJECTFLOW_PT_boards,
    PROJECTFLOW_PT_card,
    PROJECTFLOW_PT_card_attachments,
)


def register() -> None:
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister() -> None:
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
