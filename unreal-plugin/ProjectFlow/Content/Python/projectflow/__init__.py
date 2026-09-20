"""ProjectFlow for Unreal Engine.

Exposes a ProjectFlow workspace inside the editor: the asset library and the
board/card tree become menus, and any 3D file can be imported into the Content
Browser with one click.

Imports are stamped with the content hash they came from, which is what makes
"this asset has a newer version, reimport it in place" work without losing
material assignments or references.
"""

from . import actions, api, config, importer, menus  # noqa: F401

__version__ = "0.1.0"


def startup() -> None:
    """Builds the menu. Called from init_unreal.py when the plugin loads."""
    menus.rebuild()


def shutdown() -> None:
    menus.unregister()
