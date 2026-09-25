"""Card attachments inside Blender: import models, view images, use as reference,
and remember which card an object belongs to.

Until this module the add-on could only push work *to* a card. The next artist
in the pipeline still had to open the website to download what the previous
one attached. This is the pull side.

Two rules carried over from the rest of the add-on:

* Downloads happen on a worker thread; anything touching ``bpy`` — importing,
  loading an image, drawing a preview — happens in the task's ``done``
  callback, which runs on the main thread.
* Files land in the same content-addressed cache as the asset sync, keyed on
  the SHA-256 in the URL. An attachment that is also a library asset, or that
  was opened before, never downloads twice.
"""

from __future__ import annotations

import math
import os
from typing import Any, Callable, Dict, List, Optional

import bpy
import bpy.utils.previews
from bpy.props import StringProperty
from bpy.types import Operator

from . import api, cache, properties, session, tasks
from .ops_auth import check_online_access, make_client, report_api_error
from .preferences import get_preferences

#: Formats Blender can open as an image. GIF and SVG are absent on purpose —
#: Blender cannot read them, so they are offered as "open in browser" instead.
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".tga", ".bmp", ".tif", ".tiff", ".exr", ".hdr"}
MODEL_EXTENSIONS = {".glb", ".gltf", ".fbx", ".obj"}

#: Images larger than this are not fetched just to draw a thumbnail; they show
#: a button instead so a 200 MB scan is only downloaded when actually wanted.
AUTO_PREVIEW_MAX_BYTES = 25 * 1024 * 1024

#: Custom properties written onto objects that came from, or went to, a card.
PROP_CARD_ID = "pf_card_id"
PROP_CARD_TITLE = "pf_card_title"
PROP_BOARD_ID = "pf_board_id"
PROP_WORKSPACE_ID = "pf_workspace_id"

# -- state --------------------------------------------------------------------

#: card id -> attachments, fetched on demand. The board payload carries counts
#: only, and fetching every card's files up front would be a request each.
attachments: Dict[str, List[Dict[str, Any]]] = {}

#: Thumbnails. Blender draws these from files on disk without adding the image
#: to the .blend, which is what a thumbnail grid needs.
_previews: Optional[Any] = None


def previews():
    global _previews
    if _previews is None:
        _previews = bpy.utils.previews.new()
    return _previews


def clear_caches() -> None:
    attachments.clear()
    if _previews is not None:
        _previews.clear()


# -- helpers ------------------------------------------------------------------


def extension(att: Dict[str, Any]) -> str:
    return os.path.splitext(att.get("fileName") or "")[1].lower()


def is_image(att: Dict[str, Any]) -> bool:
    return extension(att) in IMAGE_EXTENSIONS


def is_model(att: Dict[str, Any]) -> bool:
    return extension(att) in MODEL_EXTENSIONS


def local_path(att: Dict[str, Any]) -> str:
    return get_preferences().get_cache().file_path(att.get("fileUrl") or "", att.get("fileName") or "")


def is_downloaded(att: Dict[str, Any]) -> bool:
    return get_preferences().get_cache().has_file(att.get("fileUrl") or "", att.get("fileName") or "")


def find_attachment(attachment_id: str) -> Optional[Dict[str, Any]]:
    for items in attachments.values():
        for att in items:
            if att.get("id") == attachment_id:
                return att
    return None


def preview_icon(att: Dict[str, Any]) -> int:
    """Icon id for an image attachment's thumbnail, or 0 if not loaded yet."""
    key = att.get("id") or ""
    pcoll = previews()
    return pcoll[key].icon_id if key in pcoll else 0


def _load_preview(att: Dict[str, Any]) -> None:
    """Main thread only: registers a downloaded image as a thumbnail."""
    key = att.get("id") or ""
    pcoll = previews()
    path = local_path(att)
    if key and key not in pcoll and os.path.exists(path):
        try:
            pcoll.load(key, path, "IMAGE")
        except (KeyError, RuntimeError) as exc:
            print(f"[ProjectFlow] Could not load preview for {att.get('fileName')}: {exc}")


def _props():
    return getattr(bpy.context.window_manager, "projectflow", None)


def fetch_then(att: Dict[str, Any], label: str, on_ready: Callable[[str], None]) -> None:
    """Ensures the file is in the cache, then calls ``on_ready(path)`` on the main thread."""
    path = local_path(att)
    if is_downloaded(att):
        on_ready(path)
        return

    url = att.get("fileUrl") or ""
    live = _props()
    if live:
        live.status = f"Downloading {att.get('fileName')}…"
    tasks.redraw_ui()

    def work():
        get_preferences().get_cache().ensure_dirs()
        api.download_file(url, path)
        return path

    def done(result):
        props = _props()
        if props:
            props.status = ""
        on_ready(result)
        tasks.redraw_ui()

    def failed(exc):
        props = _props()
        if props:
            props.status = ""
            props.last_error = report_api_error(None, exc)
        tasks.redraw_ui()

    tasks.run(f"download-{att.get('id')}", label, work, done, failed)


def tag_objects(objects, card_id: str, card_title: str, board_id: str, workspace_id: str) -> None:
    """Records on each object which card it belongs to.

    Stored as custom properties, so it survives saving the .blend and shows in
    the Object properties. It is what lets selecting a model select its card,
    and lets the Outliner reveal which objects are tied to which cards.
    """
    for obj in objects:
        try:
            obj[PROP_CARD_ID] = card_id
            obj[PROP_CARD_TITLE] = card_title
            obj[PROP_BOARD_ID] = board_id
            obj[PROP_WORKSPACE_ID] = workspace_id
        except (TypeError, ReferenceError):
            pass  # linked (library) data is read-only; nothing to do


def linked_card(obj) -> Optional[Dict[str, str]]:
    if obj is None or PROP_CARD_ID not in obj:
        return None
    return {
        "card_id": str(obj.get(PROP_CARD_ID, "")),
        "title": str(obj.get(PROP_CARD_TITLE, "")),
        "board_id": str(obj.get(PROP_BOARD_ID, "")),
        "workspace_id": str(obj.get(PROP_WORKSPACE_ID, "")),
    }


def _view3d_override() -> Dict[str, Any]:
    """Context for import operators run from a task callback.

    Task results arrive from a timer, where there is no active area. Importers
    and object operators behave more predictably with a real 3D viewport in
    context, so borrow the first one available.
    """
    wm = bpy.context.window_manager
    for window in wm.windows:
        for area in window.screen.areas:
            if area.type == "VIEW_3D":
                region = next((r for r in area.regions if r.type == "WINDOW"), None)
                return {"window": window, "area": area, "region": region}
    return {}


# -- loading the list -----------------------------------------------------------


def request_attachments(props, force: bool = False) -> None:
    """Fetches the active card's attachments, then its image thumbnails.

    Callable from a property update callback (it starts a task rather than
    running an operator), which is how selecting a card fills this in.
    """
    if not session.state.signed_in or props is None:
        return
    item = props.active_card()
    if item is None:
        return
    card_id = item.card_id
    if not force and card_id in attachments:
        return
    if tasks.is_running(f"attachments-{card_id}"):
        return

    client = make_client()
    workspace_id, board_id = props.workspace_id, props.board_id

    def work():
        return client.card_attachments(workspace_id, board_id, card_id)

    def done(result):
        items = result or []
        attachments[card_id] = items
        tasks.redraw_ui()
        _fetch_thumbnails(card_id, items)

    def failed(exc):
        live = _props()
        if live:
            live.last_error = report_api_error(None, exc)
        tasks.redraw_ui()

    tasks.run(f"attachments-{card_id}", "Loading attachments", work, done, failed)


def _fetch_thumbnails(card_id: str, items: List[Dict[str, Any]]) -> None:
    wanted = [
        att for att in items
        if is_image(att) and (att.get("fileSize") or 0) <= AUTO_PREVIEW_MAX_BYTES
    ]
    for att in wanted:
        if is_downloaded(att):
            _load_preview(att)
    missing = [att for att in wanted if not is_downloaded(att)]
    if not missing:
        tasks.redraw_ui()
        return

    targets = [(att.get("fileUrl") or "", local_path(att)) for att in missing]

    def work():
        get_preferences().get_cache().ensure_dirs()
        for url, path in targets:
            try:
                api.download_file(url, path)
            except api.ApiError as exc:
                print(f"[ProjectFlow] Thumbnail download failed: {exc.message}")
        return None

    def done(_result):
        for att in missing:
            _load_preview(att)
        tasks.redraw_ui()

    tasks.run(f"thumbs-{card_id}", "Loading previews", work, done, lambda exc: None)


class PROJECTFLOW_OT_load_card_attachments(Operator):
    bl_idname = "projectflow.load_card_attachments"
    bl_label = "Load Attachments"
    bl_description = "Fetch this card's files"
    bl_options = {"REGISTER", "INTERNAL"}

    @classmethod
    def poll(cls, context):
        props = getattr(context.window_manager, "projectflow", None)
        return props is not None and props.active_card() is not None

    def execute(self, context):
        if not check_online_access(self):
            return {"CANCELLED"}
        request_attachments(context.window_manager.projectflow, force=True)
        return {"FINISHED"}


# -- acting on one attachment ---------------------------------------------------


class _AttachmentOperator:
    attachment_id: StringProperty(options={"SKIP_SAVE"})

    def attachment(self) -> Optional[Dict[str, Any]]:
        return find_attachment(self.attachment_id)


class PROJECTFLOW_OT_import_attachment(_AttachmentOperator, Operator):
    """Imports a model attached to a card into the current scene.

    Always the attachment's own file, never its web preview: an FBX may carry a
    small GLB so the website can render something, but the FBX is the real work.
    FBX uses Blender's default import axes, which match the add-on's Unreal
    export preset, so a model exported from here comes back the right way up.
    """

    bl_idname = "projectflow.import_attachment"
    bl_label = "Import"
    bl_description = "Download this model and import it into the scene"
    bl_options = {"REGISTER", "INTERNAL", "UNDO"}

    def execute(self, context):
        att = self.attachment()
        if att is None:
            self.report({"ERROR"}, "Attachment not found. Refresh the card.")
            return {"CANCELLED"}
        if not is_model(att):
            self.report({"ERROR"}, f"{att.get('fileName')} is not a model Blender can import.")
            return {"CANCELLED"}
        if not check_online_access(self):
            return {"CANCELLED"}

        props = context.window_manager.projectflow
        item = props.active_card()
        card = (item.card_id, item.title) if item else ("", "")
        board_id, workspace_id = props.board_id, props.workspace_id
        name = att.get("fileName") or "model"
        ext = extension(att)

        def on_ready(path: str):
            before = set(bpy.data.objects)
            try:
                with bpy.context.temp_override(**_view3d_override()):
                    if ext in {".glb", ".gltf"}:
                        bpy.ops.import_scene.gltf(filepath=path)
                    elif ext == ".fbx":
                        bpy.ops.import_scene.fbx(filepath=path)
                    elif ext == ".obj":
                        bpy.ops.wm.obj_import(filepath=path)
            except Exception as exc:  # noqa: BLE001 - importer errors are varied
                live = _props()
                if live:
                    live.last_error = f"Import failed: {exc}"
                print(f"[ProjectFlow] Import of {name} failed: {exc}")
                tasks.redraw_ui()
                return

            created = [obj for obj in bpy.data.objects if obj not in before]
            tag_objects(created, card[0], card[1], board_id, workspace_id)
            print(f"[ProjectFlow] Imported {name}: {len(created)} object(s)")
            tasks.redraw_ui()

        fetch_then(att, f"Downloading {name}", on_ready)
        return {"FINISHED"}


def _load_image(att: Dict[str, Any], path: str):
    image = bpy.data.images.load(path, check_existing=True)
    # The cache names files by content hash; show people the real filename.
    image.name = att.get("fileName") or image.name
    return image


class PROJECTFLOW_OT_view_attachment_image(_AttachmentOperator, Operator):
    bl_idname = "projectflow.view_attachment_image"
    bl_label = "View"
    bl_description = "Open this image full size in an Image Editor"
    bl_options = {"REGISTER", "INTERNAL"}

    def execute(self, context):
        att = self.attachment()
        if att is None or not is_image(att):
            self.report({"ERROR"}, "Image not found. Refresh the card.")
            return {"CANCELLED"}
        if not check_online_access(self):
            return {"CANCELLED"}

        def on_ready(path: str):
            try:
                image = _load_image(att, path)
            except RuntimeError as exc:
                live = _props()
                if live:
                    live.last_error = f"Blender could not open this image: {exc}"
                tasks.redraw_ui()
                return

            _load_preview(att)
            screen = bpy.context.window_manager.windows[0].screen
            target = next((a for a in screen.areas if a.type == "IMAGE_EDITOR"), None)
            if target is None:
                # Take over the largest area that is not the viewport being worked
                # in — usually the timeline or properties.
                candidates = [a for a in screen.areas if a.type not in {"VIEW_3D", "OUTLINER"}]
                if not candidates:
                    candidates = [a for a in screen.areas if a.type != "VIEW_3D"]
                if candidates:
                    target = max(candidates, key=lambda a: a.width * a.height)
                    target.ui_type = "IMAGE_EDITOR"
            if target is None:
                live = _props()
                if live:
                    live.status = f"Loaded {image.name} — open an Image Editor to see it"
                tasks.redraw_ui()
                return
            target.spaces.active.image = image
            target.tag_redraw()

        fetch_then(att, f"Downloading {att.get('fileName')}", on_ready)
        return {"FINISHED"}


class PROJECTFLOW_OT_use_as_reference(_AttachmentOperator, Operator):
    """Places an image in the viewport as a reference to model against.

    Built with the data API rather than the Add > Image operator, whose options
    and required context have shifted between releases.
    """

    bl_idname = "projectflow.use_as_reference"
    bl_label = "Use as Reference"
    bl_description = "Add this image to the scene as a reference image at the 3D cursor"
    bl_options = {"REGISTER", "INTERNAL", "UNDO"}

    def execute(self, context):
        att = self.attachment()
        if att is None or not is_image(att):
            self.report({"ERROR"}, "Image not found. Refresh the card.")
            return {"CANCELLED"}
        if not check_online_access(self):
            return {"CANCELLED"}

        props = context.window_manager.projectflow
        item = props.active_card()
        card = (item.card_id, item.title) if item else ("", "")
        board_id, workspace_id = props.board_id, props.workspace_id

        def on_ready(path: str):
            try:
                image = _load_image(att, path)
            except RuntimeError as exc:
                live = _props()
                if live:
                    live.last_error = f"Blender could not open this image: {exc}"
                tasks.redraw_ui()
                return

            scene = bpy.context.scene
            obj = bpy.data.objects.new(f"REF_{image.name}", None)
            obj.empty_display_type = "IMAGE"
            obj.data = image
            obj.empty_display_size = 5.0
            obj.location = scene.cursor.location
            # Stand upright facing the front view (-Y), where reference sheets
            # are usually read from.
            obj.rotation_euler = (math.radians(90.0), 0.0, 0.0)
            # Semi-transparent and hidden behind geometry, so it guides the
            # modelling without covering it.
            obj.use_empty_image_alpha = True
            obj.color[3] = 0.5
            obj.empty_image_depth = "BACK"

            collection = bpy.context.view_layer.active_layer_collection.collection
            collection.objects.link(obj)
            tag_objects([obj], card[0], card[1], board_id, workspace_id)

            for other in bpy.context.view_layer.objects:
                other.select_set(False)
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            tasks.redraw_ui()

        fetch_then(att, f"Downloading {att.get('fileName')}", on_ready)
        return {"FINISHED"}


class PROJECTFLOW_OT_open_attachment_in_browser(_AttachmentOperator, Operator):
    bl_idname = "projectflow.open_attachment_url"
    bl_label = "Open"
    bl_description = "Open this file in your web browser"
    bl_options = {"REGISTER", "INTERNAL"}

    def execute(self, context):
        att = self.attachment()
        url = (att or {}).get("fileUrl")
        if not url:
            return {"CANCELLED"}
        bpy.ops.wm.url_open(url=url)
        return {"FINISHED"}


# -- the object <-> card link -----------------------------------------------------


class PROJECTFLOW_OT_select_linked_card(Operator):
    bl_idname = "projectflow.select_linked_card"
    bl_label = "Go to Card"
    bl_description = "Select the card this object belongs to"
    bl_options = {"REGISTER", "INTERNAL"}

    @classmethod
    def poll(cls, context):
        return linked_card(context.active_object) is not None

    def execute(self, context):
        link = linked_card(context.active_object)
        props = context.window_manager.projectflow
        if link is None:
            return {"CANCELLED"}

        if link["workspace_id"] and link["workspace_id"] != props.workspace_id:
            self.report({"WARNING"}, f"'{link['title']}' is in a different workspace.")
            return {"CANCELLED"}

        if select_card(props, link["card_id"]):
            return {"FINISHED"}

        # On another board: switch to it and select the card once it loads.
        if link["board_id"] and link["board_id"] != props.board_id:
            properties.pending_card_id = link["card_id"]
            try:
                props.board_id = link["board_id"]
            except TypeError:
                self.report({"WARNING"}, "That board is not loaded. Refresh boards first.")
                return {"CANCELLED"}
            bpy.ops.projectflow.load_board()
            return {"FINISHED"}

        self.report({"WARNING"}, f"'{link['title']}' is not on this board any more.")
        return {"CANCELLED"}


def select_card(props, card_id: str) -> bool:
    """Makes ``card_id`` the active card if it is in the current list."""
    for index, item in enumerate(props.cards):
        if item.card_id == card_id:
            if props.active_card_index != index:
                props.active_card_index = index
            return True
    # Filtered out of the current view: widen the filter and try again.
    if props.section_filter != "ALL" or props.card_search or props.only_my_cards:
        props.section_filter = "ALL"
        props.card_search = ""
        props.only_my_cards = False
        return select_card(props, card_id) if properties.find_card(card_id) else False
    return False


_msgbus_owner = object()


def _on_active_object_changed(*_args) -> None:
    """Follows the viewport selection: picking a model picks its card."""
    props = getattr(bpy.context.window_manager, "projectflow", None)
    if props is None or not props.follow_active_object:
        return
    link = linked_card(getattr(bpy.context, "active_object", None))
    if link and link["board_id"] == props.board_id:
        select_card(props, link["card_id"])


def _subscribe(*_args) -> None:
    bpy.msgbus.clear_by_owner(_msgbus_owner)
    bpy.msgbus.subscribe_rna(
        key=(bpy.types.LayerObjects, "active"),
        owner=_msgbus_owner,
        args=(),
        notify=_on_active_object_changed,
    )


@bpy.app.handlers.persistent
def _resubscribe_on_load(*_args) -> None:
    # Message-bus subscriptions are dropped whenever a file loads.
    _subscribe()


classes = (
    PROJECTFLOW_OT_load_card_attachments,
    PROJECTFLOW_OT_import_attachment,
    PROJECTFLOW_OT_view_attachment_image,
    PROJECTFLOW_OT_use_as_reference,
    PROJECTFLOW_OT_open_attachment_in_browser,
    PROJECTFLOW_OT_select_linked_card,
)


def register() -> None:
    for cls in classes:
        bpy.utils.register_class(cls)
    _subscribe()
    if _resubscribe_on_load not in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.append(_resubscribe_on_load)


def unregister() -> None:
    global _previews
    bpy.msgbus.clear_by_owner(_msgbus_owner)
    if _resubscribe_on_load in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.remove(_resubscribe_on_load)
    if _previews is not None:
        bpy.utils.previews.remove(_previews)
        _previews = None
    attachments.clear()
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
