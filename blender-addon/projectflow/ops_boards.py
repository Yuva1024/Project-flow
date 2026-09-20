"""Board and card operators, including the export-upload-advance loop.

The pipeline shape matters here: cards start in the first section and move
forward through the stages until the last. So the primary action is not "move
this somewhere" but "I finished my part, here it is, pass it on" — which is what
``PROJECTFLOW_OT_attach_and_advance`` collapses into one click.
"""

from __future__ import annotations

import os
import tempfile

import bpy
from bpy.props import BoolProperty, StringProperty
from bpy.types import Operator

from . import api, export_settings, properties, session, tasks
from .ops_auth import check_online_access, make_client, report_api_error
from .preferences import get_preferences


def _props(context=None):
    context = context or bpy.context
    return getattr(context.window_manager, "projectflow", None)


def export_selection(filepath: str, settings) -> int:
    """Exports the current selection using the chosen preset. Returns object count.

    Runs on the main thread: reads scene data, which a worker thread must not do.
    """
    selected = list(bpy.context.selected_objects)
    if not selected:
        raise RuntimeError("Nothing is selected")

    export_settings.export_with_settings(filepath, settings)
    return len(selected)


class PROJECTFLOW_OT_load_boards(Operator):
    bl_idname = "projectflow.load_boards"
    bl_label = "Load Boards"
    bl_description = "Fetch the boards in this workspace"
    bl_options = {"REGISTER", "INTERNAL"}

    @classmethod
    def poll(cls, context):
        props = _props(context)
        return (
            session.state.signed_in
            and props is not None
            and props.workspace_id not in {"", "NONE"}
            and not tasks.is_running("boards")
        )

    def execute(self, context):
        if not check_online_access(self):
            return {"CANCELLED"}

        props = _props(context)
        client = make_client(context)
        workspace_id = props.workspace_id
        props.status = "Loading boards…"

        def work():
            return client.boards(workspace_id)

        def done(boards):
            properties.set_boards(boards)
            live = _props()
            live.status = ""
            existing = {b.get("id") for b in boards}
            if live.board_id not in existing and boards:
                try:
                    live.board_id = boards[0]["id"]
                except TypeError:
                    pass
            tasks.redraw_ui()

        def failed(exc):
            live = _props()
            live.status = ""
            live.last_error = report_api_error(None, exc)
            tasks.redraw_ui()

        tasks.run("boards", "Loading boards", work, done, failed)
        return {"FINISHED"}


class PROJECTFLOW_OT_load_board(Operator):
    bl_idname = "projectflow.load_board"
    bl_label = "Refresh Board"
    bl_description = "Reload this board's sections and cards"
    bl_options = {"REGISTER", "INTERNAL"}

    @classmethod
    def poll(cls, context):
        props = _props(context)
        return (
            session.state.signed_in
            and props is not None
            and props.board_id not in {"", "NONE"}
            and not tasks.is_running("board")
        )

    def execute(self, context):
        if not check_online_access(self):
            return {"CANCELLED"}

        props = _props(context)
        client = make_client(context)
        workspace_id = props.workspace_id
        board_id = props.board_id
        props.status = "Loading board…"

        def work():
            # One request returns every section with its cards, and each card's
            # labels and members, so the whole panel renders from this payload.
            return client.board(workspace_id, board_id)

        def done(board):
            properties.set_board(board)
            live = _props()
            live.status = ""
            properties.rebuild_card_list(live)
            tasks.redraw_ui()

        def failed(exc):
            live = _props()
            live.status = ""
            live.last_error = report_api_error(None, exc)
            tasks.redraw_ui()

        tasks.run("board", "Loading board", work, done, failed)
        return {"FINISHED"}


class PROJECTFLOW_OT_move_card(Operator):
    bl_idname = "projectflow.move_card"
    bl_label = "Move Card"
    bl_description = "Move the selected card to another section"
    bl_options = {"REGISTER", "INTERNAL"}

    target_section_id: StringProperty()

    @classmethod
    def poll(cls, context):
        props = _props(context)
        return props is not None and props.active_card() is not None

    def execute(self, context):
        props = _props(context)
        card = props.active_card()
        if card is None:
            return {"CANCELLED"}

        target_id = self.target_section_id or props.move_target
        if not target_id or target_id == "NONE":
            self.report({"ERROR"}, "Choose a section to move to.")
            return {"CANCELLED"}
        if target_id == card.section_id:
            self.report({"INFO"}, "The card is already in that section.")
            return {"CANCELLED"}

        client = make_client(context)
        workspace_id = props.workspace_id
        board_id = props.board_id
        card_id = card.card_id
        target = properties.section_by_id(target_id)
        target_name = target.get("title", "section") if target else "section"

        props.status = f"Moving to {target_name}…"

        def work():
            return client.move_card(workspace_id, board_id, card_id, target_id)

        def done(_result):
            _props().status = ""
            self.report({"INFO"}, f"Moved to {target_name}.")
            # Refetch rather than patching the cache: someone else may have
            # changed the board, and there is no live channel to tell us.
            bpy.ops.projectflow.load_board()

        def failed(exc):
            live = _props()
            live.status = ""
            live.last_error = report_api_error(None, exc)
            tasks.redraw_ui()

        tasks.run("move-card", "Moving card", work, done, failed, replace=True)
        return {"FINISHED"}


class PROJECTFLOW_OT_advance_card(Operator):
    bl_idname = "projectflow.advance_card"
    bl_label = "Advance Card"
    bl_description = "Move the selected card to the next section in the pipeline"
    bl_options = {"REGISTER", "INTERNAL"}

    @classmethod
    def poll(cls, context):
        props = _props(context)
        card = props.active_card() if props else None
        if card is None:
            return False
        return properties.next_section(card.section_id) is not None

    def execute(self, context):
        props = _props(context)
        card = props.active_card()
        target = properties.next_section(card.section_id)
        if target is None:
            self.report({"INFO"}, "This card is already in the final section.")
            return {"CANCELLED"}
        return bpy.ops.projectflow.move_card(target_section_id=target["id"])


class PROJECTFLOW_OT_attach_selection(Operator):
    bl_idname = "projectflow.attach_selection"
    bl_label = "Attach Selection to Card"
    bl_description = (
        "Export the selected objects as glTF and attach them to the selected card"
    )
    bl_options = {"REGISTER", "INTERNAL"}

    advance: BoolProperty(
        name="Advance after attaching",
        description="Move the card to the next section once the upload finishes",
        default=False,
    )

    file_name: StringProperty(
        name="File Name",
        description="Name for the uploaded file",
        default="",
    )

    @classmethod
    def poll(cls, context):
        props = _props(context)
        return (
            props is not None
            and props.active_card() is not None
            and len(context.selected_objects) > 0
            and not tasks.is_running("attach")
        )

    def invoke(self, context, event):
        if not check_online_access(self):
            return {"CANCELLED"}

        props = _props(context)
        card = props.active_card()
        settings = context.window_manager.projectflow_export

        if not self.file_name:
            active = context.active_object
            base = (active.name if active else card.title) or "export"
            self.file_name = f"{base}{settings.extension}"

        # Wider than the other dialogs: this one carries the full export options.
        return context.window_manager.invoke_props_dialog(self, width=420)

    def draw(self, context):
        props = _props(context)
        card = props.active_card()
        settings = context.window_manager.projectflow_export
        layout = self.layout

        box = layout.box()
        box.scale_y = 0.85
        box.label(text=f"Card: {card.title}", icon="BOOKMARKS")
        box.label(
            text=f"{len(context.selected_objects)} object(s) selected", icon="OBJECT_DATA"
        )
        if self.advance:
            nxt = properties.next_section(card.section_id)
            if nxt:
                box.label(text=f"Then move to: {nxt.get('title')}", icon="FORWARD")

        preset_row = layout.row(align=True)
        preset_row.prop(settings, "preset", text="")
        preset_row.operator("projectflow.save_export_preset", text="", icon="ADD")
        preset_row.operator("projectflow.delete_export_preset", text="", icon="REMOVE")

        col = layout.column()
        col.use_property_split = True
        col.prop(self, "file_name")
        col.prop(settings, "file_format")
        col.prop(settings, "apply_modifiers")
        col.prop(settings, "use_triangles")
        col.prop(settings, "use_tangents")
        col.prop(settings, "export_materials")
        col.prop(settings, "export_animations")
        col.prop(settings, "global_scale")

        if settings.file_format == "FBX":
            fbx = layout.box()
            fbx.label(text="FBX / Unreal", icon="EXPORT")
            sub = fbx.column()
            sub.use_property_split = True
            sub.prop(settings, "mesh_smooth_type")
            sub.prop(settings, "axis_forward")
            sub.prop(settings, "axis_up")
            sub.prop(settings, "apply_unit_scale")
            sub.prop(settings, "bake_space_transform")
            sub.prop(settings, "embed_textures")
            sub.prop(settings, "add_leaf_bones")
            sub.prop(settings, "primary_bone_axis")
            sub.prop(settings, "secondary_bone_axis")
        elif settings.file_format in {"GLB", "GLTF_SEPARATE"}:
            gltf = layout.box()
            gltf.label(text="glTF", icon="EXPORT")
            sub = gltf.column()
            sub.use_property_split = True
            sub.prop(settings, "gltf_yup")

        # The website previews with <model-viewer>, which reads glTF only. Say so
        # here rather than letting someone wonder why their card shows no model.
        if not settings.previews_on_web:
            warn = layout.box()
            warn.label(text="This format will not preview on the card", icon="INFO")
            warn.prop(settings, "also_attach_preview")

    def execute(self, context):
        props = _props(context)
        card = props.active_card()
        if card is None:
            return {"CANCELLED"}

        settings = context.window_manager.projectflow_export
        extension = settings.extension

        file_name = (self.file_name or f"export{extension}").strip()
        if not file_name.lower().endswith(extension):
            file_name = f"{os.path.splitext(file_name)[0]}{extension}"

        temp_dir = tempfile.mkdtemp(prefix="projectflow-export-")
        export_path = os.path.join(temp_dir, file_name)

        # Exporting reads scene data, so it must happen on the main thread.
        # Only the upload goes to a worker.
        try:
            count = export_selection(export_path, settings)
        except Exception as exc:  # noqa: BLE001
            _cleanup_dir(temp_dir)
            self.report({"ERROR"}, f"Export failed: {exc}")
            return {"CANCELLED"}

        # A second, lightweight GLB so the card still shows a 3D preview when
        # the real attachment is a format the web viewer cannot read.
        preview_path = None
        if settings.also_attach_preview and not settings.previews_on_web:
            candidate = os.path.join(
                temp_dir, f"{os.path.splitext(file_name)[0]}_preview.glb"
            )
            try:
                export_settings.export_preview_glb(candidate, settings.selected_only)
                preview_path = candidate
            except Exception as exc:  # noqa: BLE001 - the main upload still stands
                print(f"[ProjectFlow] Preview export failed, continuing: {exc}")

        client = make_client(context)
        workspace_id = props.workspace_id
        board_id = props.board_id
        card_id = card.card_id
        should_advance = self.advance
        next_stage = properties.next_section(card.section_id)

        props.busy = True
        props.status = f"Uploading {file_name}…"
        props.last_error = ""

        def work():
            result = client.upload_card_attachment(
                workspace_id, board_id, card_id, export_path
            )
            if preview_path:
                # Uploaded after the real file so a preview failure cannot cost
                # the artist their actual export.
                try:
                    client.upload_card_attachment(
                        workspace_id, board_id, card_id, preview_path
                    )
                except api.ApiError as exc:
                    print(f"[ProjectFlow] Preview upload failed: {exc.message}")
            if should_advance and next_stage:
                client.move_card(workspace_id, board_id, card_id, next_stage["id"])
            return result

        def done(_result):
            live = _props()
            live.busy = False
            live.status = ""
            _cleanup_dir(temp_dir)

            if should_advance and next_stage:
                self.report(
                    {"INFO"},
                    f"Attached {file_name} ({count} object(s)) and moved to {next_stage.get('title')}.",
                )
            else:
                self.report({"INFO"}, f"Attached {file_name} ({count} object(s)).")

            bpy.ops.projectflow.load_board()

        def failed(exc):
            live = _props()
            live.busy = False
            live.status = ""
            live.last_error = report_api_error(None, exc)
            _cleanup_dir(temp_dir)
            tasks.redraw_ui()

        tasks.run("attach", "Uploading attachment", work, done, failed)
        return {"FINISHED"}


class PROJECTFLOW_OT_attach_and_advance(Operator):
    """The action this whole panel exists for.

    In a pipeline, finishing your stage and handing the card on are the same
    event, so they belong behind one button.
    """

    bl_idname = "projectflow.attach_and_advance"
    bl_label = "Attach & Advance"
    bl_description = (
        "Export the selection, attach it to the card, and move the card to the "
        "next section"
    )
    bl_options = {"REGISTER", "INTERNAL"}

    @classmethod
    def poll(cls, context):
        return PROJECTFLOW_OT_attach_selection.poll(context)

    def invoke(self, context, event):
        return bpy.ops.projectflow.attach_selection("INVOKE_DEFAULT", advance=True)

    def execute(self, context):
        return bpy.ops.projectflow.attach_selection("INVOKE_DEFAULT", advance=True)


class PROJECTFLOW_OT_add_comment(Operator):
    bl_idname = "projectflow.add_comment"
    bl_label = "Post Comment"
    bl_description = "Post the drafted comment to the selected card"
    bl_options = {"REGISTER", "INTERNAL"}

    @classmethod
    def poll(cls, context):
        props = _props(context)
        return (
            props is not None
            and props.active_card() is not None
            and bool((props.comment_draft or "").strip())
        )

    def execute(self, context):
        props = _props(context)
        card = props.active_card()
        content = (props.comment_draft or "").strip()

        client = make_client(context)
        workspace_id = props.workspace_id
        board_id = props.board_id
        card_id = card.card_id

        props.comment_draft = ""
        props.status = "Posting comment…"

        def work():
            return client.add_comment(workspace_id, board_id, card_id, content)

        def done(_result):
            _props().status = ""
            self.report({"INFO"}, "Comment posted.")
            tasks.redraw_ui()

        def failed(exc):
            live = _props()
            live.status = ""
            live.last_error = report_api_error(None, exc)
            tasks.redraw_ui()

        tasks.run("comment", "Posting comment", work, done, failed, replace=True)
        return {"FINISHED"}


class PROJECTFLOW_OT_open_card_in_browser(Operator):
    bl_idname = "projectflow.open_card_in_browser"
    bl_label = "Open in Browser"
    bl_description = (
        "Open this board on the website, for editing descriptions and anything "
        "Blender's UI handles poorly"
    )
    bl_options = {"REGISTER", "INTERNAL"}

    @classmethod
    def poll(cls, context):
        props = _props(context)
        return props is not None and props.board_id not in {"", "NONE"}

    def execute(self, context):
        props = _props(context)
        prefs = get_preferences(context)

        # The web app is a separate deployment from the API, so derive the site
        # URL by stripping a leading "api." if present and let the user correct
        # it in preferences when that guess is wrong.
        base = prefs.server_url.rstrip("/")
        site = base.replace("//projectflow-api.", "//projectflow.").replace("//api.", "//")

        url = f"{site}/board/{props.workspace_id}/{props.board_id}"
        bpy.ops.wm.url_open(url=url)
        return {"FINISHED"}


def _cleanup_dir(path: str) -> None:
    import shutil

    shutil.rmtree(path, ignore_errors=True)


classes = (
    PROJECTFLOW_OT_load_boards,
    PROJECTFLOW_OT_load_board,
    PROJECTFLOW_OT_move_card,
    PROJECTFLOW_OT_advance_card,
    PROJECTFLOW_OT_attach_selection,
    PROJECTFLOW_OT_attach_and_advance,
    PROJECTFLOW_OT_add_comment,
    PROJECTFLOW_OT_open_card_in_browser,
)


def register() -> None:
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister() -> None:
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
