"""Verify wheel contents by importing only its extracted package outside the checkout."""

import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

directory = Path(sys.argv[1] if len(sys.argv) > 1 else "dist")
wheels = sorted(directory.glob("haptiq-*.whl"))
if len(wheels) != 1:
    raise SystemExit("Expected exactly one haptiq wheel")
with tempfile.TemporaryDirectory(prefix="haptiq-wheel-") as folder:
    with zipfile.ZipFile(wheels[0]) as wheel:
        source_root = Path(__file__).resolve().parents[1] / "src"
        for member in wheel.namelist():
            if not member.startswith("haptiq/") or member.endswith("/"):
                continue
            source = source_root / member
            if not source.is_file() or source.read_bytes() != wheel.read(member):
                raise SystemExit(
                    "Stale package member: "
                    + member
                    + "; remove the generated build/ directory and rebuild"
                )
        wheel.extractall(folder)
    code = r"""import importlib
import importlib.metadata
import json
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import haptiq
from haptiq.candidates import load_catalog
from haptiq.estimation.geometry import load_candidates
from haptiq.digital_twin.rebuild_joint_viewer import build_viewer
from haptiq.server.http import create_server
assert Path(haptiq.__file__).is_relative_to(sys.argv[1])
for candidate in load_catalog():
    assert candidate.source().is_file()
models = load_candidates()
assert len(models) >= 2
for entry in importlib.metadata.distribution("haptiq").entry_points:
    assert callable(entry.load()), entry
build_viewer(check=True)
with create_server(port=0, capture_directory=Path(sys.argv[1]) / "captures") as server:
    assert server.server_port > 0
for name, module in tuple(sys.modules.items()):
    if name.startswith("haptiq") and getattr(module, "__file__", None):
        assert Path(module.__file__).is_relative_to(sys.argv[1]), name
print("PASS wheel imports, entrypoints, CAD hashes, build consistency and isolated server")
"""
    subprocess.run([sys.executable, "-I", "-c", code, folder], cwd=folder, check=True)
