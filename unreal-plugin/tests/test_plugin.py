"""Tests for the Unreal plugin's logic, run without Unreal.

``api.py`` imports no engine module at all — that is a deliberate rule, since
it also keeps the client usable from a worker thread. The rest of the plugin
does import ``unreal``, so a stub stands in for it here.

Stubbing rather than skipping matters: hash parsing and asset-name
sanitisation are where quiet damage would come from. A name Unreal rejects
produces a mangled asset, and a mis-parsed hash means either re-downloading
everything or, worse, serving the wrong file.

Run with:  python -m unittest discover -s tests
"""

from __future__ import annotations

import importlib.util
import os
import sys
import types
import unittest

_PYTHON_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "ProjectFlow", "Content", "Python",
)


def _install_unreal_stub(tmp_dir: str) -> None:
    """Puts a minimal fake ``unreal`` module on sys.modules."""
    unreal = types.ModuleType("unreal")

    class _Paths:
        @staticmethod
        def project_saved_dir():
            return tmp_dir

        @staticmethod
        def convert_relative_path_to_full(path):
            return path

    unreal.Paths = _Paths
    unreal.log = lambda *a, **k: None
    unreal.log_warning = lambda *a, **k: None
    unreal.log_error = lambda *a, **k: None

    class _EditorAssetLibrary:
        _tags = {}
        _assets = set()

        @classmethod
        def does_asset_exist(cls, path):
            return path in cls._assets

        @classmethod
        def load_asset(cls, path):
            return path if path in cls._assets else None

        @classmethod
        def get_metadata_tag(cls, asset, tag):
            return cls._tags.get((asset, tag), "")

        @classmethod
        def set_metadata_tag(cls, asset, tag, value):
            cls._tags[(asset, tag)] = value

        @classmethod
        def save_loaded_asset(cls, asset, only_if_is_dirty=True):
            return True

    unreal.EditorAssetLibrary = _EditorAssetLibrary
    sys.modules["unreal"] = unreal


def _load(module_name: str):
    path = os.path.join(_PYTHON_DIR, "projectflow", f"{module_name}.py")
    spec = importlib.util.spec_from_file_location(f"_pf_{module_name}", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


PUBLIC_R2 = "https://pub-ccb200eead884efbac751122dac022ed.r2.dev"
DIGEST = "b" * 64


class TestApiIsEngineFree(unittest.TestCase):
    """The HTTP client must import with no Unreal present.

    It is shared in shape with the Blender add-on's client and is the one
    module that could reasonably be called off the editor thread, where
    touching the engine API takes the process down rather than raising.
    """

    def test_imports_without_unreal(self):
        saved = sys.modules.pop("unreal", None)
        try:
            module = _load("api")
            self.assertTrue(hasattr(module, "ApiClient"))
        finally:
            if saved is not None:
                sys.modules["unreal"] = saved

    def test_url_and_headers(self):
        api = _load("api")
        client = api.ApiClient("https://example.onrender.com/", token="pf_x")

        self.assertEqual(client.base_url, "https://example.onrender.com")
        self.assertEqual(client._headers()["Authorization"], "Bearer pf_x")

        url = client._url("/api/x", {"a": 1, "b": None, "c": ""})
        self.assertIn("a=1", url)
        self.assertNotIn("b=", url)

    def test_cold_timeout_exceeds_warm(self):
        # The free Render tier can take ~60s to wake; budgeting the warm
        # timeout for the first call would report a false failure.
        api = _load("api")
        self.assertGreater(api.COLD_TIMEOUT, api.WARM_TIMEOUT)


class TestImporterLogic(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import tempfile

        cls.tmp = tempfile.mkdtemp(prefix="pf-ue-test-")
        _install_unreal_stub(cls.tmp)
        cls.api = _load("api")
        sys.modules["_pf_api"] = cls.api
        cls.config = _load("config")
        # importer does `from . import api, config`; give it a package to find.
        pkg = types.ModuleType("projectflow")
        pkg.__path__ = [os.path.join(_PYTHON_DIR, "projectflow")]
        pkg.api = cls.api
        pkg.config = cls.config
        sys.modules["projectflow"] = pkg
        sys.modules["projectflow.api"] = cls.api
        sys.modules["projectflow.config"] = cls.config

        spec = importlib.util.spec_from_file_location(
            "projectflow.importer",
            os.path.join(_PYTHON_DIR, "projectflow", "importer.py"),
        )
        cls.importer = importlib.util.module_from_spec(spec)
        sys.modules["projectflow.importer"] = cls.importer
        spec.loader.exec_module(cls.importer)

    @classmethod
    def tearDownClass(cls):
        import shutil

        shutil.rmtree(cls.tmp, ignore_errors=True)

    # -- hashes ---------------------------------------------------------

    def test_parses_content_hash(self):
        self.assertEqual(
            self.importer.parse_hash(f"{PUBLIC_R2}/files/{DIGEST}.fbx"),
            (DIGEST, ".fbx"),
        )

    def test_rejects_non_cas_url(self):
        self.assertIsNone(
            self.importer.parse_hash(f"{PUBLIC_R2}/attachments/model.fbx")
        )

    def test_same_content_maps_to_one_cache_file(self):
        a = self.importer.cache_path(f"{PUBLIC_R2}/files/{DIGEST}.fbx", "crate_a.fbx")
        b = self.importer.cache_path(f"{PUBLIC_R2}/files/{DIGEST}.fbx", "crate_b.fbx")
        self.assertEqual(a, b)

    # -- names ----------------------------------------------------------

    def test_strips_characters_unreal_rejects(self):
        for raw, expected in [
            ("crate 01.fbx", "crate_01"),
            ("wall-panel.v2.fbx", "wall_panel_v2"),
            ("Chëst (large).fbx", "Ch_st__large"),
        ]:
            self.assertEqual(self.importer.sanitize_name(raw), expected)

    def test_name_never_starts_with_a_digit(self):
        # Unreal rejects object names beginning with a number.
        name = self.importer.sanitize_name("3d_crate.fbx")
        self.assertFalse(name[0].isdigit())

    def test_empty_name_still_produces_something_valid(self):
        self.assertTrue(self.importer.sanitize_name("___.fbx"))

    # -- destinations ---------------------------------------------------

    def test_folder_tree_maps_into_content_path(self):
        self.config.set_value("destination_root", "/Game/PF")
        self.config.set_value("mirror_library_folders", True)
        self.assertEqual(
            self.importer.destination_for("Environment/Props"),
            "/Game/PF/Environment/Props",
        )

    def test_mirroring_can_be_turned_off(self):
        self.config.set_value("destination_root", "/Game/PF")
        self.config.set_value("mirror_library_folders", False)
        self.assertEqual(self.importer.destination_for("Environment/Props"), "/Game/PF")
        self.config.set_value("mirror_library_folders", True)

    def test_unsupported_extension_is_refused_before_download(self):
        # Reaching the download would waste bandwidth on a file no importer
        # can read, on a 10GB storage budget.
        result = self.importer.import_file(
            file_url=f"{PUBLIC_R2}/files/{DIGEST}.blend",
            file_name="scene.blend",
        )
        self.assertFalse(result.ok)
        self.assertIn("not importable", result.error)


class TestConfig(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import tempfile

        cls.tmp = tempfile.mkdtemp(prefix="pf-ue-cfg-")
        _install_unreal_stub(cls.tmp)
        cls.config = _load("config")

    @classmethod
    def tearDownClass(cls):
        import shutil

        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_defaults_survive_a_partial_file(self):
        self.config.set_value("server_url", "https://example.test")
        settings = self.config.load_settings()
        self.assertEqual(settings["server_url"], "https://example.test")
        # A key never written must still come back from DEFAULTS.
        self.assertIn("destination_root", settings)

    def test_token_round_trip_and_clear(self):
        self.config.save_token("pf_secret")
        self.assertEqual(self.config.load_token(), "pf_secret")
        self.config.clear_token()
        self.assertIsNone(self.config.load_token())

    def test_credentials_live_outside_content(self):
        # Anything under Content risks being cooked into a build or committed.
        self.config.save_token("pf_x")
        path = self.config._credentials_path()
        self.assertNotIn(f"{os.sep}Content{os.sep}", path)
        self.config.clear_token()


if __name__ == "__main__":
    unittest.main(verbosity=2)
