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
            "use_armature_deform_only": True,
            "object_types": ["MESH", "ARMATURE", "EMPTY", "OTHER"],
            "export_colors": True,
            "colors_type": "SRGB",
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
            "gltf_export_cameras": False,
            "gltf_export_lights": False,
            # Unreal's glTF import does not read Draco.
            "gltf_draco": False,
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

    # -- Include ---------------------------------------------------------

    use_visible: BoolProperty(
        name="Visible Objects Only",
        description="Skip objects hidden in the viewport",
        default=False,
    )

    use_active_collection: BoolProperty(
        name="Active Collection Only",
        description="Export only objects in the active collection",
        default=False,
    )

    # ENUM_FLAG makes this a multi-select, matching Blender's own exporter.
    # Lights and cameras are off by default: a game asset rarely wants them, and
    # Unreal imports stray lights as actors you then have to delete.
    object_types: EnumProperty(
        name="Object Types",
        description="Which object types to include",
        items=[
            ("EMPTY", "Empty", "Empties, including collection instances"),
            ("CAMERA", "Camera", ""),
            ("LIGHT", "Light", ""),
            ("ARMATURE", "Armature", "Required for skeletal meshes"),
            ("MESH", "Mesh", ""),
            ("OTHER", "Other", "Curves, surfaces and metaballs, converted to mesh"),
        ],
        options={"ENUM_FLAG"},
        default={"MESH", "ARMATURE", "EMPTY", "OTHER"},
    )

    use_custom_props: BoolProperty(
        name="Custom Properties",
        description="Export custom properties. Unreal reads these as asset metadata",
        default=False,
    )

    # -- Transform -------------------------------------------------------

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

    apply_unit_scale: BoolProperty(
        name="Apply Unit Scale",
        description="Take Blender's unit settings into account",
        default=True,
    )

    apply_scale_options: EnumProperty(
        name="Apply Scalings",
        description="How to apply custom and unit scaling",
        items=[
            ("FBX_SCALE_NONE", "All Local", "Apply custom scaling and unit scaling to each object"),
            ("FBX_SCALE_UNITS", "FBX Units Scale", "Apply custom scaling to each object, units via the FBX scale"),
            ("FBX_SCALE_CUSTOM", "FBX Custom Scale", "Apply unit scaling to each object, custom via the FBX scale"),
            ("FBX_SCALE_ALL", "FBX All", "Apply both scalings via the FBX scale"),
        ],
        default="FBX_SCALE_NONE",
    )

    use_space_transform: BoolProperty(
        name="Use Space Transform",
        description="Apply global space transform to the object rotations",
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

    # -- Geometry --------------------------------------------------------

    mesh_smooth_type: EnumProperty(
        name="Smoothing",
        description=(
            "Smoothing data to write. Unreal warns on every import when this is "
            "Normals Only and falls back to flat shading"
        ),
        items=[
            ("OFF", "Normals Only", "No smoothing groups — Unreal will warn"),
            ("FACE", "Face", "Face smoothing groups. The usual choice for Unreal"),
            ("EDGE", "Edge", "Edge smoothing groups"),
        ],
        default="FACE",
    )

    use_subsurf: BoolProperty(
        name="Export Subdivision Surface",
        description="Write the subdivision level as FBX subdivision data instead of applying it",
        default=False,
    )

    use_mesh_edges: BoolProperty(
        name="Loose Edges",
        description="Export edges that belong to no face, as two-vertex polygons",
        default=False,
    )

    export_colors: BoolProperty(
        name="Vertex Colors",
        description="Export vertex colour layers",
        default=True,
    )

    colors_type: EnumProperty(
        name="Vertex Color Space",
        description="Colour space to write vertex colours in",
        items=[
            ("NONE", "None", "Do not export colour attributes"),
            ("SRGB", "sRGB", "Export in sRGB. What Unreal expects"),
            ("LINEAR", "Linear", "Export in linear colour space"),
        ],
        default="SRGB",
    )

    prioritize_active_color: BoolProperty(
        name="Prioritize Active Color",
        description="Write the active colour attribute first, so importers pick it up as the main one",
        default=False,
    )

    # -- Armature --------------------------------------------------------

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

    use_armature_deform_only: BoolProperty(
        name="Only Deform Bones",
        description=(
            "Skip control and helper bones. Unreal only needs deform bones, and "
            "the rest become junk joints in the imported skeleton"
        ),
        default=False,
    )

    armature_nodetype: EnumProperty(
        name="Armature FBXNode Type",
        description="Node type for the armature itself. Leave on Null unless an importer complains",
        items=[
            ("NULL", "Null", "Plain node, the usual choice"),
            ("ROOT", "Root", "Root node"),
            ("LIMBNODE", "LimbNode", "Limb node"),
        ],
        default="NULL",
    )

    add_leaf_bones: BoolProperty(
        name="Add Leaf Bones",
        description=(
            "Append an extra bone at the end of each chain. Unreal imports these "
            "as real bones and they clutter the skeleton"
        ),
        default=False,
    )

    # -- Animation -------------------------------------------------------

    bake_anim_use_all_bones: BoolProperty(
        name="Key All Bones",
        description="Write keyframes for all bones, so the animation is fully defined",
        default=True,
    )

    bake_anim_use_nla_strips: BoolProperty(
        name="NLA Strips",
        description="Export each non-muted NLA strip as its own animation take",
        default=True,
    )

    bake_anim_use_all_actions: BoolProperty(
        name="All Actions",
        description="Export every action as a separate take. Turn off to export only the active one",
        default=True,
    )

    bake_anim_force_startend_keying: BoolProperty(
        name="Force Start/End Keying",
        description="Always key the first and last frame. Some importers need this",
        default=True,
    )

    bake_anim_step: FloatProperty(
        name="Sampling Rate",
        description="How often to evaluate the animation, in frames",
        default=1.0,
        min=0.01,
        max=100.0,
    )

    bake_anim_simplify_factor: FloatProperty(
        name="Simplify",
        description="How much to simplify baked curves. 0 disables simplification",
        default=1.0,
        min=0.0,
        max=100.0,
    )

    # -- Textures --------------------------------------------------------

    embed_textures: BoolProperty(
        name="Embed Textures",
        description="Pack textures into the FBX so the file stands alone",
        default=True,
    )

    path_mode: EnumProperty(
        name="Path Mode",
        description="How to write texture file paths",
        items=[
            ("AUTO", "Auto", "Relative for files under the blend, absolute otherwise"),
            ("ABSOLUTE", "Absolute", "Full paths"),
            ("RELATIVE", "Relative", "Paths relative to the exported file"),
            ("MATCH", "Match", "Match the blend file's own path style"),
            ("STRIP", "Strip Path", "Filename only"),
            ("COPY", "Copy", "Copy textures next to the export. Required to embed"),
        ],
        default="COPY",
    )

    # -- glTF specific ---------------------------------------------------

    gltf_yup: BoolProperty(
        name="+Y Up",
        description="Convert to Y-up, which the glTF specification requires",
        default=True,
    )

    gltf_export_cameras: BoolProperty(
        name="Cameras",
        description="Include cameras in the glTF",
        default=False,
    )

    gltf_export_lights: BoolProperty(
        name="Punctual Lights",
        description="Include lights via KHR_lights_punctual",
        default=False,
    )

    gltf_export_extras: BoolProperty(
        name="Custom Properties",
        description="Write custom properties into the glTF extras field",
        default=False,
    )

    gltf_export_skins: BoolProperty(
        name="Skinning",
        description="Include skinning data for rigged meshes",
        default=True,
    )

    gltf_export_morph: BoolProperty(
        name="Shape Keys",
        description="Include shape keys as morph targets",
        default=True,
    )

    gltf_export_texcoords: BoolProperty(
        name="UVs",
        description="Include UV coordinates",
        default=True,
    )

    gltf_export_normals: BoolProperty(
        name="Normals",
        description="Include vertex normals",
        default=True,
    )

    gltf_image_format: EnumProperty(
        name="Images",
        description="How to write textures",
        items=[
            ("AUTO", "Automatic", "Keep PNG for images with alpha, JPEG otherwise"),
            ("JPEG", "JPEG", "Smaller files, no alpha channel"),
            ("WEBP", "WebP", "Smallest files, not supported everywhere"),
            ("NONE", "None", "Leave textures out entirely"),
        ],
        default="AUTO",
    )

    gltf_draco: BoolProperty(
        name="Draco Compression",
        description=(
            "Compress geometry. Much smaller files, but not every importer "
            "supports it — Unreal's glTF import does not"
        ),
        default=False,
    )

    # -- attachment behaviour --------------------------------------------

    also_attach_preview: BoolProperty(
        name="Also Attach GLB Preview",
        description=(
            "Upload a second, small GLB alongside the main file. The website can "
            "only preview glTF, so this is what makes an FBX attachment still "
            "show a 3D preview on the card"
        ),
        default=True,
    )

    # -- UI section toggles ----------------------------------------------
    # There are too many options for one flat list, so the dialog groups them
    # the way Blender's own exporter does and remembers what you had open.

    show_include: BoolProperty(name="Include", default=True)
    show_transform: BoolProperty(name="Transform", default=False)
    show_geometry: BoolProperty(name="Geometry", default=False)
    show_armature: BoolProperty(name="Armature", default=False)
    show_animation: BoolProperty(name="Animation", default=False)

    def as_dict(self) -> Dict[str, Any]:
        """Plain-dict snapshot, for saving as a custom preset."""
        keys = [
            "file_format", "selected_only", "use_visible", "use_active_collection",
            "use_custom_props", "apply_modifiers", "global_scale",
            "use_triangles", "use_tangents", "export_materials", "export_animations",
            "axis_forward", "axis_up", "apply_unit_scale", "apply_scale_options",
            "use_space_transform", "bake_space_transform",
            "mesh_smooth_type", "use_subsurf", "use_mesh_edges", "export_colors",
            "colors_type", "prioritize_active_color",
            "primary_bone_axis", "secondary_bone_axis", "use_armature_deform_only",
            "armature_nodetype", "add_leaf_bones",
            "bake_anim_use_all_bones", "bake_anim_use_nla_strips",
            "bake_anim_use_all_actions", "bake_anim_force_startend_keying",
            "bake_anim_step", "bake_anim_simplify_factor",
            "embed_textures", "path_mode",
            "gltf_yup", "gltf_export_cameras", "gltf_export_lights",
            "gltf_export_extras", "gltf_export_skins", "gltf_export_morph",
            "gltf_export_texcoords", "gltf_export_normals", "gltf_image_format",
            "gltf_draco",
            "also_attach_preview",
        ]
        values = {key: getattr(self, key) for key in keys}
        # object_types is an ENUM_FLAG, which comes back as a set. JSON has no
        # set type, so presets store it as a sorted list.
        values["object_types"] = sorted(self.object_types)
        return values

    def apply_settings(self, values: Dict[str, Any]) -> None:
        for key, value in values.items():
            if hasattr(self, key):
                try:
                    # ENUM_FLAG properties need a set; presets store a list.
                    if key == "object_types" and isinstance(value, (list, tuple)):
                        value = set(value)
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
            # Include
            "use_selection": settings.selected_only,
            "use_visible": settings.use_visible,
            "use_active_collection": settings.use_active_collection,
            "object_types": set(settings.object_types),
            "use_custom_props": settings.use_custom_props,
            # Transform
            "global_scale": settings.global_scale,
            "apply_unit_scale": settings.apply_unit_scale,
            "apply_scale_options": settings.apply_scale_options,
            "use_space_transform": settings.use_space_transform,
            "bake_space_transform": settings.bake_space_transform,
            "axis_forward": settings.axis_forward,
            "axis_up": settings.axis_up,
            # Geometry
            "use_mesh_modifiers": settings.apply_modifiers,
            "mesh_smooth_type": settings.mesh_smooth_type,
            "use_subsurf": settings.use_subsurf,
            "use_mesh_edges": settings.use_mesh_edges,
            "use_tspace": settings.use_tangents,
            "use_triangles": settings.use_triangles,
            "colors_type": settings.colors_type if settings.export_colors else "NONE",
            "prioritize_active_color": settings.prioritize_active_color,
            # Armature
            "primary_bone_axis": settings.primary_bone_axis,
            "secondary_bone_axis": settings.secondary_bone_axis,
            "use_armature_deform_only": settings.use_armature_deform_only,
            "armature_nodetype": settings.armature_nodetype,
            "add_leaf_bones": settings.add_leaf_bones,
            # Animation
            "bake_anim": settings.export_animations,
            "bake_anim_use_all_bones": settings.bake_anim_use_all_bones,
            "bake_anim_use_nla_strips": settings.bake_anim_use_nla_strips,
            "bake_anim_use_all_actions": settings.bake_anim_use_all_actions,
            "bake_anim_force_startend_keying": settings.bake_anim_force_startend_keying,
            "bake_anim_step": settings.bake_anim_step,
            "bake_anim_simplify_factor": settings.bake_anim_simplify_factor,
            # Textures. Embedding requires COPY; anything else silently drops it.
            "path_mode": "COPY" if settings.embed_textures else settings.path_mode,
            "embed_textures": settings.embed_textures,
        }
        bpy.ops.export_scene.fbx(**_supported_kwargs(bpy.ops.export_scene.fbx, kwargs))

    elif fmt in {"GLB", "GLTF_SEPARATE"}:
        kwargs = {
            "filepath": filepath,
            "export_format": fmt,
            # Include
            "use_selection": settings.selected_only,
            "use_visible": settings.use_visible,
            "use_active_collection": settings.use_active_collection,
            "export_cameras": settings.gltf_export_cameras,
            "export_lights": settings.gltf_export_lights,
            "export_extras": settings.gltf_export_extras,
            # Transform / geometry
            "export_yup": settings.gltf_yup,
            "export_apply": settings.apply_modifiers,
            "export_texcoords": settings.gltf_export_texcoords,
            "export_normals": settings.gltf_export_normals,
            "export_tangents": settings.use_tangents,
            "export_colors": settings.export_colors,
            "export_materials": "EXPORT" if settings.export_materials else "NONE",
            "export_image_format": settings.gltf_image_format,
            "export_draco_mesh_compression_enable": settings.gltf_draco,
            # Animation / rigging
            "export_skins": settings.gltf_export_skins,
            "export_morph": settings.gltf_export_morph,
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
