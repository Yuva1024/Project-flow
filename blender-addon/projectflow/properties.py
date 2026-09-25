"""Blender property groups and the runtime cache behind the dropdowns.

One thing here is load-bearing and easy to get wrong: **dynamic EnumProperty
item callbacks must not build their strings on the fly.** Blender does not keep
a reference to the list a callback returns, so temporary strings are garbage
collected while the dropdown still points at them — which shows up as garbled
labels or a hard crash, usually blamed on something unrelated.

Every ``_items`` callback below therefore returns a list held in a module-level
cache for as long as the dropdown can be open.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import bpy
from bpy.props import (
    BoolProperty,
    CollectionProperty,
    EnumProperty,
    IntProperty,
    StringProperty,
)
from bpy.types import PropertyGroup

# -- enum item caches ------------------------------------------------------
# Held at module scope so Blender's references into them stay valid.

_workspace_items: List[tuple] = [("NONE", "No workspaces", "", 0)]
_board_items: List[tuple] = [("NONE", "No boards", "", 0)]
_section_items: List[tuple] = [("ALL", "All sections", "", 0)]
_move_items: List[tuple] = [("NONE", "No sections", "", 0)]

#: Raw API payloads, kept so operators can read fields the UI does not show.
cached_workspaces: List[Dict[str, Any]] = []
cached_boards: List[Dict[str, Any]] = []
cached_board: Optional[Dict[str, Any]] = None
cached_card_details: Dict[str, Dict[str, Any]] = {}

#: A card to select once the board it lives on finishes loading. Set by
#: "Go to Card" when the object belongs to a different board.
pending_card_id: Optional[str] = None


def set_workspaces(workspaces: List[Dict[str, Any]]) -> None:
    global cached_workspaces, _workspace_items
    cached_workspaces = workspaces or []

    if not cached_workspaces:
        _workspace_items = [("NONE", "No workspaces", "", 0)]
        return

    _workspace_items = [
        (
            ws["id"],
            ws.get("name", "Untitled"),
            f"{(ws.get('_count') or {}).get('boards', 0)} board(s)",
            index,
        )
        for index, ws in enumerate(cached_workspaces)
        if ws.get("id")
    ]


def set_boards(boards: List[Dict[str, Any]]) -> None:
    global cached_boards, _board_items
    cached_boards = boards or []

    if not cached_boards:
        _board_items = [("NONE", "No boards", "", 0)]
        return

    _board_items = [
        (
            board["id"],
            board.get("title", "Untitled"),
            f"{(board.get('_count') or {}).get('lists', 0)} section(s)",
            index,
        )
        for index, board in enumerate(cached_boards)
        if board.get("id")
    ]


def set_board(board: Optional[Dict[str, Any]]) -> None:
    """Stores the full board payload and rebuilds the section dropdowns."""
    global cached_board, _section_items, _move_items
    cached_board = board

    lists = (board or {}).get("lists") or []

    # The section filter always offers "All sections" first: cards flow through
    # a pipeline and people need to see the whole board, not one stage at a time.
    _section_items = [("ALL", "All sections", "Show every card on this board", 0)]
    _move_items = []

    for index, section in enumerate(lists):
        section_id = section.get("id")
        if not section_id:
            continue
        title = section.get("title", "Untitled")
        count = len(section.get("cards") or [])
        _section_items.append((section_id, title, f"{count} card(s)", index + 1))
        _move_items.append((section_id, title, f"Move to {title}", index))

    if not _move_items:
        _move_items = [("NONE", "No sections", "", 0)]


def sections() -> List[Dict[str, Any]]:
    return (cached_board or {}).get("lists") or []


def section_by_id(section_id: str) -> Optional[Dict[str, Any]]:
    for section in sections():
        if section.get("id") == section_id:
            return section
    return None


def next_section(section_id: str) -> Optional[Dict[str, Any]]:
    """The following stage in the pipeline, or None at the end.

    Sections arrive ordered by position, so 'next' is simply the next element —
    no extra data needed to model the pipeline.
    """
    ordered = sections()
    for index, section in enumerate(ordered):
        if section.get("id") == section_id:
            return ordered[index + 1] if index + 1 < len(ordered) else None
    return None


def find_card(card_id: str) -> Optional[Dict[str, Any]]:
    for section in sections():
        for card in section.get("cards") or []:
            if card.get("id") == card_id:
                return card
    return None


def clear_caches() -> None:
    global cached_workspaces, cached_boards, cached_board, cached_card_details
    cached_workspaces = []
    cached_boards = []
    cached_board = None
    cached_card_details = {}
    set_workspaces([])
    set_boards([])
    set_board(None)


# -- enum callbacks --------------------------------------------------------


def workspace_items(self, context):
    return _workspace_items


def board_items(self, context):
    return _board_items


def section_items(self, context):
    return _section_items


def move_target_items(self, context):
    return _move_items


# -- update callbacks ------------------------------------------------------


def _on_workspace_changed(self, context):
    """Clears board state so the panel never shows another workspace's cards."""
    set_boards([])
    set_board(None)
    self.board_id = "NONE"
    self.cards.clear()
    self.active_card_index = 0


def _on_board_changed(self, context):
    set_board(None)
    self.cards.clear()
    self.active_card_index = 0


def _on_filter_changed(self, context):
    rebuild_card_list(self)


def _on_active_card_changed(self, context):
    """Selecting a card starts loading its attachments and thumbnails.

    Starts a background task rather than running an operator, which is what an
    update callback is allowed to do.
    """
    from . import ops_attachments

    item = self.active_card()
    if item is not None and item.attachment_count:
        ops_attachments.request_attachments(self)


# -- card list -------------------------------------------------------------


class ProjectFlowCard(PropertyGroup):
    """One row in the card list. A flattened view of the cached board payload."""

    card_id: StringProperty(name="Card ID")
    title: StringProperty(name="Title")
    section_id: StringProperty(name="Section ID")
    section_title: StringProperty(name="Section")
    priority: StringProperty(name="Priority")
    label_summary: StringProperty(name="Labels")
    attachment_count: IntProperty(name="Attachments")
    assigned_to_me: BoolProperty(name="Assigned to me")


def rebuild_card_list(props: "ProjectFlowProperties") -> None:
    """Refills the card collection from the cached board, honouring the filter."""
    previous_id = ""
    if 0 <= props.active_card_index < len(props.cards):
        previous_id = props.cards[props.active_card_index].card_id

    props.cards.clear()

    from . import session

    my_id = (session.state.user or {}).get("id", "")
    search = (props.card_search or "").strip().lower()

    for section in sections():
        section_id = section.get("id", "")
        section_title = section.get("title", "")

        if props.section_filter != "ALL" and props.section_filter != section_id:
            continue

        for card in section.get("cards") or []:
            title = card.get("title", "")
            if search and search not in title.lower():
                continue

            members = card.get("members") or []
            assigned = any((m.get("userId") or "") == my_id for m in members)
            if props.only_my_cards and not assigned:
                continue

            labels = [
                (entry.get("label") or {}).get("name", "")
                for entry in (card.get("labels") or [])
            ]
            counts = card.get("_count") or {}

            item = props.cards.add()
            item.card_id = card.get("id", "")
            item.title = title
            item.section_id = section_id
            item.section_title = section_title
            item.priority = card.get("priority") or ""
            item.label_summary = ", ".join(name for name in labels if name)
            item.attachment_count = counts.get("attachments", 0)
            item.assigned_to_me = assigned

    # A pending "Go to Card" wins over keeping the previous selection.
    global pending_card_id
    if pending_card_id:
        target, pending_card_id = pending_card_id, None
        for index, item in enumerate(props.cards):
            if item.card_id == target:
                props.active_card_index = index
                return

    # Keep the same card selected across a refresh where possible.
    if previous_id:
        for index, item in enumerate(props.cards):
            if item.card_id == previous_id:
                props.active_card_index = index
                return
    props.active_card_index = 0


class ProjectFlowProperties(PropertyGroup):
    """Session state for the panel. Lives on the WindowManager, so it is never
    written into a .blend file."""

    workspace_id: EnumProperty(
        name="Workspace",
        description="Which ProjectFlow workspace to work with",
        items=workspace_items,
        update=_on_workspace_changed,
    )

    board_id: EnumProperty(
        name="Board",
        description="Board to show cards from",
        items=board_items,
        update=_on_board_changed,
    )

    section_filter: EnumProperty(
        name="Section",
        description="Limit the card list to one stage of the pipeline",
        items=section_items,
        update=_on_filter_changed,
    )

    move_target: EnumProperty(
        name="Move to",
        description="Section to move the selected card into",
        items=move_target_items,
    )

    card_search: StringProperty(
        name="Search",
        description="Filter cards by title",
        options={"TEXTEDIT_UPDATE"},
        update=_on_filter_changed,
    )

    only_my_cards: BoolProperty(
        name="Only my cards",
        description="Show only cards you are assigned to",
        default=False,
        update=_on_filter_changed,
    )

    cards: CollectionProperty(type=ProjectFlowCard)
    active_card_index: IntProperty(
        name="Active card", default=0, update=_on_active_card_changed
    )

    follow_active_object: BoolProperty(
        name="Follow Selection",
        description=(
            "Selecting an object in the viewport selects the card it was "
            "attached to or imported from"
        ),
        default=True,
    )

    # Progress + status, written by task callbacks on the main thread.
    busy: BoolProperty(default=False)
    status: StringProperty(default="")
    progress: IntProperty(default=0, min=0, max=100, subtype="PERCENTAGE")
    last_error: StringProperty(default="")

    show_card_details: BoolProperty(name="Card details", default=True)
    show_attachments: BoolProperty(name="Attachments", default=True)
    show_activity: BoolProperty(name="Activity", default=False)

    comment_draft: StringProperty(
        name="Comment",
        description="Comment to post on the selected card",
        default="",
    )

    def active_card(self) -> Optional["ProjectFlowCard"]:
        if 0 <= self.active_card_index < len(self.cards):
            return self.cards[self.active_card_index]
        return None


classes = (ProjectFlowCard, ProjectFlowProperties)


def register() -> None:
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.WindowManager.projectflow = bpy.props.PointerProperty(
        type=ProjectFlowProperties
    )


def unregister() -> None:
    clear_caches()
    if hasattr(bpy.types.WindowManager, "projectflow"):
        del bpy.types.WindowManager.projectflow
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
