"""Builds the ProjectFlow menu, and uses it as the browser.

Authoring Slate UI or Blueprint widgets from Python is not practical, so the
board / card / asset-library tree *is* the menu tree. That turns out to suit
the data: workspaces, boards, sections, cards and folders are already a
hierarchy, and a menu is the one widget Unreal lets Python build freely.

Two things to know before editing:

* Menu entry objects must be kept referenced from Python. Unreal holds only a
  weak reference, so an entry that goes out of scope is garbage collected and
  its callback silently stops firing — or crashes the editor. Everything built
  here is parked in ``_entries``.
* Menus are built from the cached payloads in ``actions.state``, never from
  live requests. A submenu that fetched on expand would be slow and would burn
  the server's 300-requests-per-minute budget while someone browsed.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List

import unreal

from . import actions, config, importer

MENU_OWNER = "ProjectFlow"
ROOT_MENU = "LevelEditor.MainMenu.ProjectFlow"

#: Keeps every entry object alive. See the module docstring.
_entries: List[Any] = []


@unreal.uclass()
class _PFEntry(unreal.ToolMenuEntryScript):
    """A menu item that calls back into Python.

    ``ToolMenuEntryScript`` is the supported way to get a clickable entry from
    Python; the callable is stored on the instance rather than in the uclass so
    it survives the round trip through the engine.
    """

    def setup(self, callback: Callable[[], None]):
        self._callback = callback
        return self

    @unreal.ufunction(override=True)
    def execute(self, context):
        try:
            self._callback()
        except Exception as exc:  # noqa: BLE001 - never let a click crash the editor
            unreal.log_error(f"[ProjectFlow] Menu action failed: {exc}")
            import traceback

            unreal.log_error(traceback.format_exc())


def _add_entry(menu, section: str, name: str, label: str, tooltip: str, callback) -> None:
    entry = _PFEntry()
    entry.setup(callback)
    entry.init_entry(
        owner_name=MENU_OWNER,
        menu=menu.menu_name,
        section=section,
        name=name,
        label=label,
        tool_tip=tooltip,
    )
    menu.add_menu_entry_object(entry)
    _entries.append(entry)


def _add_label(menu, section: str, name: str, label: str) -> None:
    """A disabled-looking informational row. Clicking it does nothing."""
    _add_entry(menu, section, name, label, "", lambda: None)


def _safe_name(value: str) -> str:
    """Menu entry names must be unique and free of separators."""
    return "".join(ch if ch.isalnum() else "_" for ch in (value or ""))[:60] or "item"


# -- building --------------------------------------------------------------


def rebuild() -> None:
    """Tears the menu down and builds it again from cached data."""
    tool_menus = unreal.ToolMenus.get()

    tool_menus.unregister_owner_by_name(MENU_OWNER)
    _entries.clear()

    main = tool_menus.find_menu("LevelEditor.MainMenu")
    if main is None:
        unreal.log_warning("[ProjectFlow] Main menu unavailable; skipping menu build.")
        return

    root = main.add_sub_menu(
        owner=MENU_OWNER,
        section_name="",
        name="ProjectFlow",
        label="ProjectFlow",
        tool_tip="Boards, cards and the workspace asset library",
    )

    if not actions.signed_in():
        _add_entry(root, "auth", "SignIn", "Sign In...",
                   "Paste a ProjectFlow access token", actions.sign_in)
        _add_entry(root, "auth", "Settings", "Settings...",
                   "Show the current configuration", actions.open_settings)
        tool_menus.refresh_all_widgets()
        return

    _build_account_section(root)
    _build_library_section(tool_menus, root)
    _build_boards_section(tool_menus, root)
    _build_tools_section(root)

    tool_menus.refresh_all_widgets()


def _build_account_section(root) -> None:
    user = actions.state.get("user") or {}
    name = user.get("name") or user.get("email") or "Signed in"
    workspace = config.get("workspace_name") or "(no workspace)"

    _add_label(root, "account", "Account", f"{name}  -  {workspace}")
    _add_entry(root, "account", "Refresh", "Refresh",
               "Reload workspaces, boards and the asset library", actions.refresh)


def _build_library_section(tool_menus, root) -> None:
    assets: List[Dict[str, Any]] = actions.state.get("assets") or []

    library = root.add_sub_menu(
        owner=MENU_OWNER,
        section_name="content",
        name="AssetLibrary",
        label=f"Asset Library ({len(assets)})",
        tool_tip="3D assets in this workspace",
    )

    if not assets:
        _add_label(library, "items", "Empty", "No 3D assets found")
        return

    _add_entry(library, "bulk", "ImportAll", "Import All...",
               "Import every asset, skipping ones already up to date",
               actions.import_all_library_assets)

    # Group by folder so the menu mirrors the library's own structure.
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for asset in assets:
        grouped.setdefault(actions.folder_path_for(asset) or "Unfiled", []).append(asset)

    for folder_path in sorted(grouped):
        folder_assets = grouped[folder_path]
        submenu = library.add_sub_menu(
            owner=MENU_OWNER,
            section_name="folders",
            name=_safe_name(folder_path),
            label=f"{folder_path} ({len(folder_assets)})",
            tool_tip=f"{len(folder_assets)} asset(s)",
        )
        for asset in sorted(folder_assets, key=lambda a: a.get("fileName", "")):
            _add_asset_entry(submenu, asset)


def _add_asset_entry(menu, asset: Dict[str, Any]) -> None:
    name = asset.get("fileName", "asset")
    size_mb = (asset.get("fileSize") or 0) / (1024 * 1024)

    _add_entry(
        menu,
        "assets",
        _safe_name(asset.get("id", name)),
        f"{name}  ({size_mb:.1f} MB)",
        f"Import {name} into {importer.destination_for(actions.folder_path_for(asset))}",
        lambda a=asset: actions.import_library_asset(a),
    )


def _build_boards_section(tool_menus, root) -> None:
    boards: List[Dict[str, Any]] = actions.state.get("boards") or []

    menu = root.add_sub_menu(
        owner=MENU_OWNER,
        section_name="content",
        name="Boards",
        label=f"Boards ({len(boards)})",
        tool_tip="Kanban boards in this workspace",
    )

    if not boards:
        _add_label(menu, "items", "Empty", "No boards found")
        return

    loaded = actions.state.get("board") or {}
    loaded_id = loaded.get("id")

    for board in boards:
        board_id = board.get("id", "")
        title = board.get("title", "Untitled")

        if board_id == loaded_id:
            _build_loaded_board(menu, loaded)
        else:
            # Boards are only fetched when opened: the full payload carries
            # every section and card, so loading all of them up front would be
            # wasteful for boards nobody looks at.
            _add_entry(
                menu, "boards", _safe_name(board_id), f"{title}  (open)",
                "Load this board's sections and cards",
                lambda b=board_id: actions.load_board(b),
            )


def _build_loaded_board(parent, board: Dict[str, Any]) -> None:
    title = board.get("title", "Untitled")
    sections = board.get("lists") or []

    menu = parent.add_sub_menu(
        owner=MENU_OWNER,
        section_name="boards",
        name=_safe_name(board.get("id", "")),
        label=title,
        tool_tip="Sections and cards",
    )

    for index, section in enumerate(sections):
        cards = section.get("cards") or []
        section_title = section.get("title", "Untitled")

        submenu = menu.add_sub_menu(
            owner=MENU_OWNER,
            section_name="sections",
            name=_safe_name(section.get("id", str(index))),
            label=f"{section_title} ({len(cards)})",
            tool_tip=f"Stage {index + 1} of {len(sections)}",
        )

        if not cards:
            _add_label(submenu, "cards", "Empty", "No cards")
            continue

        for card in cards:
            _build_card_menu(submenu, board, card)


def _build_card_menu(parent, board: Dict[str, Any], card: Dict[str, Any]) -> None:
    card_id = card.get("id", "")
    title = card.get("title", "Untitled")
    counts = card.get("_count") or {}
    attachment_count = counts.get("attachments", 0)

    label = f"{title}" + (f"  [{attachment_count}]" if attachment_count else "")

    menu = parent.add_sub_menu(
        owner=MENU_OWNER,
        section_name="cards",
        name=_safe_name(card_id),
        label=label,
        tool_tip=(card.get("description") or title)[:120],
    )

    _add_entry(
        menu, "card", "Attachments", "Load Attachments...",
        "Fetch this card's files so they can be imported",
        lambda b=board, c=card: _load_card_attachments(b, c),
    )

    cached = _attachment_cache.get(card_id)
    if cached is None:
        return

    if not cached:
        _add_label(menu, "files", "None", "No attachments")
        return

    for attachment in cached:
        name = attachment.get("fileName", "file")
        extension = name.lower().rsplit(".", 1)[-1] if "." in name else ""
        importable = f".{extension}" in importer.SUPPORTED

        if importable:
            _add_entry(
                menu, "files", _safe_name(attachment.get("id", name)),
                f"Import {name}",
                f"Download and import {name}",
                lambda a=attachment, c=card: actions.import_card_attachment(a, c),
            )
        else:
            _add_label(
                menu, "files", _safe_name(attachment.get("id", name)),
                f"{name}  (not importable)",
            )


#: Attachments are fetched per card on demand — the board payload carries only
#: counts, and pulling files for every card up front would be a request each.
_attachment_cache: Dict[str, List[Dict[str, Any]]] = {}


def _load_card_attachments(board: Dict[str, Any], card: Dict[str, Any]) -> None:
    from . import api

    workspace_id = config.get("workspace_id")
    try:
        attachments = actions.client().card_attachments(
            workspace_id, board.get("id", ""), card.get("id", "")
        )
    except api.ApiError as exc:
        actions.notify(actions.report_error(exc))
        return

    _attachment_cache[card.get("id", "")] = attachments
    rebuild()

    if not attachments:
        actions.notify(f"'{card.get('title')}' has no attachments.")


def _build_tools_section(root) -> None:
    _add_entry(root, "tools", "CheckUpdates", "Check for Updates...",
               "Find imported assets with a newer version and reimport them",
               actions.check_for_updates)
    _add_entry(root, "tools", "Settings", "Settings...",
               "Show the current configuration", actions.open_settings)
    _add_entry(root, "tools", "SignOut", "Sign Out",
               "Remove the stored access token from this machine",
               actions.sign_out)


def unregister() -> None:
    try:
        unreal.ToolMenus.get().unregister_owner_by_name(MENU_OWNER)
        unreal.ToolMenus.get().refresh_all_widgets()
    except Exception:  # noqa: BLE001
        pass
    _entries.clear()
