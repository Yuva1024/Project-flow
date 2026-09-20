"""Saving and removing custom export presets.

Custom presets live as JSON in Blender's config directory rather than in
``AddonPreferences``, so they survive a reinstall of the extension and can be
copied between machines by hand.
"""

from __future__ import annotations

import bpy
from bpy.props import StringProperty
from bpy.types import Operator

from . import export_settings


class PROJECTFLOW_OT_save_export_preset(Operator):
    bl_idname = "projectflow.save_export_preset"
    bl_label = "Save Export Preset"
    bl_description = "Save the current export options under a name you can pick later"
    bl_options = {"REGISTER", "INTERNAL"}

    name: StringProperty(
        name="Preset Name",
        description="Shown in the preset dropdown",
        default="",
    )

    def invoke(self, context, event):
        if not self.name:
            settings = context.window_manager.projectflow_export
            self.name = f"My {settings.file_format} Preset"
        return context.window_manager.invoke_props_dialog(self, width=300)

    def draw(self, context):
        self.layout.prop(self, "name")

    def execute(self, context):
        name = (self.name or "").strip()
        if not name:
            self.report({"ERROR"}, "Give the preset a name.")
            return {"CANCELLED"}

        # Colons separate the key from the name in the enum identifier, so a
        # name containing one would produce a preset that cannot be selected.
        if ":" in name:
            self.report({"ERROR"}, "Preset names cannot contain a colon.")
            return {"CANCELLED"}

        if name in export_settings.BUILTIN_PRESETS:
            self.report({"ERROR"}, "That name is taken by a built-in preset.")
            return {"CANCELLED"}

        settings = context.window_manager.projectflow_export
        export_settings.save_custom_preset(name, settings.as_dict())

        # Select the preset that was just saved. Assigning to the enum re-runs
        # apply_preset, which is harmless here since the values already match.
        try:
            settings.preset = f"CUSTOM:{name}"
        except TypeError:
            pass

        self.report({"INFO"}, f"Saved preset '{name}'.")
        return {"FINISHED"}


class PROJECTFLOW_OT_delete_export_preset(Operator):
    bl_idname = "projectflow.delete_export_preset"
    bl_label = "Delete Export Preset"
    bl_description = "Remove the selected custom preset"
    bl_options = {"REGISTER", "INTERNAL"}

    @classmethod
    def poll(cls, context):
        settings = getattr(context.window_manager, "projectflow_export", None)
        # Built-ins are not removable, so the button only lights up for a
        # user-saved preset.
        return settings is not None and settings.preset.startswith("CUSTOM:")

    def invoke(self, context, event):
        return context.window_manager.invoke_confirm(self, event)

    def execute(self, context):
        settings = context.window_manager.projectflow_export
        key = settings.preset

        if not key.startswith("CUSTOM:"):
            self.report({"ERROR"}, "Built-in presets cannot be deleted.")
            return {"CANCELLED"}

        name = key[len("CUSTOM:"):]
        if not export_settings.delete_custom_preset(name):
            self.report({"ERROR"}, f"No preset named '{name}'.")
            return {"CANCELLED"}

        try:
            settings.preset = "CUSTOM"
        except TypeError:
            pass

        self.report({"INFO"}, f"Deleted preset '{name}'.")
        return {"FINISHED"}


classes = (
    PROJECTFLOW_OT_save_export_preset,
    PROJECTFLOW_OT_delete_export_preset,
)


def register() -> None:
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister() -> None:
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
