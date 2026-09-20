"""Builds .blend wrappers for downloaded assets. Runs in a background Blender.

Blender's Asset Browser indexes .blend files, not .glb or .fbx, so every
downloaded model needs a .blend containing an asset-marked datablock.

This script is **not** imported by the add-on. It is executed by a separate
Blender process:

    blender --background --factory-startup --python builder.py -- <job.json>

Doing it out-of-process is the whole point. Importing models into the user's
open scene to mark and re-export them would pollute the file they are working
in, dirty the undo stack, and lose data if anything failed halfway. A separate
process cannot touch their session at all.

Startup costs a few seconds, so the add-on batches every pending asset into one
invocation rather than paying it per file.

Progress is reported as single-line JSON on stdout prefixed with ``@PF@`` so the
parent can parse it without tripping over Blender's own banner output.
"""

from __future__ import annotations

import json
import os
import sys
import traceback

import bpy

MARKER = "@PF@"


def emit(kind: str, **fields) -> None:
    """Writes one progress record the parent process can parse."""
    payload = {"kind": kind}
    payload.update(fields)
    print(f"{MARKER}{json.dumps(payload)}", flush=True)


def reset_file() -> None:
    """Empties the scene so each asset is built in isolation.

    Without this, objects from the previous asset stay in the file and get
    pulled in as dependencies of the next one.
    """
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_model(path: str) -> list:
    """Imports a model and returns the objects it created.

    Diffing the object list around the import is the reliable way to know what
    arrived — the importers do not return the objects they made, and some
    formats create empties, armatures and lights alongside the meshes.
    """
    before = set(bpy.data.objects)

    ext = os.path.splitext(path)[1].lower()
    if ext in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj":
        # Renamed in Blender 4.x; the old operator is gone rather than deprecated.
        bpy.ops.wm.obj_import(filepath=path)
    else:
        raise ValueError(f"Unsupported format: {ext}")

    return [obj for obj in bpy.data.objects if obj not in before]


def apply_metadata(datablock, job: dict) -> None:
    """Copies the workspace's metadata onto the asset."""
    datablock.asset_mark()
    asset_data = datablock.asset_data

    catalog_id = job.get("catalog_id")
    if catalog_id:
        asset_data.catalog_id = catalog_id

    author = job.get("author")
    if author:
        asset_data.author = author

    description = job.get("description")
    if description:
        # The UI field is single-line; collapse anything multi-line into it.
        asset_data.description = " ".join(description.split())[:1024]

    for tag in job.get("tags") or []:
        name = str(tag).strip()
        if name:
            try:
                asset_data.tags.new(name)
            except Exception:  # noqa: BLE001 - duplicate tag names raise; harmless
                pass


def generate_preview(datablock) -> bool:
    """Attempts a thumbnail. Best-effort.

    Preview rendering wants a draw context, which a ``--background`` Blender
    does not reliably have. When it fails the asset still works — it just shows
    a generic icon in the browser — so this never fails the build.
    """
    try:
        with bpy.context.temp_override(id=datablock):
            bpy.ops.ed.lib_id_generate_preview()
        return True
    except Exception:  # noqa: BLE001
        return False


def build_one(job: dict) -> dict:
    """Builds a single .blend. Returns a result record for the parent."""
    asset_id = job.get("asset_id", "")
    source = job["source"]
    destination = job["blend_path"]
    name = job.get("name") or os.path.splitext(os.path.basename(source))[0]

    reset_file()

    created = import_model(source)
    if not created:
        raise RuntimeError("The importer produced no objects")

    meshes = [obj for obj in created if obj.type == "MESH"]

    if len(created) == 1:
        # A single object becomes an object asset, which drags in directly.
        target = created[0]
        target.name = name
        datablock = target
        to_write = {target}
    else:
        # Several objects become a collection asset, so the pieces stay together
        # and arrive as one instance rather than a loose pile.
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
        for obj in created:
            for parent in list(obj.users_collection):
                parent.objects.unlink(obj)
            collection.objects.link(obj)
        datablock = collection
        to_write = {collection}

    apply_metadata(datablock, job)

    has_preview = generate_preview(datablock) if job.get("previews", True) else False

    os.makedirs(os.path.dirname(destination), exist_ok=True)

    # fake_user keeps the datablock alive in a file with no scene referencing it.
    # Without it the asset is written and then garbage collected on next load.
    bpy.data.libraries.write(destination, to_write, fake_user=True, compress=True)

    return {
        "asset_id": asset_id,
        "blend_path": destination,
        "objects": len(created),
        "meshes": len(meshes),
        "preview": has_preview,
        "kind": "collection" if len(created) > 1 else "object",
    }


def main() -> int:
    argv = sys.argv
    if "--" not in argv:
        emit("fatal", error="No job file was passed")
        return 2

    job_file = argv[argv.index("--") + 1]

    try:
        with open(job_file, "r", encoding="utf-8") as handle:
            jobs = json.load(handle)
    except (OSError, ValueError) as exc:
        emit("fatal", error=f"Could not read the job file: {exc}")
        return 2

    total = len(jobs)
    emit("start", total=total)

    succeeded = 0
    failed = 0

    for index, job in enumerate(jobs, start=1):
        name = job.get("name") or os.path.basename(job.get("source", ""))
        emit("progress", index=index, total=total, name=name)

        try:
            result = build_one(job)
            succeeded += 1
            emit("built", **result)
        except Exception as exc:  # noqa: BLE001 - one bad model must not stop the batch
            failed += 1
            emit(
                "failed",
                asset_id=job.get("asset_id", ""),
                name=name,
                error=str(exc),
                trace=traceback.format_exc(limit=3),
            )

    emit("done", succeeded=succeeded, failed=failed, total=total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
