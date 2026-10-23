"""Validate incoming transport data without IO or shared state."""

import math

from haptiq.tactile import REGIONS

FIELDS = (
    "angles",
    "angles_set",
    "angles_act",
    "force_act",
    "position_act",
    "tactile",
    "tactile_regions",
    "tactile_means",
    "source",
    "simulated",
)


def vector(value, name, lo, hi):
    if value is None:
        return None
    if not isinstance(value, list) or len(value) != 6:
        raise ValueError(f"{name} must be a list of 6 numbers")
    vals = []
    for x in value:
        if (
            not isinstance(x, (float, int))
            or isinstance(x, bool)
            or not math.isfinite(x)
            or not lo <= x <= hi
        ):
            raise ValueError(f"{name} contains invalid values ({lo}..{hi})")
        vals.append(round(float(x), 3))
    return vals


def normalize(payload):
    if not isinstance(payload, dict):
        raise ValueError("Expected a JSON object")
    if "tactile_matrix" in payload:
        from haptiq.telemetry.adapter import datadict_payload

        payload = datadict_payload(
            payload,
            valid_regions=payload.get("tactile_valid"),
            simulated=payload.get("simulated", False),
        )
    out = {}
    for name in ("angles", "angles_set", "angles_act"):
        if name in payload:
            out[name] = vector(payload[name], name, 0, 1000)
    if "force_act" in payload:
        out["force_act"] = vector(payload["force_act"], "force_act", -4000, 4000)
    if "position_act" in payload:
        out["position_act"] = vector(payload["position_act"], "position_act", 0, 65535)
    if "tactile_means" in payload:
        means = payload["tactile_means"]
        if not isinstance(means, dict) or any(
            k not in REGIONS
            or isinstance(v, bool)
            or not isinstance(v, (int, float))
            or not math.isfinite(v)
            or not 0 <= v <= 4095
            for k, v in means.items()
        ):
            raise ValueError("Invalid region means")
        out["tactile_means"] = dict(means)
    if "source" in payload:
        if not isinstance(payload["source"], str) or len(payload["source"]) > 160:
            raise ValueError("Invalid data source")
        out["source"] = payload["source"]
    if "simulated" in payload:
        if type(payload["simulated"]) is not bool:
            raise ValueError("simulated must be boolean")
        out["simulated"] = payload["simulated"]
    if "tactile" in payload:
        t = payload["tactile"]
        if not isinstance(t, dict):
            raise ValueError("tactile must be an object")
        clean = {}
        for name, value in t.items():
            if name not in ("little", "ring", "middle", "index", "thumb", "palm"):
                continue
            if isinstance(value, dict):
                value = {k: v for k, v in value.items() if k in ("max", "mean")}
                if not all(
                    isinstance(v, (int, float))
                    and not isinstance(v, bool)
                    and math.isfinite(v)
                    and 0 <= v <= 4095
                    for v in value.values()
                ):
                    raise ValueError("Tactile values outside 0..4095")
            elif not (
                isinstance(value, (int, float))
                and not isinstance(value, bool)
                and math.isfinite(value)
                and 0 <= value <= 4095
            ):
                raise ValueError("Tactile values outside 0..4095")
            clean[name] = value
        out["tactile"] = clean
    if "tactile_regions" in payload:
        regions = payload["tactile_regions"]
        if not isinstance(regions, dict):
            raise ValueError("tactile_regions must be an object")
        clean = {}
        for key, matrix in regions.items():
            if key not in REGIONS:
                raise ValueError("Unbekannte Sensor region: " + key)
            rows, cols = REGIONS[key]
            if (
                not isinstance(matrix, list)
                or len(matrix) != rows
                or any(not isinstance(row, list) or len(row) != cols for row in matrix)
            ):
                raise ValueError("Wrong matrix dimensions: " + key)
            if any(
                not isinstance(v, (int, float))
                or isinstance(v, bool)
                or not math.isfinite(v)
                or not 0 <= v <= 4095
                for row in matrix
                for v in row
            ):
                raise ValueError("Sensor values outside 0..4095")
            clean[key] = matrix
        out["tactile_regions"] = clean
    # Optional run metadata is carried by the sender, never inferred from poses.
    for key in ("state", "source_id"):
        if key in payload:
            if not isinstance(payload[key], str) or not 1 <= len(payload[key]) <= 160:
                raise ValueError("Invalid " + key)
            out[key] = payload[key]
    if "sample_index" in payload:
        value = payload["sample_index"]
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 2**53 - 1:
            raise ValueError("Invalid sample_index")
        out["sample_index"] = value
    if "slip_detected" in payload:
        if type(payload["slip_detected"]) is not bool:
            raise ValueError("Invalid slip_detected")
        out["slip_detected"] = payload["slip_detected"]
    if not out:
        raise ValueError("No valid fields. Allowed: " + ", ".join(FIELDS))
    return out
