"""Tests for the parts of the add-on that do not need Blender.

``cache``, ``catalogs`` and the URL handling in ``api`` are pure Python by
design — they run on worker threads and must never touch ``bpy``. That makes
them testable with nothing but a stdlib interpreter, which matters because they
hold the two pieces of logic most likely to cause quiet damage:

* catalog UUIDs must be identical on every run, or each sync silently resets
  everyone's asset organisation;
* CAS keys must be parsed correctly, or the cache re-downloads everything or,
  worse, serves the wrong file.

Run with:  python -m unittest discover -s tests
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import tempfile
import unittest

_PACKAGE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "projectflow"
)


def _load(module_name: str):
    """Loads one add-on module directly from its file.

    Deliberately bypasses ``projectflow/__init__.py``, which imports ``bpy`` and
    therefore only works inside Blender. Loading these three by path doubles as
    an assertion of the design rule they exist under: anything that runs on a
    worker thread must import cleanly with no Blender present at all.
    """
    path = os.path.join(_PACKAGE_DIR, f"{module_name}.py")
    spec = importlib.util.spec_from_file_location(f"_pf_{module_name}", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


cache = _load("cache")
catalogs = _load("catalogs")

PUBLIC_R2 = "https://pub-ccb200eead884efbac751122dac022ed.r2.dev"
DIGEST = "a" * 64


class TestCasParsing(unittest.TestCase):
    def test_parses_content_addressed_url(self):
        url = f"{PUBLIC_R2}/files/{DIGEST}.glb"
        self.assertEqual(cache.parse_cas_url(url), (DIGEST, ".glb"))

    def test_extension_is_lowercased(self):
        url = f"{PUBLIC_R2}/files/{DIGEST}.GLB"
        parsed = cache.parse_cas_url(url)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed[1], ".glb")

    def test_rejects_legacy_urls(self):
        # Pre-CAS uploads live under attachments/ and have no hash to key on.
        self.assertIsNone(cache.parse_cas_url(f"{PUBLIC_R2}/attachments/model.glb"))

    def test_rejects_short_digest(self):
        self.assertIsNone(cache.parse_cas_url(f"{PUBLIC_R2}/files/abc123.glb"))

    def test_identical_content_shares_one_cache_key(self):
        # The whole point of CAS: two assets with different names but identical
        # bytes must resolve to one cached file.
        key_a = cache.cache_key(f"{PUBLIC_R2}/files/{DIGEST}.glb", "crate_a.glb")
        key_b = cache.cache_key(f"{PUBLIC_R2}/files/{DIGEST}.glb", "crate_b.glb")
        self.assertEqual(key_a, key_b)
        self.assertEqual(key_a, f"{DIGEST}.glb")

    def test_legacy_url_falls_back_to_basename(self):
        key = cache.cache_key(f"{PUBLIC_R2}/attachments/old-model.fbx", "old-model.fbx")
        self.assertEqual(key, "old-model.fbx")

    def test_query_string_is_stripped_from_fallback(self):
        key = cache.cache_key(f"{PUBLIC_R2}/attachments/m.fbx?token=x", "m.fbx")
        self.assertEqual(key, "m.fbx")


class TestAssetCache(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="pf-test-")
        self.cache = cache.AssetCache(self.root)
        self.cache.ensure_dirs()

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_zero_byte_file_counts_as_missing(self):
        # An interrupted download leaves an empty file. Treating it as present
        # would hand an empty file to the importer on every future sync.
        url = f"{PUBLIC_R2}/files/{DIGEST}.glb"
        path = self.cache.file_path(url, "x.glb")
        open(path, "wb").close()
        self.assertFalse(self.cache.has_file(url, "x.glb"))

        with open(path, "wb") as handle:
            handle.write(b"data")
        self.assertTrue(self.cache.has_file(url, "x.glb"))

    def test_prune_removes_only_unknown_blends(self):
        for asset_id in ("keep-1", "keep-2", "gone"):
            with open(self.cache.blend_path(asset_id), "wb") as handle:
                handle.write(b"x")

        removed = self.cache.prune_blends(["keep-1", "keep-2"])

        self.assertEqual(removed, 1)
        self.assertTrue(self.cache.has_blend("keep-1"))
        self.assertTrue(self.cache.has_blend("keep-2"))
        self.assertFalse(self.cache.has_blend("gone"))

    def test_clear_empties_cache_but_keeps_dirs(self):
        with open(self.cache.blend_path("a"), "wb") as handle:
            handle.write(b"x" * 100)
        self.assertGreater(self.cache.size_bytes(), 0)

        self.cache.clear()

        self.assertEqual(self.cache.size_bytes(), 0)
        self.assertTrue(os.path.isdir(self.cache.files_dir))


class TestCatalogs(unittest.TestCase):
    def setUp(self):
        self.folders = [
            {"id": "f-env", "name": "Environment", "parentId": None},
            {"id": "f-props", "name": "Props", "parentId": "f-env"},
            {"id": "f-crates", "name": "Crates", "parentId": "f-props"},
            {"id": "f-chars", "name": "Characters", "parentId": None},
        ]
        self.tree = catalogs.CatalogTree(self.folders)

    def test_uuid_is_stable_across_runs(self):
        # The single most important property here. A random UUID per sync would
        # orphan every asset's catalog assignment on the next run.
        first = catalogs.catalog_uuid("f-crates")
        second = catalogs.catalog_uuid("f-crates")
        rebuilt = catalogs.CatalogTree(self.folders).uuid_for("f-crates")

        self.assertEqual(first, second)
        self.assertEqual(first, rebuilt)

    def test_uuids_differ_between_folders(self):
        self.assertNotEqual(
            catalogs.catalog_uuid("f-crates"), catalogs.catalog_uuid("f-props")
        )

    def test_nested_path_is_built_from_ancestors(self):
        self.assertEqual(self.tree.path_for("f-crates"), "Environment/Props/Crates")
        self.assertEqual(self.tree.path_for("f-env"), "Environment")

    def test_unknown_folder_becomes_unfiled(self):
        self.assertEqual(self.tree.path_for(None), catalogs.UNFILED_NAME)
        self.assertEqual(self.tree.path_for("nope"), catalogs.UNFILED_NAME)
        self.assertEqual(self.tree.uuid_for(None), catalogs.UNFILED_UUID)

    def test_parent_cycle_does_not_hang(self):
        # The server rejects cycles on write, but a malformed tree must not
        # spin the client forever.
        cyclic = catalogs.CatalogTree(
            [
                {"id": "a", "name": "A", "parentId": "b"},
                {"id": "b", "name": "B", "parentId": "a"},
            ]
        )
        path = cyclic.path_for("a")
        self.assertTrue(path)
        self.assertLessEqual(len(path.split("/")), 2)

    def test_separators_in_names_are_neutralised(self):
        tree = catalogs.CatalogTree(
            [{"id": "x", "name": "Weapons/Guns: Heavy", "parentId": None}]
        )
        path = tree.path_for("x")
        # A slash would fabricate hierarchy; a colon breaks the file format.
        self.assertNotIn("/", path)
        self.assertNotIn(":", path)

    def test_catalog_file_is_valid_and_stable(self):
        directory = tempfile.mkdtemp(prefix="pf-cat-")
        try:
            path = os.path.join(directory, "blender_assets.cats.txt")

            catalogs.write_catalog_file(path, self.tree)
            with open(path, encoding="utf-8") as handle:
                first = handle.read()

            catalogs.write_catalog_file(path, catalogs.CatalogTree(self.folders))
            with open(path, encoding="utf-8") as handle:
                second = handle.read()

            self.assertEqual(first, second, "catalog file must be byte-stable")
            self.assertIn("VERSION 1", first)

            rows = [
                line
                for line in first.splitlines()
                if line and not line.startswith("#") and not line.startswith("VERSION")
            ]
            self.assertEqual(len(rows), len(self.folders) + 1)  # + Unfiled
            for row in rows:
                self.assertEqual(row.count(":"), 2, f"malformed catalog row: {row}")
        finally:
            shutil.rmtree(directory, ignore_errors=True)


class TestApiUrls(unittest.TestCase):
    def setUp(self):
        self.api = _load("api")
        self.client = self.api.ApiClient(
            "https://example.onrender.com/", token="pf_test"
        )

    def test_trailing_slash_is_normalised(self):
        self.assertEqual(self.client.base_url, "https://example.onrender.com")

    def test_empty_params_are_dropped(self):
        url = self.client._url("/api/x", {"a": 1, "b": None, "c": ""})
        self.assertIn("a=1", url)
        self.assertNotIn("b=", url)
        self.assertNotIn("c=", url)

    def test_token_is_sent_as_bearer(self):
        self.assertEqual(self.client._headers()["Authorization"], "Bearer pf_test")

    def test_no_auth_header_without_token(self):
        anon = self.api.ApiClient("https://example.com")
        self.assertNotIn("Authorization", anon._headers())

    def test_cold_timeout_until_something_answers(self):
        # The free Render tier can take ~60s to wake; budgeting only the warm
        # timeout for the first call would report a false failure.
        self.assertFalse(self.client.warm)
        self.assertGreater(self.api.COLD_TIMEOUT, self.api.WARM_TIMEOUT)


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestExportPresets(unittest.TestCase):
    """Static checks on export_settings.py.

    That module imports ``bpy`` at module scope, so it cannot be loaded here.
    Parsing it instead still catches the failure mode that matters: a preset
    naming a setting that does not exist. ``apply_settings`` skips unknown keys
    silently, so a typo there would not raise — it would just quietly fail to
    apply, and someone would ship an FBX to Unreal with smoothing left off.
    """

    @classmethod
    def setUpClass(cls):
        import ast

        with open(
            os.path.join(_PACKAGE_DIR, "export_settings.py"), encoding="utf-8"
        ) as handle:
            source = handle.read()
        tree = ast.parse(source)

        # Property names declared on the settings PropertyGroup. They are
        # annotated assignments (``name: BoolProperty(...)``), which is how
        # Blender expects properties to be declared.
        cls.declared = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef) and node.name == "ProjectFlowExportSettings":
                for stmt in node.body:
                    if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                        cls.declared.add(stmt.target.id)

        # BUILTIN_PRESETS is itself annotated, so it is an AnnAssign too.
        cls.presets = {}
        for node in ast.walk(tree):
            target_name = None
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                target_name = node.target.id
            elif isinstance(node, ast.Assign):
                names = [t.id for t in node.targets if isinstance(t, ast.Name)]
                target_name = names[0] if names else None

            if target_name != "BUILTIN_PRESETS" or not isinstance(node.value, ast.Dict):
                continue

            for key_node, value_node in zip(node.value.keys, node.value.values):
                if not isinstance(value_node, ast.Dict):
                    continue
                for sub_key, sub_val in zip(value_node.keys, value_node.values):
                    if sub_key.value == "settings" and isinstance(sub_val, ast.Dict):
                        cls.presets[key_node.value] = {
                            k.value: v.value
                            for k, v in zip(sub_val.keys, sub_val.values)
                            if isinstance(v, ast.Constant)
                        }

    def test_presets_were_found(self):
        self.assertTrue(self.declared, "no properties parsed")
        self.assertGreaterEqual(len(self.presets), 4)

    def test_every_preset_key_is_a_real_property(self):
        for preset_name, settings in self.presets.items():
            for key in settings:
                self.assertIn(
                    key,
                    self.declared,
                    f"preset '{preset_name}' sets '{key}', which is not a declared property",
                )

    def test_unreal_fbx_preset_avoids_the_known_import_problems(self):
        # These are the settings that cause visible defects in Unreal when
        # wrong: no smoothing groups, broken normal maps, junk skeleton bones,
        # and the classic 90-degree root rotation.
        settings = self.presets["UNREAL_FBX"]

        self.assertEqual(settings.get("file_format"), "FBX")
        self.assertEqual(settings.get("mesh_smooth_type"), "FACE")
        self.assertIs(settings.get("use_tangents"), True)
        self.assertIs(settings.get("add_leaf_bones"), False)
        self.assertEqual(settings.get("axis_forward"), "-Z")
        self.assertEqual(settings.get("axis_up"), "Y")
        # FBX cannot preview on the card, so the companion GLB must default on.
        self.assertIs(settings.get("also_attach_preview"), True)

    def test_gltf_presets_do_not_request_a_redundant_preview(self):
        # A GLB already previews on the card; attaching a second one would just
        # burn R2 storage, which is capped at 10GB on the free tier.
        for name in ("UNREAL_GLTF", "PREVIEW_GLB"):
            self.assertIs(
                self.presets[name].get("also_attach_preview"),
                False,
                f"{name} should not attach a duplicate preview",
            )


class TestOperatorWiring(unittest.TestCase):
    """Static guards against two mistakes that silently break the attach dialog.

    Neither shows up as an error at runtime — the export just quietly runs with
    default settings — so they are worth pinning down here.
    """

    @classmethod
    def setUpClass(cls):
        with open(os.path.join(_PACKAGE_DIR, "ops_boards.py"), encoding="utf-8") as fh:
            cls.ops = fh.read()
        with open(os.path.join(_PACKAGE_DIR, "ui.py"), encoding="utf-8") as fh:
            cls.ui = fh.read()

    def test_no_operator_invokes_another_operator_from_invoke(self):
        # Blender cannot open a props dialog from inside another operator's
        # invoke(); the inner invoke_props_dialog is skipped and execute() runs
        # immediately with defaults. This is what hid the export options.
        import ast

        tree = ast.parse(self.ops)
        for node in ast.walk(tree):
            if not isinstance(node, ast.FunctionDef) or node.name != "invoke":
                continue
            body = ast.get_source_segment(self.ops, node) or ""
            self.assertNotIn(
                "INVOKE_DEFAULT",
                body,
                "an invoke() calls another operator with INVOKE_DEFAULT; its "
                "dialog will not open",
            )

    def test_advance_flag_does_not_persist_between_clicks(self):
        # Blender remembers operator properties between invocations. Without
        # SKIP_SAVE, one "Attach & Move" leaves the flag set and the next
        # "Attach Only" silently advances the card too.
        start = self.ops.index("advance: BoolProperty(")
        block = self.ops[start:start + 500]
        self.assertIn("SKIP_SAVE", block)

    def test_panel_sets_advance_explicitly_on_every_attach_button(self):
        # Relying on the default would reintroduce the persistence bug.
        buttons = self.ui.count('"projectflow.attach_selection"')
        assignments = self.ui.count("op.advance =")
        self.assertGreater(buttons, 0)
        self.assertEqual(
            buttons,
            assignments,
            "every attach button must set advance explicitly",
        )
