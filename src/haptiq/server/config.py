"""One local address for telemetry, taxels, the viewer and estimation."""

import hashlib
from pathlib import Path

from haptiq.settings import HOST, PORT, URL, workspace_root

__all__ = ["HOST", "PORT", "URL", "WORKSPACE", "source_signature"]

WORKSPACE = workspace_root()


def source_signature():
    """Compare running code with files on disk without reusing stale modules."""
    folder = Path(__file__).resolve().parents[1]
    digest = hashlib.sha256()
    extensions = {".py", ".js", ".cjs", ".html", ".css", ".json", ".stl", ".urdf"}
    for path in sorted(folder.rglob("*")):
        if path.is_file() and path.suffix in extensions and "__pycache__" not in path.parts:
            digest.update(path.relative_to(folder).as_posix().encode("utf-8"))
            digest.update(path.read_bytes())
    return digest.hexdigest()
