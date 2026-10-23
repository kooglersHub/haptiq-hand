"""Shared sensor catalog for CAD loading, browser geometry and CLI choices."""

import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path

from haptiq.settings import MODEL_DIRECTORY


@dataclass(frozen=True)
class Candidate:
    id: str
    viewer_id: str
    name: str
    file: str
    color: str
    units: str
    sha256: str

    def metadata(self):
        return asdict(self)

    def source(self, directory=MODEL_DIRECTORY):
        directory = Path(directory).resolve()
        source = (directory / self.file).resolve()
        if not source.is_relative_to(directory):
            raise ValueError("Candidate CAD path escapes its model directory")
        if hashlib.sha256(source.read_bytes()).hexdigest() != self.sha256:
            raise ValueError(
                f"CAD hash mismatch: {self.id}; verify geometry before updating the catalog"
            )
        return source


def load_catalog(directory=MODEL_DIRECTORY):
    records = json.loads((Path(directory) / "catalog.json").read_text(encoding="utf-8"))
    if not isinstance(records, list) or len(records) < 2:
        raise ValueError("The catalog requires at least two candidate models")
    candidates = tuple(Candidate(**record) for record in records)
    for field in ("id", "viewer_id"):
        values = [getattr(candidate, field) for candidate in candidates]
        if len(set(values)) != len(values) or any(
            not isinstance(value, str) or not value for value in values
        ):
            raise ValueError(f"Candidate {field} values must be unique, nonempty strings")
    for candidate in candidates:
        if candidate.id in {"AMBIGUOUS", "current", "shared"} or candidate.units not in {"mm", "m"}:
            raise ValueError("Reserved candidate ID or unsupported source units")
        if any(not isinstance(value, str) or not value for value in asdict(candidate).values()):
            raise ValueError("Candidate metadata must contain nonempty strings")
    return candidates
