"""A rebuild must retain the runtime boundary and saved-capture contracts."""

import hashlib
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from haptiq.digital_twin import rebuild_joint_viewer as builder


class ViewerRebuildTests(unittest.TestCase):
    def test_rebuild_retains_assets_boundaries_dependencies_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            reference = b'{"profile":"fixture"}'
            data = {
                "reference_sha256": hashlib.sha256(reference).hexdigest(),
                "assets": {"hand": [{"vertices": [1, 2, 3]}]},
                "tactile_geometry": {"regions": []},
                "sensor_objects": [],
            }
            boundaries = {"points": [{"x": 1}], "note": "literal </script> text"}
            (root / "joint_geometry_profiles_for_codex.json").write_bytes(reference)
            (root / "hand_boundaries.json").write_text(json.dumps(boundaries), encoding="utf-8")
            (root / "joint_profiles.css").write_text(".fixture { color: red; }", encoding="utf-8")
            (root / "joint_profiles_panel.html").write_text(
                '<section id="savedCaptures"></section>', encoding="utf-8"
            )
            names = [
                "joint_pressure.js",
                "joint_kinematics.js",
                "tactile_points.js",
                "sensor_objects.js",
                "saved_contacts.js",
                "joint_profiles_ui.js",
                "toolkit_controls.js",
            ]
            for name in names:
                (root / name).write_text(f"/* module {name} */", encoding="utf-8")
            (root / "assets").mkdir()
            (root / "templates").mkdir()
            (root / "frontend").mkdir()
            (root / "assets/joint_profile_assets.json").write_text(
                json.dumps(data), encoding="utf-8"
            )
            (root / "templates/application_panel.html").write_text(
                "<p>application</p>", encoding="utf-8"
            )
            (root / "frontend/application.css").write_text("/* fixture */", encoding="utf-8")
            viewer = root / "hand_twin_6dof.html"
            (root / "templates/viewer.html").write_text(
                "<main>retained prefix</main>"
                + "{{JOINT_EXTENSION}}{{TOOLKIT_CONTROLS}}"
                + '<script src="sensor_identification/history.js"></script>',
                encoding="utf-8",
            )
            with (
                patch.object(builder, "ROOT", root),
                patch.object(builder, "build", return_value=data["tactile_geometry"]),
                patch.object(builder, "build_sensor_objects", return_value=data["sensor_objects"]),
            ):
                builder.main([])
                first = viewer.read_text(encoding="utf-8")
                viewer.unlink()
                builder.main([])
                builder.main(["--check"])
                self.assertEqual(viewer.read_text(encoding="utf-8"), first)

            def embedded(identity):
                match = re.search(
                    '<script id="' + identity + '" type="application/json">(.*?)</script>',
                    first,
                    re.S,
                )
                self.assertIsNotNone(match)
                return json.loads(match[1])

            self.assertEqual(embedded("jointProfileData"), data)
            self.assertEqual(embedded("handBoundaryData"), boundaries)
            self.assertIn('src="sensor_identification/boundaries.js"', first)
            self.assertIn('src="sensor_identification/history.js"', first)
            self.assertIn('id="savedCaptures"', first)
            self.assertIn("retained prefix", first)
            self.assertLess(
                first.index("module saved_contacts.js"), first.index("module joint_profiles_ui.js")
            )
            self.assertIn("module toolkit_controls.js", first)


if __name__ == "__main__":
    unittest.main()
