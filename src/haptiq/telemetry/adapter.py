"""Convert forwarded raw matrix packets into canonical viewer telemetry."""

from haptiq.tactile import REGIONS
from haptiq.telemetry.publisher import twin_payload


def datadict_payload(payload, *, valid_regions=None, simulated=False):
    matrix = payload.get("tactile_matrix")
    if (
        not isinstance(matrix, list)
        or len(matrix) != 112
        or any(not isinstance(row, list) or len(row) != 17 for row in matrix)
    ):
        raise ValueError("Expected a complete 112 x 17 tactile matrix")
    if valid_regions is None:
        # Missing validity is unknown, never valid zero/contact evidence.
        flags = [False] * 17
    elif isinstance(valid_regions, dict):
        if any(
            key not in REGIONS or type(value) is not bool for key, value in valid_regions.items()
        ):
            raise ValueError("Invalid tactile region validity")
        flags = [valid_regions.get(key, False) for key in REGIONS]
    elif (
        isinstance(valid_regions, list)
        and len(valid_regions) == 17
        and all(type(flag) is bool for flag in valid_regions)
    ):
        flags = valid_regions
    else:
        raise ValueError("Expected 17 explicit tactile validity flags")
    if type(simulated) is not bool:
        raise ValueError("simulated must be boolean")
    result = twin_payload(
        {
            "tactile": matrix,
            "tactile_valid": flags,
            "simulated": simulated,
            "angles": payload.get("angles_act", payload.get("angles")),
            "forces": payload.get("force_act", payload.get("forces")),
        }
    )
    for key in ("state", "source", "source_id", "sample_index", "slip_detected"):
        if key in payload:
            result[key] = payload[key]
    return result
