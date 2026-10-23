"""Embed the two repository STL parts, without changing their shapes/topology."""

import hashlib
import struct
from pathlib import Path

from haptiq.candidates import load_catalog
from haptiq.settings import MODEL_DIRECTORY


def build(directory=None):
    directory = Path(directory) if directory else MODEL_DIRECTORY
    models = []
    for candidate in load_catalog(directory):
        identity, label, filename, color = (
            candidate.viewer_id,
            candidate.name,
            candidate.file,
            candidate.color,
        )
        blob = candidate.source(directory).read_bytes()
        scale = 0.001 if candidate.units == "mm" else 1.0
        if len(blob) < 84:
            raise ValueError("Invalid binary STL: " + filename)
        count = struct.unpack_from("<I", blob, 80)[0]
        if not count or len(blob) != 84 + 50 * count:
            raise ValueError("Invalid STL triangle count: " + filename)
        vertices, indices, lookup = [], [], {}
        for face in range(count):
            for point in struct.iter_unpack("<3f", blob[84 + 50 * face + 12 : 84 + 50 * face + 48]):
                if point not in lookup:
                    lookup[point] = len(vertices)
                    vertices.append(point)
                indices.append(lookup[point])
        low = [min(p[k] for p in vertices) for k in range(3)]
        high = [max(p[k] for p in vertices) for k in range(3)]
        center = [(a + b) / 2 for a, b in zip(low, high)]
        models.append(
            {
                "id": identity,
                "candidate_id": candidate.id,
                "name": label,
                "color": color,
                "source": "src/haptiq/assets/models/" + filename,
                "source_sha256": hashlib.sha256(blob).hexdigest(),
                "units": "metres",
                "source_unit_scale_to_metres": scale,
                "source_center_mm": [value * scale * 1000 for value in center],
                "source_bounds_mm": [
                    [value * scale * 1000 for value in bound] for bound in (low, high)
                ],
                "vertices": [
                    round((p[k] - center[k]) * scale, 10) for p in vertices for k in range(3)
                ],
                "indices": indices,
            }
        )
    return models
