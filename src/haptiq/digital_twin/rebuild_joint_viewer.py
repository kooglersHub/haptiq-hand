"""Deterministically build the viewer from templates, modules and source assets."""

import argparse
import hashlib
import json
from pathlib import Path

from haptiq.digital_twin.build_sensor_objects import build as build_sensor_objects
from haptiq.digital_twin.build_tactile_geometry import build

ROOT = Path(__file__).resolve().parent
BEGIN = "<!-- JOINT PROFILES BEGIN -->"
END = "<!-- JOINT PROFILES END -->"


def packed(data):
    return json.dumps(data, separators=(",", ":")).replace("</", r"<\/")


def render(root=None):
    root = Path(root) if root is not None else ROOT
    template = (root / "templates/viewer.html").read_text(encoding="utf-8")
    for marker in ("{{JOINT_EXTENSION}}", "{{TOOLKIT_CONTROLS}}"):
        if template.count(marker) != 1:
            raise ValueError("Expected exactly one template marker: " + marker)
    data = json.loads((root / "assets/joint_profile_assets.json").read_text(encoding="utf-8"))
    digest = hashlib.sha256(
        (root / "joint_geometry_profiles_for_codex.json").read_bytes()
    ).hexdigest()
    if digest != data["reference_sha256"]:
        raise ValueError("Reference changed: verify matching geometry before rebuilding")
    data["tactile_geometry"] = build(data)
    data["sensor_objects"] = build_sensor_objects()
    boundaries = json.loads((root / "hand_boundaries.json").read_text(encoding="utf-8"))
    from haptiq.candidates import load_catalog
    from haptiq.contracts import ESTIMATOR_REVISION

    scripts = "\n".join(
        (root / name).read_text(encoding="utf-8")
        for name in (
            "joint_pressure.js",
            "joint_kinematics.js",
            "tactile_points.js",
            "sensor_objects.js",
            "saved_contacts.js",
            "joint_profiles_ui.js",
        )
    )
    extension = "\n".join(
        [
            BEGIN,
            "<style>" + (root / "joint_profiles.css").read_text(encoding="utf-8") + "</style>",
            "<style>"
            + (root / "frontend/application.css").read_text(encoding="utf-8")
            + "</style>",
            (root / "joint_profiles_panel.html").read_text(encoding="utf-8"),
            '<template id="applicationPanel">'
            + (root / "templates/application_panel.html").read_text(encoding="utf-8")
            + "</template>",
            '<script id="applicationConfig" type="application/json">'
            + packed({"estimator_revision": ESTIMATOR_REVISION})
            + "</script>",
            '<script id="candidateCatalog" type="application/json">'
            + packed([candidate.metadata() for candidate in load_catalog()])
            + "</script>",
            '<script src="frontend/candidates.js"></script>',
            '<script src="frontend/runtime.js"></script>',
            '<script src="sensor_identification/boundaries.js"></script>',
            '<script id="handBoundaryData" type="application/json">'
            + packed(boundaries)
            + "</script>",
            '<script id="jointProfileData" type="application/json">' + packed(data) + "</script>",
            "<script>" + scripts + "</script>",
            END,
        ]
    )
    controller = (
        '<script id="toolkitControls">'
        + (root / "toolkit_controls.js").read_text(encoding="utf-8")
        + "</script>"
    )
    return template.replace("{{TOOLKIT_CONTROLS}}", controller).replace(
        "{{JOINT_EXTENSION}}", extension
    ), data["tactile_geometry"]


def build_viewer(root=None, *, output=None, check=False):
    root = Path(root) if root is not None else ROOT
    output = Path(output) if output is not None else root
    html, geometry = render(root)
    products = {
        "hand_twin_6dof.html": html,
        "tactile_geometry.json": json.dumps(geometry, indent=2) + "\n",
    }
    if check:
        stale = [
            name
            for name, text in products.items()
            if not (output / name).is_file() or (output / name).read_text(encoding="utf-8") != text
        ]
        if stale:
            raise ValueError("Generated viewer is stale: " + ", ".join(stale))
    else:
        output.mkdir(parents=True, exist_ok=True)
        for name, text in products.items():
            (output / name).write_text(text, encoding="utf-8")
    return output / "hand_twin_6dof.html"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="Fail when committed build products are stale"
    )
    args = parser.parse_args(argv)
    build_viewer(check=args.check)
    print(
        "Viewer matches sources."
        if args.check
        else "Built viewer from independent source assets and templates."
    )


if __name__ == "__main__":
    main()
