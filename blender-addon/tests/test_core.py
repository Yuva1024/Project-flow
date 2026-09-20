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
