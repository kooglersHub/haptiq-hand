import argparse
import json
from dataclasses import asdict
from pathlib import Path

from haptiq.candidates import load_catalog
from haptiq.settings import data_directory

from .adapter import identify_frame, read_points
from .classifier import IdentificationConfig, identify_sensor
from .demo import synthetic_points, write_viewer
from .geometry import load_candidates


def main():
    parser = argparse.ArgumentParser(
        description="Offline tactile CAD identification; no hardware IO"
    )
    candidate_ids = [candidate.id for candidate in load_catalog()]
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--points", type=Path, help="Viewer frame JSON, point list JSON, or CSV")
    source.add_argument("--demo", choices=[*candidate_ids, "shared"], default=None)
    source.add_argument("--inspect", action="store_true")
    parser.add_argument("--units", choices=["mm", "m"], help="Required for bare point lists/CSV")
    parser.add_argument(
        "--calibrated", action="store_true", help="Assert physical calibration for bare lists only"
    )
    parser.add_argument("--tolerance-mm", type=float, default=1.5)
    parser.add_argument("--threshold", type=float, default=200.0)
    parser.add_argument("--output", type=Path, default=data_directory() / "offline_estimation")
    args = parser.parse_args()
    models = load_candidates()
    if args.inspect:
        print(json.dumps({n: m.report() for n, m in models.items()}, indent=2))
        return
    config = IdentificationConfig(tolerance_mm=args.tolerance_mm, pressure_threshold=args.threshold)
    units = "mm"
    if args.points:
        data = read_points(args.points)
        if isinstance(data, dict):
            result = identify_frame(
                data,
                models,
                tolerance_mm=args.tolerance_mm,
                calibrated=args.calibrated,
                pressure_threshold=args.threshold,
            )
            points, units = data.get("points", []), data.get("units", "mm")
            config = IdentificationConfig(
                coordinate_units=units,
                calibrated=args.calibrated and data.get("geometry_status") == "CALIBRATED",
                tolerance_mm=args.tolerance_mm,
                pressure_threshold=args.threshold,
            )
        else:
            if args.units is None:
                parser.error("--units required for bare point lists/CSV")
            units, points = args.units, data
            config = IdentificationConfig(
                coordinate_units=units,
                calibrated=args.calibrated,
                tolerance_mm=args.tolerance_mm,
                pressure_threshold=args.threshold,
            )
            result = identify_sensor(points, models, config)
    else:
        name = args.demo or candidate_ids[-1]
        points = synthetic_points(
            models[candidate_ids[0] if name == "shared" else name],
            region="shared" if name == "shared" else "full",
        )
        config = IdentificationConfig(
            calibrated=True, tolerance_mm=args.tolerance_mm, pressure_threshold=args.threshold
        )
        result = identify_sensor(points, models, config)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "result.json").write_text(
        json.dumps(result, indent=2, allow_nan=False), encoding="utf-8"
    )
    (args.output / "points.json").write_text(json.dumps(points, indent=2), encoding="utf-8")
    (args.output / "config.json").write_text(json.dumps(asdict(config), indent=2), encoding="utf-8")
    write_viewer(
        args.output / "viewer.html",
        points,
        models,
        result,
        threshold=args.threshold,
        coordinate_units=units,
    )
    print(json.dumps(result, indent=2, allow_nan=False))
    print("Viewer:", (args.output / "viewer.html").resolve())


if __name__ == "__main__":
    main()
