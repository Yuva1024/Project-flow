"""Export options and presets for attaching work to a card.

Two things drive the design here.

**Unreal and the web viewer want different files.** Unreal imports FBX natively
and handles it best for game assets; the ProjectFlow web card previews with
``<model-viewer>``, which reads glTF only and explicitly refuses FBX. So an FBX
attachment imports cleanly and previews as nothing. The presets below let you
pick per job, and ``also_attach_preview`` covers the case where you want both —
the FBX for the engine, a GLB so the card still shows the model.

**Exporter arguments drift between Blender versions.** Rather than pass a fixed
keyword list and break on an upgrade, every call is filtered against the
operator's own RNA first. An option Blender no longer knows about is dropped
with a warning instead of raising.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List

import bpy
from bpy.props import BoolProperty, EnumProperty, FloatProperty, StringProperty
from bpy.types import PropertyGroup

PRESETS_FILENAME = "projectflow_export_presets.json"


# -- built-in presets ------------------------------------------------------
#
# The Unreal values are not arbitrary. Each one corrects a specific, well-known
# failure when importing Blender output into UE:
#
#   mesh_smooth_type FACE  - without smoothing groups UE warns on every import
#                            and falls back to flat shading.
#   use_tspace             - bakes tangents, without which normal maps light
#                            incorrectly in UE.
#   add_leaf_bones False   - UE treats Blender's leaf bones as real bones and
#                            they pollute the skeleton.
#   axis -Z forward / Y up - the FBX standard axes UE expects; changing them is
#                            what produces the classic 90-degree rotation.
#   embed_textures         - makes the FBX self-contained so the import does not
#                            depend on paths from someone else's machine.

BUILTIN_PRESETS: Dict[str, Dict[str, Any]] = {
    "UNREAL_FBX": {
        "label": "Unreal Engine (FBX)",
        "description": "FBX tuned for Unreal. Best import fidelity, no web preview",
        "settings": {
            "file_format": "FBX",
            "apply_modifiers": True,
            "selected_only": True,
            "global_scale": 1.0,
            "apply_unit_scale": True,
            "bake_space_transform": False,
            "axis_forward": "-Z",
            "axis_up": "Y",
            "mesh_smooth_type": "FACE",
            "use_tangents": True,
            "use_triangles": True,
            "add_leaf_bones": False,
            "primary_bone_axis": "Y",
            "secondary_bone_axis": "X",
            "export_animations": True,
            "embed_textures": True,
            "export_materials": True,
            "also_attach_preview": True,
        },
    },
    "UNREAL_GLTF": {
        "label": "Unreal Engine (glTF)",
        "description": "glTF for UE5 Interchange. Previews on the card as well",
        "settings": {
            "file_format": "GLB",
            "apply_modifiers": True,
            "selected_only": True,
            "global_scale": 1.0,
            "use_tangents": True,
            "use_triangles": True,
            "export_animations": True,
            "export_materials": True,
            "gltf_yup": True,
            "also_attach_preview": False,
        },
    },
    "PREVIEW_GLB": {
        "label": "Preview / Review (GLB)",
        "description": "Small self-contained GLB. Renders on the card in the browser",
        "settings": {
            "file_format": "GLB",
            "apply_modifiers": True,
            "selected_only": True,
            "global_scale": 1.0,
            "use_tangents": False,
            "use_triangles": True,
            "export_animations": False,
            "export_materials": True,
            "gltf_yup": True,
            "also_attach_preview": False,
        },
    },
    "SOURCE_FBX": {
        "label": "Source Hand-off (FBX)",
        "description": "Unmodified geometry with modifiers left intact, for another artist",
        "settings": {
            "file_format": "FBX",
            "apply_modifiers": False,
            "selected_only": True,
            "global_scale": 1.0,
            "apply_unit_scale": True,
            "bake_space_transform": False,
            "axis_forward": "-Z",
            "axis_up": "Y",
            "mesh_smooth_type": "EDGE",
            "use_tangents": False,
            "use_triangles": False,
            "add_leaf_bones": True,
            "export_animations": True,
            "embed_textures": False,
            "export_materials": True,
            "also_attach_preview": True,
        },
    },
}


def preset_items(self, context):
    """Built-in presets plus any the user saved. Cached at module scope."""
    return _preset_items_cache


_preset_items_cache: List[tuple] = []


def rebuild_preset_items() -> None:
    global _preset_items_cache
    items = [
        (key, data["label"], data["description"], index)
        for index, (key, data) in enumerate(BUILTIN_PRESETS.items())
    ]
    offset = len(items)
    for index, name in enumerate(sorted(load_custom_presets().keys())):
        items.append((f"CUSTOM:{name}", name, "Your saved preset", offset + index))
    items.append(("CUSTOM", "Custom…", "Set every option by hand", len(items)))
    _preset_items_cache = items


# -- custom preset storage -------------------------------------------------


def _presets_path() -> str:
    config_dir = bpy.utils.user_resource("CONFIG", create=True)
    return os.path.join(config_dir, PRESETS_FILENAME)


def load_custom_presets() -> Dict[str, Dict[str, Any]]:
    path = _presets_path()
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_custom_preset(name: str, settings: Dict[str, Any]) -> None:
    presets = load_custom_presets()
    presets[name] = settings
    with open(_presets_path(), "w", encoding="utf-8") as handle:
        json.dump(presets, handle, indent=2)
    rebuild_preset_items()


def delete_custom_preset(name: str) -> bool:
    presets = load_custom_presets()
    if name not in presets:
        return False
    del presets[name]
    with open(_presets_path(), "w", encoding="utf-8") as handle:
        json.dump(presets, handle, indent=2)
    rebuild_preset_items()
    return True


# -- the settings themselves ----------------------------------------------


class ProjectFlowExportSettings(PropertyGroup):
    """Mirrors the options Blender's own exporters expose, filtered to the ones
    that actually change how an asset lands in an engine."""

    preset: EnumProperty(
        name="Preset",
        description="Start from a known-good set of options",
        items=preset_items,
        update=lambda self, context: self.apply_preset(),
    )

    file_format: EnumProperty(
        name="Format",
        description="File format to export",
        items=[
            ("GLB", "glTF Binary (.glb)", "Self-contained glTF. Previews on the card"),
            ("GLTF_SEPARATE", "glTF Separate (.gltf)", "glTF with external textures"),
            ("FBX", "FBX (.fbx)", "Best for Unreal. Does not preview on the card"),
            ("OBJ", "Wavefront (.obj)", "Geometry only, no rig or animation"),
        ],
        default="GLB",
    )

    selected_only: BoolProperty(
        name="Selected Objects Only",
        description="Export just the selection rather than the whole scene",
        default=True,
    )

    apply_modifiers: BoolProperty(
        name="Apply Modifiers",
        description="Evaluate modifiers before export. Turn off to hand over editable source",
        default=True,
    )

    global_scale: FloatProperty(
        name="Scale",
        description=(
            "Multiplier applied on export. Leave at 1.0 for Unreal — FBX carries "
            "unit information and Unreal converts metres to centimetres itself"
        ),
        default=1.0,
        min=0.001,
        max=1000.0,
    )

    use_triangles: BoolProperty(
        name="Triangulate",
        description="Convert faces to triangles. Engines do this on import anyway; "
        "doing it here means you see exactly what the engine gets",
        default=True,
    )

    use_tangents: BoolProperty(
        name="Tangent Space",
        description="Export tangents. Required for normal maps to light correctly",
        default=True,
    )

    export_materials: BoolProperty(
        name="Materials",
        description="Include material definitions",
        default=True,
    )

    export_animations: BoolProperty(
        name="Animation",
        description="Include actions and armature animation",
        default=True,
    )

    # -- FBX specific --------------------------------------------------

    axis_forward: EnumProperty(
        name="Forward Axis",
        description="Forward axis in the exported file. -Z is the FBX standard Unreal expects",
        items=[
            ("X", "X", ""), ("Y", "Y", ""), ("Z", "Z", ""),
            ("-X", "-X", ""), ("-Y", "-Y", ""), ("-Z", "-Z", ""),
        ],
        default="-Z",
    )

    axis_up: EnumProperty(
        name="Up Axis",
        description="Up axis in the exported file. Y is the FBX standard Unreal expects",
        items=[
            ("X", "X", ""), ("Y", "Y", ""), ("Z", "Z", ""),
            ("-X", "-X", ""), ("-Y", "-Y", ""), ("-Z", "-Z", ""),
        ],
        default="Y",
    )

    mesh_smooth_type: EnumProperty(
        name="Smoothing",
        description=(
            "Smoothing data to write. Unreal warns on every import when this is "
            "Off and falls back to flat shading"
        ),
        items=[
            ("OFF", "Normals Only", "No smoothing groups — Unreal will warn"),
            ("FACE", "Face", "Face smoothing groups. The usual choice for Unreal"),
            ("EDGE", "Edge", "Edge smoothing groups"),
        ],
        default="FACE",
    )

    apply_unit_scale: BoolProperty(
        name="Apply Unit Scale",
        description="Take Blender's unit settings into account",
        default=True,
    )

    bake_space_transform: BoolProperty(
        name="Apply Transform",
        description=(
            "Bake object transforms into the geometry. Can fix axis problems but "
            "is known to break animation and instancing — leave off unless you "
            "have a specific reason"
        ),
        default=False,
    )

    add_leaf_bones: BoolProperty(
        name="Add Leaf Bones",
        description=(
            "Append an extra bone at the end of each chain. Unreal imports these "
            "as real bones and they clutter the skeleton"
        ),
        default=False,
    )

    primary_bone_axis: EnumProperty(
        name="Primary Bone Axis",
        items=[("X", "X", ""), ("Y", "Y", ""), ("Z", "Z", ""),
               ("-X", "-X", ""), ("-Y", "-Y", ""), ("-Z", "-Z", "")],
        default="Y",
    )

    secondary_bone_axis: EnumProperty(
        name="Secondary Bone Axis",
        items=[("X", "X", ""), ("Y", "Y", ""), ("Z", "Z", ""),
               ("-X", "-X", ""), ("-Y", "-Y", ""), ("-Z", "-Z", "")],
        default="X",
    )

    embed_textures: BoolProperty(
        name="Embed Textures",
        description="Pack textures into the FBX so the file stands alone",
        default=True,
    )

    # -- glTF specific -------------------------------------------------

    gltf_yup: BoolProperty(
        name="+Y Up",
        description="Convert to Y-up, which the glTF specification requires",
        default=True,
    )

    # -- attachment behaviour -------------------------------------------

    also_attach_preview: BoolProperty(
        name="Also Attach GLB Preview",
        description=(
            "Upload a second, small GLB alongside the main file. The website can "
            "only preview glTF, so this is what makes an FBX attachment still "
            "show a 3D preview on the card"
        ),
        default=True,
    )

    def as_dict(self) -> Dict[str, Any]:
        """Plain-dict snapshot, for saving as a custom preset."""
        keys = [
            "file_format", "selected_only", "apply_modifiers", "global_scale",
            "use_triangles", "use_tangents", "export_materials", "export_animations",
            "axis_forward", "axis_up", "mesh_smooth_type", "apply_unit_scale",
            "bake_space_transform", "add_leaf_bones", "primary_bone_axis",
            "secondary_bone_axis", "embed_textures", "gltf_yup",
            "also_attach_preview",
        ]
        return {key: getattr(self, key) for key in keys}

    def apply_settings(self, values: Dict[str, Any]) -> None:
        for key, value in values.items():
            if hasattr(self, key):
                try:
                    setattr(self, key, value)
                except (TypeError, ValueError):
                    # A preset saved by an older version may hold a value this
                    # build no longer accepts; keep the current one.
                    pass

    def apply_preset(self) -> None:
        key = self.preset
        if key == "CUSTOM":
            return
        if key.startswith("CUSTOM:"):
            saved = load_custom_presets().get(key[len("CUSTOM:"):])
            if saved:
                self.apply_settings(saved)
            return
        preset = BUILTIN_PRESETS.get(key)
        if preset:
            self.apply_settings(preset["settings"])

    @property
    def extension(self) -> str:
        return {
            "GLB": ".glb",
            "GLTF_SEPARATE": ".gltf",
            "FBX": ".fbx",
            "OBJ": ".obj",
        }.get(self.file_format, ".glb")

    @property
    def previews_on_web(self) -> bool:
        """Whether the site's <model-viewer> can render this format."""
        return self.file_format in {"GLB", "GLTF_SEPARATE"}


# -- running the export ----------------------------------------------------


def _supported_kwargs(operator, kwargs: Dict[str, Any]) -> Dict[str, Any]:
    """Drops arguments this Blender build's exporter does not define.

    Exporter properties are renamed and retired between releases. Filtering
    against the operator's own RNA means a version change degrades to "that
    option was ignored" instead of raising mid-export.
    """
    try:
        known = set(operator.get_rna_type().properties.keys())
    except Exception:  # noqa: BLE001 - if introspection fails, try everything
        return kwargs

    supported = {key: value for key, value in kwargs.items() if key in known}
    dropped = set(kwargs) - set(supported)
    if dropped:
        print(f"[ProjectFlow] Exporter ignored unsupported options: {sorted(dropped)}")
    return supported


def export_with_settings(filepath: str, settings: ProjectFlowExportSettings) -> None:
    """Exports the current selection using ``settings``.

    Must run on the main thread — it reads scene data.
    """
    fmt = settings.file_format

    if fmt == "FBX":
        kwargs = {
            "filepath": filepath,
            "use_selection": settings.selected_only,
            "global_scale": settings.global_scale,
            "apply_unit_scale": settings.apply_unit_scale,
            "apply_scale_options": "FBX_SCALE_NONE",
            "bake_space_transform": settings.bake_space_transform,
            "object_types": {"MESH", "ARMATURE", "EMPTY", "OTHER"},
            "use_mesh_modifiers": settings.apply_modifiers,
            "mesh_smooth_type": settings.mesh_smooth_type,
            "use_tspace": settings.use_tangents,
            "use_triangles": settings.use_triangles,
            "add_leaf_bones": settings.add_leaf_bones,
            "primary_bone_axis": settings.primary_bone_axis,
            "secondary_bone_axis": settings.secondary_bone_axis,
            "bake_anim": settings.export_animations,
            "path_mode": "COPY" if settings.embed_textures else "AUTO",
            "embed_textures": settings.embed_textures,
            "axis_forward": settings.axis_forward,
            "axis_up": settings.axis_up,
        }
        bpy.ops.export_scene.fbx(**_supported_kwargs(bpy.ops.export_scene.fbx, kwargs))

    elif fmt in {"GLB", "GLTF_SEPARATE"}:
        kwargs = {
            "filepath": filepath,
            "export_format": fmt,
            "use_selection": settings.selected_only,
            "export_apply": settings.apply_modifiers,
            "export_yup": settings.gltf_yup,
            "export_tangents": settings.use_tangents,
            "export_materials": "EXPORT" if settings.export_materials else "NONE",
            "export_animations": settings.export_animations,
        }
        bpy.ops.export_scene.gltf(**_supported_kwargs(bpy.ops.export_scene.gltf, kwargs))

    elif fmt == "OBJ":
        kwargs = {
            "filepath": filepath,
            "export_selected_objects": settings.selected_only,
            "apply_modifiers": settings.apply_modifiers,
            "global_scale": settings.global_scale,
            "export_triangulated_mesh": settings.use_triangles,
            "export_materials": settings.export_materials,
            "forward_axis": settings.axis_forward.replace("-", "NEGATIVE_"),
            "up_axis": settings.axis_up.replace("-", "NEGATIVE_"),
        }
        bpy.ops.wm.obj_export(**_supported_kwargs(bpy.ops.wm.obj_export, kwargs))

    else:
        raise ValueError(f"Unsupported export format: {fmt}")


def export_preview_glb(filepath: str, selected_only: bool = True) -> None:
    """Writes a lightweight GLB purely so the card has something to preview.

    No tangents, no animation — this file is never imported into an engine, it
    only has to render in a browser.
    """
    kwargs = {
        "filepath": filepath,
        "export_format": "GLB",
        "use_selection": selected_only,
        "export_apply": True,
        "export_yup": True,
        "export_tangents": False,
        "export_animations": False,
        "export_materials": "EXPORT",
    }
    bpy.ops.export_scene.gltf(**_supported_kwargs(bpy.ops.export_scene.gltf, kwargs))


classes = (ProjectFlowExportSettings,)


def register() -> None:
    rebuild_preset_items()
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.WindowManager.projectflow_export = bpy.props.PointerProperty(
        type=ProjectFlowExportSettings
    )


def unregister() -> None:
    if hasattr(bpy.types.WindowManager, "projectflow_export"):
        del bpy.types.WindowManager.projectflow_export
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
