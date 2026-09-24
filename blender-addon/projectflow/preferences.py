"""Add-on preferences: where the server is, where the cache lives, who is signed in."""

from __future__ import annotations

import os

import bpy
from bpy.props import BoolProperty, StringProperty
from bpy.types import AddonPreferences

from . import cache, session

DEFAULT_SERVER = "https://project-flow-tx4p.onrender.com"
# The website and the API are separate deployments on different domains, so
# one cannot be derived from the other.
DEFAULT_SITE = "https://projectflow-10.netlify.app"


def default_cache_dir() -> str:
    """Cache location under Blender's own user data directory.

    Keeps it out of the user's project folders and away from anything they might
    commit, while surviving add-on reinstalls.
    """
    base = bpy.utils.user_resource("DATAFILES", path="projectflow", create=True)
    return base or os.path.join(os.path.expanduser("~"), ".projectflow")


class ProjectFlowPreferences(AddonPreferences):
    # Must match the extension id, which is how Blender addresses these.
    bl_idname = __package__

    server_url: StringProperty(
        name="Server URL",
        description="Base URL of your ProjectFlow backend, without a trailing slash",
        default=DEFAULT_SERVER,
    )

    site_url: StringProperty(
        name="Website URL",
        description="Address of the ProjectFlow website, used by Open in Browser",
        default=DEFAULT_SITE,
    )

    cache_dir: StringProperty(
        name="Cache Folder",
        description="Where downloaded assets and generated .blend files are kept",
        subtype="DIR_PATH",
        default="",
    )

    generate_previews: BoolProperty(
        name="Generate Previews",
        description=(
            "Render a thumbnail for each asset while building it. Slower, and "
            "unreliable in background mode on some systems — assets still work "
            "without previews, they just show a generic icon"
        ),
        default=True,
    )

    auto_register_library: BoolProperty(
        name="Register Asset Library Automatically",
        description=(
            "Add the cache folder to Blender's asset libraries so synced assets "
            "appear in the Asset Browser"
        ),
        default=True,
    )

    def resolved_cache_dir(self) -> str:
        return bpy.path.abspath(self.cache_dir) if self.cache_dir else default_cache_dir()

    def get_cache(self) -> cache.AssetCache:
        return cache.AssetCache(self.resolved_cache_dir())

    def draw(self, context):
        layout = self.layout

        # Blender 4.2+ gates all extension network access behind a global switch.
        # Without this notice the add-on just looks broken, because the error the
        # network layer raises cannot explain why the request never left.
        if not bpy.app.online_access:
            box = layout.box()
            box.alert = True
            box.label(text="Online access is disabled", icon="ERROR")
            box.label(text="ProjectFlow cannot reach your server until you allow it.")
            box.operator(
                "screen.userpref_show", text="Open System Preferences", icon="PREFERENCES"
            ).section = "SYSTEM"

        col = layout.column()
        col.use_property_split = True
        col.prop(self, "server_url")
        col.prop(self, "site_url")
        col.prop(self, "cache_dir", placeholder=default_cache_dir())

        # -- account ------------------------------------------------------

        box = layout.box()
        header = box.row()
        header.label(text="Account", icon="USER")

        state = session.state

        if state.signed_in:
            row = box.row()
            row.label(text=f"Signed in as {state.display_name}", icon="CHECKMARK")
            row.operator("projectflow.sign_out", text="Sign Out", icon="PANEL_CLOSE")
            box.label(text=f"Token stored in: {session.storage_backend()}", icon="LOCKED")
        else:
            if state.checking:
                box.label(text="Checking your token…", icon="SORTTIME")
            else:
                box.label(text="Not signed in", icon="INFO")

            row = box.row()
            row.scale_y = 1.2
            row.operator("projectflow.sign_in", text="Sign In", icon="KEYINGSET")
            box.operator(
                "projectflow.paste_token", text="Paste an Access Token", icon="PASTEDOWN"
            )

        if state.error:
            err = box.box()
            err.alert = True
            err.label(text=state.error, icon="ERROR")

        # -- asset library -------------------------------------------------

        box = layout.box()
        box.label(text="Asset Library", icon="ASSET_MANAGER")

        col = box.column()
        col.use_property_split = True
        col.prop(self, "auto_register_library")
        col.prop(self, "generate_previews")

        asset_cache = self.get_cache()
        if os.path.isdir(asset_cache.files_dir):
            size = cache.format_size(asset_cache.size_bytes())
            row = box.row()
            row.label(text=f"Cache size: {size}", icon="FILE_FOLDER")
            row.operator("projectflow.clear_cache", text="Clear", icon="TRASH")


def get_preferences(context=None) -> ProjectFlowPreferences:
    """Fetches this add-on's preferences.

    ``__package__`` is the extension id at runtime, which is what Blender keys
    the preferences dictionary on.
    """
    context = context or bpy.context
    return context.preferences.addons[__package__].preferences


def register() -> None:
    bpy.utils.register_class(ProjectFlowPreferences)


def unregister() -> None:
    bpy.utils.unregister_class(ProjectFlowPreferences)
