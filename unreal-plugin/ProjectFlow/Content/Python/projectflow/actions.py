"""The operations the menus invoke.

Everything here runs on the editor's main thread. Unreal's Python API is not
thread-safe, and a background thread touching it takes the editor down rather
than raising — so long work uses ``ScopedSlowTask`` to keep the UI responsive
and cancellable instead of being moved off-thread.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import unreal

from . import api, config, importer

# Cached API payloads, refreshed by `refresh()`. Menus are rebuilt from these,
# so browsing never costs a request.
state: Dict[str, Any] = {
    "user": None,
    "workspaces": [],
    "boards": [],
    "board": None,
    "assets": [],
    "folders": [],
    "loaded": False,
}


# -- helpers ---------------------------------------------------------------


def client() -> api.ApiClient:
    return api.ApiClient(config.get("server_url"), config.load_token())


def notify(message: str, title: str = "ProjectFlow") -> None:
    unreal.log(f"[ProjectFlow] {message}")
    unreal.EditorDialog.show_message(title, message, unreal.AppMsgType.OK)


def confirm(message: str, title: str = "ProjectFlow") -> bool:
    response = unreal.EditorDialog.show_message(
        title, message, unreal.AppMsgType.YES_NO
    )
    return response == unreal.AppReturnType.YES


def report_error(exc: BaseException) -> str:
    """Turns an exception into a message worth showing, handling 401 globally."""
    if isinstance(exc, api.AuthError):
        config.clear_token()
        state["user"] = None
        message = "Your access token is no longer valid. Sign in again."
    elif isinstance(exc, api.ForbiddenError):
        message = exc.message or "You do not have access to that workspace."
    elif isinstance(exc, api.RateLimitError):
        message = exc.message or "Too many requests. Wait a moment and retry."
    elif isinstance(exc, api.ApiError):
        message = exc.message
    else:
        message = str(exc)

    unreal.log_error(f"[ProjectFlow] {message}")
    return message


def signed_in() -> bool:
    return bool(config.load_token())


# -- authentication --------------------------------------------------------


def sign_in() -> bool:
    """Takes a personal access token and verifies it.

    A token rather than a password: it can be revoked from the website without
    touching the account, and nothing here ever handles a credential the user
    would reuse elsewhere.
    """
    token = _prompt_text(
        "Sign in to ProjectFlow",
        "Paste an access token (starts with pf_).\n"
        "Create one under Account > Access Tokens on the website.",
    )
    if not token:
        return False

    token = token.strip()
    if not token.startswith("pf_"):
        notify("That does not look like an access token (expected pf_...).")
        return False

    with unreal.ScopedSlowTask(2, "Connecting to ProjectFlow...") as task:
        task.make_dialog(True)

        probe = api.ApiClient(config.get("server_url"), token)
        task.enter_progress_frame(1, "Waking the server...")
        try:
            probe.health()
        except api.ApiError:
            pass  # the authenticated call below is the real test

        task.enter_progress_frame(1, "Verifying token...")
        try:
            user = probe.me()
        except api.ApiError as exc:
            notify(report_error(exc))
            return False

    config.save_token(token)
    state["user"] = user
    notify(f"Signed in as {user.get('name') or user.get('email') or 'unknown'}.")
    refresh()
    return True


def sign_out() -> None:
    config.clear_token()
    state.update({"user": None, "workspaces": [], "boards": [], "board": None,
                  "assets": [], "folders": [], "loaded": False})
    notify("Signed out. The token was removed from this machine.")


def _prompt_text(title: str, message: str) -> Optional[str]:
    """Asks for a single line of text.

    Unreal has no Python text-input dialog, so this uses the input dialog the
    editor exposes to Blutility, falling back to the Output Log instruction if
    that is unavailable in this build.
    """
    try:
        result = unreal.EditorDialog.show_input_dialog(title, message, "")
        if isinstance(result, tuple):
            confirmed, value = result[0], result[1]
            return value if confirmed else None
        return result or None
    except Exception:  # noqa: BLE001 - not present in every build
        unreal.log_warning(
            "[ProjectFlow] This engine build has no input dialog. "
            "Run this in the Python console instead:\n"
            "  import projectflow; projectflow.actions.set_token('pf_...')"
        )
        notify(
            "This Unreal build cannot show a text prompt.\n\n"
            "Open Window > Output Log, switch to the Python console, and run:\n"
            "  import projectflow\n"
            "  projectflow.actions.set_token('pf_your_token')"
        )
        return None


def set_token(token: str) -> None:
    """Console fallback for builds without a text-input dialog."""
    token = (token or "").strip()
    if not token.startswith("pf_"):
        unreal.log_error("[ProjectFlow] Expected a token starting with pf_")
        return
    try:
        user = api.ApiClient(config.get("server_url"), token).me()
    except api.ApiError as exc:
        unreal.log_error(f"[ProjectFlow] {report_error(exc)}")
        return
    config.save_token(token)
    state["user"] = user
    unreal.log(f"[ProjectFlow] Signed in as {user.get('name')}.")
    refresh()


# -- loading ---------------------------------------------------------------


def refresh(rebuild_menus: bool = True) -> bool:
    """Reloads workspaces, boards, the active board and the asset library.

    One pass so the menus can be built entirely from cached data — browsing a
    tree that fired a request per submenu would be slow and would burn the
    server's 300-per-minute budget.
    """
    if not signed_in():
        notify("Sign in first: ProjectFlow > Sign In.")
        return False

    api_client = client()

    with unreal.ScopedSlowTask(4, "Loading ProjectFlow...") as task:
        task.make_dialog(True)
        try:
            task.enter_progress_frame(1, "Connecting...")
            try:
                api_client.health()
            except api.ApiError:
                pass

            state["user"] = api_client.me()

            task.enter_progress_frame(1, "Loading workspaces...")
            workspaces = api_client.workspaces()
            state["workspaces"] = workspaces

            workspace_id = config.get("workspace_id") or ""
            known = {w.get("id") for w in workspaces}
            if workspace_id not in known:
                workspace_id = workspaces[0]["id"] if workspaces else ""
                config.set_value("workspace_id", workspace_id)
                config.set_value(
                    "workspace_name",
                    workspaces[0].get("name", "") if workspaces else "",
                )

            if not workspace_id:
                state["loaded"] = True
                notify("You are not a member of any workspace yet.")
                return False

            task.enter_progress_frame(1, "Loading boards...")
            state["boards"] = api_client.boards(workspace_id)

            task.enter_progress_frame(1, "Loading asset library...")
            state["folders"] = api_client.asset_folders(workspace_id)
            state["assets"] = list(api_client.iter_assets(workspace_id))

        except api.ApiError as exc:
            notify(report_error(exc))
            return False

    state["loaded"] = True

    if rebuild_menus:
        from . import menus

        menus.rebuild()

    return True


def select_workspace(workspace_id: str, name: str) -> None:
    config.set_value("workspace_id", workspace_id)
    config.set_value("workspace_name", name)
    state["board"] = None
    refresh()


def load_board(board_id: str) -> Optional[Dict[str, Any]]:
    """Fetches one board in full: sections in order, each with its cards."""
    workspace_id = config.get("workspace_id")
    try:
        board = client().board(workspace_id, board_id)
    except api.ApiError as exc:
        notify(report_error(exc))
        return None

    state["board"] = board
    from . import menus

    menus.rebuild()
    return board


# -- importing -------------------------------------------------------------


def folder_path_for(asset: Dict[str, Any]) -> str:
    """Resolves an asset's folder chain into a path like ``Environment/Props``."""
    folders = {f.get("id"): f for f in state.get("folders", []) if f.get("id")}
    segments: List[str] = []
    cursor = asset.get("folderId")
    seen = set()

    while cursor and cursor in folders and cursor not in seen:
        seen.add(cursor)
        segments.append(folders[cursor].get("name", "Untitled"))
        cursor = folders[cursor].get("parentId")

    return "/".join(reversed(segments))


def import_library_asset(asset: Dict[str, Any], force: bool = False) -> None:
    name = asset.get("fileName", "asset")
    with unreal.ScopedSlowTask(2, f"Importing {name}...") as task:
        task.make_dialog(True)
        result = importer.import_file(
            file_url=asset.get("fileUrl", ""),
            file_name=name,
            asset_id=asset.get("id", ""),
            folder_path=folder_path_for(asset),
            force=force,
            slow_task=task,
        )

    _report_import(result, name)


def import_card_attachment(attachment: Dict[str, Any], card: Dict[str, Any]) -> None:
    """Imports a card attachment.

    Deliberately uses ``fileUrl``, never ``previewUrl``: the preview is a small
    GLB that exists so the website can render something, while the attachment
    itself is the FBX meant for the engine.
    """
    name = attachment.get("fileName", "attachment")
    with unreal.ScopedSlowTask(2, f"Importing {name}...") as task:
        task.make_dialog(True)
        result = importer.import_file(
            file_url=attachment.get("fileUrl", ""),
            file_name=name,
            asset_id=attachment.get("id", ""),
            folder_path=importer.sanitize_path_segment(card.get("title", "")),
            card_id=card.get("id", ""),
            slow_task=task,
        )

    _report_import(result, name)


def _report_import(result: importer.ImportResult, name: str) -> None:
    if result.error:
        notify(f"Import failed.\n\n{result.error}")
        return

    if result.skipped:
        notify(f"{name} is already up to date.\n\n{result.asset_path}")
        return

    verb = "Reimported" if result.reimported else "Imported"
    notify(f"{verb} {name}.\n\n{result.asset_path}")

    try:
        unreal.EditorAssetLibrary.sync_browser_to_objects([result.asset_path])
    except Exception:  # noqa: BLE001 - purely a convenience
        pass


def import_all_library_assets() -> None:
    """Imports everything in the library, skipping what is already current."""
    assets = state.get("assets") or []
    if not assets:
        notify("No 3D assets in this workspace. Try ProjectFlow > Refresh.")
        return

    if not confirm(
        f"Import all {len(assets)} asset(s) from the library?\n\n"
        "Assets already imported at the same version are skipped."
    ):
        return

    imported = skipped = failed = 0
    errors: List[str] = []

    with unreal.ScopedSlowTask(len(assets), "Importing library...") as task:
        task.make_dialog(True)
        for asset in assets:
            if task.should_cancel():
                break
            name = asset.get("fileName", "asset")
            task.enter_progress_frame(1, name)

            result = importer.import_file(
                file_url=asset.get("fileUrl", ""),
                file_name=name,
                asset_id=asset.get("id", ""),
                folder_path=folder_path_for(asset),
            )
            if result.error:
                failed += 1
                errors.append(result.error)
            elif result.skipped:
                skipped += 1
            else:
                imported += 1

    summary = f"Imported {imported}, skipped {skipped}, failed {failed}."
    if errors:
        summary += "\n\n" + "\n".join(errors[:5])
    notify(summary)


def check_for_updates() -> None:
    """Finds imported assets whose source hash has moved on, and offers reimport.

    This is what the content hashes are for. Reimporting through the same
    UAsset keeps material assignments, Blueprint references and level
    placements intact, which is the difference between an update and a
    re-hookup.
    """
    assets = state.get("assets") or []
    if not assets:
        notify("Nothing loaded. Try ProjectFlow > Refresh first.")
        return

    stale: List[Dict[str, Any]] = []

    with unreal.ScopedSlowTask(len(assets), "Checking for updates...") as task:
        task.make_dialog(True)
        for asset in assets:
            if task.should_cancel():
                return
            task.enter_progress_frame(1)

            name = asset.get("fileName", "")
            destination = importer.destination_for(folder_path_for(asset))
            existing = importer.find_existing(
                asset.get("id", ""), destination, importer.sanitize_name(name)
            )
            if existing and importer.needs_update(existing, asset.get("fileUrl", "")):
                stale.append(asset)

    if not stale:
        notify("Every imported asset is up to date.")
        return

    names = "\n".join(f"  - {a.get('fileName')}" for a in stale[:10])
    more = f"\n  ...and {len(stale) - 10} more" if len(stale) > 10 else ""

    if not confirm(
        f"{len(stale)} asset(s) have a newer version:\n\n{names}{more}\n\n"
        "Reimport them now? Existing material assignments and references are kept."
    ):
        return

    done = failed = 0
    with unreal.ScopedSlowTask(len(stale), "Reimporting...") as task:
        task.make_dialog(True)
        for asset in stale:
            if task.should_cancel():
                break
            task.enter_progress_frame(1, asset.get("fileName", ""))
            result = importer.import_file(
                file_url=asset.get("fileUrl", ""),
                file_name=asset.get("fileName", ""),
                asset_id=asset.get("id", ""),
                folder_path=folder_path_for(asset),
                force=True,
            )
            if result.error:
                failed += 1
            else:
                done += 1

    notify(f"Reimported {done}, failed {failed}.")


def open_settings() -> None:
    """Shows the current configuration and where to change it."""
    settings = config.load_settings()
    lines = [
        f"Server:          {settings.get('server_url')}",
        f"Workspace:       {settings.get('workspace_name') or '(none)'}",
        f"Import into:     {settings.get('destination_root')}",
        f"Mirror folders:  {settings.get('mirror_library_folders')}",
        "",
        "Import options",
        f"  Combine meshes:      {settings.get('combine_meshes')}",
        f"  Lightmap UVs:        {settings.get('generate_lightmap_uvs')}",
        f"  Auto collision:      {settings.get('auto_generate_collision')}",
        f"  Nanite:              {settings.get('build_nanite')}",
        f"  Import as skeletal:  {settings.get('import_as_skeletal')}",
        f"  Materials/textures:  {settings.get('import_materials')}/{settings.get('import_textures')}",
        "",
        "Change any of these from the Python console:",
        "  import projectflow",
        "  projectflow.config.set_value('build_nanite', True)",
        "",
        f"Settings file: {config._settings_path()}",
    ]
    notify("\n".join(lines), "ProjectFlow Settings")
