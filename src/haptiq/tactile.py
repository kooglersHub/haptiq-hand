"""Canonical wire-order region names and dimensions for the RH56DFTP."""

REGIONS = {}
for finger in ("little", "ring", "middle", "index"):
    for zone, shape in [("tip", (3, 3)), ("nail", (12, 8)), ("pad", (10, 8))]:
        REGIONS[f"{finger}_{zone}"] = shape
for zone, shape in [("tip", (3, 3)), ("nail", (12, 8)), ("mid", (3, 3)), ("pad", (12, 8))]:
    REGIONS[f"thumb_{zone}"] = shape
REGIONS["palm"] = (8, 14)
